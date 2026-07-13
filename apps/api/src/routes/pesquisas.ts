import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { ItemPlanilhaEntrada } from '@licitapreco/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { autenticar } from '../middleware/auth.js';
import { ConflitoError, NaoEncontradoError, ValidacaoError } from '../utils/errors.js';
import { checarEscopoPesquisa, exigirAcaoPesquisa } from '../policies/pesquisa.policy.js';
import { registrarAuditoria } from '../services/auditoria.service.js';
import { lerPlanilha, lerListaColada } from '../services/planilha/leitura.service.js';
import { planejarImportacao } from '../services/planilha/importacao.service.js';
import {
  cabecalhosDeprecacaoConfirmacao,
  schemaConfirmacaoLegada,
} from '../services/planilha/compatibilidade-legado.service.js';
import { gerarPlanilha } from '../services/planilha/geracao.service.js';
import { lerArquivoArmazenado, salvarArquivo } from '../services/storage.service.js';
import { enfileirarPesquisa, buscarJobPorId } from '../services/queue/pesquisa.queue.js';
import { progressStore } from '../services/queue/progressStore.js';
import { recalcularItemECobertura } from '../services/cotacao/recalculo.service.js';
import { enviarEmail } from '../services/email.service.js';
import { buscarPrecosAtualizados } from '../services/catalogo/busca-online.service.js';
import { schemaEscopoBuscaPncp } from '../services/catalogo/escopo-pncp.js';
import {
  montarChaveDedupeEvidencia,
  montarChaveIndependenciaEvidencia,
  montarChaveOrigem,
  sincronizarEvidenciaCotacaoDireta,
  unidadesCompativeis,
} from '../services/cotacao/evidencia.service.js';
import {
  reabrirPesquisaEmitida,
  transicionarPesquisa,
} from '../services/pesquisa/ciclo-vida.service.js';
import {
  criarPreviaDocumento,
  emissaoVersionadaHabilitada,
  emitirDocumentoPesquisa,
} from '../services/documento/emissao.service.js';
import { registrarMetrica } from '../services/metricas.service.js';

function escaparHtml(valor: string): string {
  return valor.replace(
    /[&<>'"]/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char,
  );
}

function montarSolicitacaoCotacao(dados: {
  fornecedor: string;
  item: string;
  quantidade: string;
  unidade: string;
  justificativa: string;
  validade?: Date | null;
}) {
  const validade = dados.validade ? dados.validade.toLocaleDateString('pt-BR') : 'não informada';
  const assunto = `Solicitação de cotação — ${dados.item}`;
  const texto = `Prezados,\n\nSolicitamos cotação para: ${dados.item}\nQuantidade: ${dados.quantidade} ${dados.unidade}\nValidade solicitada: ${validade}\nJustificativa: ${dados.justificativa}\n\nFavor informar preço unitário e validade da proposta.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1f2937"><h2>Solicitação de cotação</h2><p>Prezados <strong>${escaparHtml(dados.fornecedor)}</strong>,</p><p>Solicitamos proposta para o item abaixo:</p><table style="border-collapse:collapse"><tr><td style="padding:6px;border:1px solid #ddd"><strong>Item</strong></td><td style="padding:6px;border:1px solid #ddd">${escaparHtml(dados.item)}</td></tr><tr><td style="padding:6px;border:1px solid #ddd"><strong>Quantidade</strong></td><td style="padding:6px;border:1px solid #ddd">${escaparHtml(dados.quantidade)} ${escaparHtml(dados.unidade)}</td></tr><tr><td style="padding:6px;border:1px solid #ddd"><strong>Validade</strong></td><td style="padding:6px;border:1px solid #ddd">${validade}</td></tr></table><p>${escaparHtml(dados.justificativa)}</p><p>Favor informar o preço unitário e a validade da proposta.</p></div>`;
  return { assunto, texto, html };
}

const router: Router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel') ||
      file.originalname.endsWith('.xlsx');
    if (!ok) {
      cb(new ValidacaoError('Apenas arquivos .xlsx são aceitos.'));
      return;
    }
    cb(null, true);
  },
});
const uploadCotacao = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/');
    if (!ok) {
      cb(new ValidacaoError('Apenas arquivos PDF ou imagens são aceitos.'));
      return;
    }
    cb(null, true);
  },
});

const estadosEditaveis = new Set([
  'AGUARDANDO',
  'RASCUNHO',
  'EM_REVISAO',
  'CONCLUIDA',
  'APROVADA',
  'EMITIDA',
  'ERRO',
]);

function validarPesquisaEditavel(status: string): void {
  if (!estadosEditaveis.has(status)) {
    throw new ConflitoError('A pesquisa não pode ser alterada no estado atual.');
  }
}

const schemaItemBase = z.object({
  nome: z.string().trim().min(2).max(200),
  descricao: z.string().trim().min(2).max(2000),
  especificacao: z.string().trim().max(3000).optional(),
  marcaModelo: z.string().trim().max(300).optional(),
  localEntrega: z.string().trim().max(500).optional(),
  prazoEntregaDias: z.number().int().min(0).max(3650).optional(),
  garantia: z.string().trim().max(1000).optional(),
  caracteristicasObrigatorias: z.string().trim().max(5000).optional(),
  caracteristicasDesejaveis: z.string().trim().max(5000).optional(),
  quantidade: z.number().positive(),
  unidadeMedida: z.string().trim().min(1).max(50),
  cidade: z.string().trim().max(120).optional(),
  uf: z.string().trim().length(2).optional(),
  camposExtras: z.record(z.union([z.string(), z.number(), z.null()])).default({}),
});

const schemaItemImportacao = schemaItemBase.extend({
  sequencia: z.number().int().min(1),
});

async function planejarPreviewImportacao(pesquisaId: string, itens: ItemPlanilhaEntrada[]) {
  const existentes = await prisma.itemPesquisa.findMany({
    where: { pesquisaId },
    select: {
      id: true,
      sequencia: true,
      nome: true,
      descricao: true,
      quantidade: true,
      unidadeMedida: true,
      cidade: true,
      uf: true,
      camposExtras: true,
    },
  });
  return planejarImportacao(
    itens,
    existentes.map((item) => ({
      ...item,
      quantidade: Number(item.quantidade),
    })),
  );
}

// GET /api/pesquisas
router.get('/', autenticar, async (req, res, next) => {
  try {
    const { pagina, limite, status } = z
      .object({
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(50).default(10),
        status: z
          .enum([
            'AGUARDANDO',
            'PROCESSANDO',
            'CONCLUIDA',
            'RASCUNHO',
            'COLETANDO',
            'EM_REVISAO',
            'APROVADA',
            'EMITIDA',
            'ERRO',
          ])
          .optional(),
      })
      .parse(req.query);

    const where = {
      ...(req.usuario.role !== 'ADMIN' ? { userId: req.usuario.id } : {}),
      ...(status ? { status } : {}),
    };

    const [total, pesquisas] = await Promise.all([
      prisma.pesquisa.count({ where }),
      prisma.pesquisa.findMany({
        where,
        select: {
          id: true,
          titulo: true,
          status: true,
          totalItens: true,
          itensComCotacao: true,
          itensSemCotacao: true,
          itensComErro: true,
          resumoCobertura: true,
          valorTotalEstimado: true,
          createdAt: true,
          concluidaEm: true,
          user: { select: { id: true, nome: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagina - 1) * limite,
        take: limite,
      }),
    ]);

    res.json({ total, pagina, limite, pesquisas });
  } catch (e) {
    next(e);
  }
});

// POST /api/pesquisas
router.post('/', autenticar, exigirAcaoPesquisa('CRIAR'), async (req, res, next) => {
  try {
    const data = z
      .object({
        titulo: z.string().min(3).max(200),
        descricao: z.string().max(500).optional(),
        municipio: z.string().optional(),
        uf: z.string().length(2).optional(),
        modoEntrada: z.enum(['MANUAL', 'PLANILHA']).default('MANUAL'),
        numeroProcesso: z.string().trim().max(100).optional(),
        orgaoSetor: z.string().trim().max(200).optional(),
        responsavelPesquisa: z.string().trim().max(200).optional(),
        secretariaSolicitante: z.string().trim().max(200).optional(),
        unidadeAdministrativa: z.string().trim().max(200).optional(),
        responsavelRevisao: z.string().trim().max(200).optional(),
        responsavelAprovacao: z.string().trim().max(200).optional(),
        exercicioFinanceiro: z.number().int().min(2000).max(2200).optional(),
        modalidade: z.string().trim().max(200).optional(),
        prazoDesejado: z.coerce.date().optional(),
        dotacaoOrcamentaria: z.string().trim().max(500).optional(),
        observacoesGerais: z.string().trim().max(5000).optional(),
      })
      .parse(req.body);

    const [config, fontes] = await Promise.all([
      prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } }),
      prisma.fonteCotacao.findMany({
        where: { ativo: true, statusValidacao: 'VALIDA' },
        select: { id: true, slug: true, nome: true, tipo: true, fundamentacaoArtigo: true },
        orderBy: { ordem: 'asc' },
      }),
    ]);
    const pesquisa = await prisma.pesquisa.create({
      data: {
        ...data,
        status: 'RASCUNHO',
        userId: req.usuario.id,
        municipio: data.municipio || config?.municipio || 'Cataguases',
        uf: (data.uf || config?.uf || 'MG').toUpperCase(),
        metodoCalculoSnapshot: config?.metodoCalculo ?? 'MENOR_PRECO',
        metaOrigensMinima: config?.minFontesCompleta ?? 3,
        limiteOutlierSnapshot: config?.limiteOutlierPercentual ?? 30,
        fontesSnapshot: fontes,
      },
    });

    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'PESQUISA_CRIADA',
      entidade: 'Pesquisa',
      entidadeId: pesquisa.id,
      ip: req.ip,
    });
    res.status(201).json(pesquisa);
  } catch (e) {
    next(e);
  }
});

// GET /api/pesquisas/compartilhada/:link — acesso público
router.get('/compartilhada/:link', async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({
      where: { linkCompartilhamento: req.params.link },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        status: true,
        totalItens: true,
        itensComCotacao: true,
        itensSemCotacao: true,
        itensComErro: true,
        resumoCobertura: true,
        municipio: true,
        uf: true,
        fundamentacaoLegal: true,
        valorTotalEstimado: true,
        concluidaEm: true,
        createdAt: true,
        updatedAt: true,
        compartilhada: true,
        itens: {
          orderBy: { sequencia: 'asc' },
          select: {
            sequencia: true,
            nome: true,
            descricao: true,
            quantidade: true,
            unidadeMedida: true,
            precoReferencia: true,
            precoTotal: true,
            statusItem: true,
            cotacoes: {
              select: {
                fonte: true,
                preco: true,
                referencia: true,
                fundamentacaoArtigo: true,
                dataConsulta: true,
              },
            },
          },
        },
      },
    });
    if (!pesquisa || !pesquisa.compartilhada)
      throw new NaoEncontradoError('Pesquisa não encontrada ou não compartilhada.');
    res.json(pesquisa);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/documentos/previa', autenticar, async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    const snapshot = await criarPreviaDocumento(pesquisa.id, req.usuario.id);
    const pendentes = snapshot.itens
      .flatMap((item) => item.evidencias)
      .filter((evidencia) => evidencia.status === 'PENDENTE').length;
    const itensSemDecisao = snapshot.itens
      .filter((item) => {
        const resultado = item.resultadoCalculo as { completa?: boolean } | null;
        return !resultado || (resultado.completa === false && !item.justificativaCobertura);
      })
      .map((item) => ({ itemId: item.id, sequencia: item.sequencia, descricao: item.descricao }));
    const recursoEmissaoHabilitado = emissaoVersionadaHabilitada(req.usuario.id);
    res.json({
      snapshot,
      recursoEmissaoHabilitado,
      podeEmitir:
        recursoEmissaoHabilitado &&
        pesquisa.status === 'APROVADA' &&
        pendentes === 0 &&
        itensSemDecisao.length === 0,
      bloqueios: {
        featureFlag: recursoEmissaoHabilitado
          ? null
          : 'Emissão versionada restrita ao grupo piloto.',
        status:
          pesquisa.status === 'APROVADA'
            ? null
            : `A pesquisa deve estar APROVADA; estado atual: ${pesquisa.status}.`,
        evidenciasPendentes: pendentes,
        itensSemDecisao,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/documentos', autenticar, async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    const documentos = await prisma.documentoPesquisa.findMany({
      where: { pesquisaId: pesquisa.id },
      select: {
        id: true,
        versao: true,
        arquivoXlsxUrl: true,
        arquivoPdfUrl: true,
        emitidoEm: true,
        emitidoPor: { select: { id: true, nome: true } },
      },
      orderBy: { versao: 'desc' },
    });
    res.json(documentos);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/emitir', autenticar, exigirAcaoPesquisa('EMITIR'), async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    const documento = await emitirDocumentoPesquisa({
      pesquisaId: pesquisa.id,
      usuarioId: req.usuario.id,
      ip: req.ip,
    });
    res.status(201).json(documento);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/documentos/:documentoId/xlsx', autenticar, async (req, res, next) => {
  try {
    const documento = await prisma.documentoPesquisa.findFirst({
      where: { id: req.params.documentoId, pesquisaId: req.params.id },
      include: { pesquisa: true },
    });
    if (!documento) throw new NaoEncontradoError('Versão do documento não encontrada.');
    checarEscopoPesquisa(documento.pesquisa.userId, req.usuario.id, req.usuario.role);
    if (!documento.arquivoXlsxUrl)
      throw new NaoEncontradoError('Arquivo XLSX não disponível nesta versão.');
    if (/^https?:\/\//.test(documento.arquivoXlsxUrl)) {
      res.redirect(documento.arquivoXlsxUrl);
      return;
    }
    const chave = documento.arquivoXlsxUrl.split('/').filter(Boolean).at(-1);
    if (!chave) throw new NaoEncontradoError('Referência do arquivo inválida.');
    const arquivo = await lerArquivoArmazenado(chave);
    if (!arquivo)
      throw new NaoEncontradoError('Arquivo da versão não encontrado no armazenamento.');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dossie-${documento.pesquisaId}-v${documento.versao}.xlsx"`,
    );
    res.send(arquivo);
  } catch (e) {
    next(e);
  }
});

// GET /api/pesquisas/:id
router.get('/:id', autenticar, async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, nome: true } },
        itens: {
          orderBy: { sequencia: 'asc' },
          include: {
            cotacoes: true,
            evidencias: { orderBy: { dataColeta: 'desc' } },
            cotacoesDiretas: {
              include: { fornecedor: { select: { id: true, razaoSocial: true, cnpj: true } } },
            },
          },
        },
      },
    });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    res.json(pesquisa);
  } catch (e) {
    next(e);
  }
});

// PUT /api/pesquisas/:id
router.put('/:id', autenticar, exigirAcaoPesquisa('EDITAR'), async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);

    const data = z
      .object({
        titulo: z.string().min(3).max(200).optional(),
        descricao: z.string().max(500).optional(),
        municipio: z.string().optional(),
        uf: z.string().length(2).optional(),
        compartilhada: z.boolean().optional(),
        fundamentacaoLegal: z.string().optional(),
        metodoCalculoSnapshot: z.enum(['MEDIA', 'MEDIANA', 'MENOR_PRECO']).optional(),
        metaOrigensMinima: z.number().int().min(1).max(20).optional(),
        limiteOutlierSnapshot: z.number().int().min(0).max(1000).optional(),
        numeroProcesso: z.string().trim().max(100).optional(),
        orgaoSetor: z.string().trim().max(200).optional(),
        responsavelPesquisa: z.string().trim().max(200).optional(),
        secretariaSolicitante: z.string().trim().max(200).optional(),
        unidadeAdministrativa: z.string().trim().max(200).optional(),
        responsavelRevisao: z.string().trim().max(200).optional(),
        responsavelAprovacao: z.string().trim().max(200).optional(),
        exercicioFinanceiro: z.number().int().min(2000).max(2200).optional(),
        modalidade: z.string().trim().max(200).optional(),
        prazoDesejado: z.coerce.date().nullable().optional(),
        dotacaoOrcamentaria: z.string().trim().max(500).optional(),
        observacoesGerais: z.string().trim().max(5000).optional(),
        dadosProcesso: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    await reabrirPesquisaEmitida({
      pesquisaId: pesquisa.id,
      status: pesquisa.status,
      userId: req.usuario.id,
      motivo: 'Dados ou metodologia do dossiê alterados.',
      ip: req.ip,
    });
    const { dadosProcesso, ...dadosEscalares } = data;
    const atualizada = await prisma.pesquisa.update({
      where: { id: req.params.id },
      data: {
        ...dadosEscalares,
        ...(dadosProcesso !== undefined && {
          dadosProcesso: dadosProcesso as Prisma.InputJsonValue,
        }),
      },
    });
    if (
      data.metodoCalculoSnapshot ||
      data.metaOrigensMinima ||
      data.limiteOutlierSnapshot !== undefined
    ) {
      const itens = await prisma.itemPesquisa.findMany({
        where: { pesquisaId: pesquisa.id },
        select: { id: true },
      });
      await Promise.all(itens.map((item) => recalcularItemECobertura(item.id)));
    }
    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'PESQUISA_EDITADA',
      entidade: 'Pesquisa',
      entidadeId: pesquisa.id,
      detalhe: { antes: pesquisa, depois: atualizada },
      ip: req.ip,
    });
    res.json(atualizada);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/pesquisas/:id — somente ADMIN
// Cadastro manual de um item
router.post('/:id/itens', autenticar, exigirAcaoPesquisa('EDITAR'), async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    await reabrirPesquisaEmitida({
      pesquisaId: pesquisa.id,
      status: pesquisa.status,
      userId: req.usuario.id,
      motivo: 'Item adicionado ao dossiê.',
      ip: req.ip,
    });
    validarPesquisaEditavel(pesquisa.status);
    const data = schemaItemBase.parse(req.body);

    const item = await prisma.$transaction(async (tx) => {
      const ultimo = await tx.itemPesquisa.findFirst({
        where: { pesquisaId: pesquisa.id },
        select: { sequencia: true },
        orderBy: { sequencia: 'desc' },
      });
      const criado = await tx.itemPesquisa.create({
        data: {
          pesquisaId: pesquisa.id,
          sequencia: (ultimo?.sequencia ?? 0) + 1,
          nome: data.nome,
          descricao: data.descricao,
          especificacao: data.especificacao || null,
          marcaModelo: data.marcaModelo || null,
          localEntrega: data.localEntrega || null,
          prazoEntregaDias: data.prazoEntregaDias ?? null,
          garantia: data.garantia || null,
          caracteristicasObrigatorias: data.caracteristicasObrigatorias || null,
          caracteristicasDesejaveis: data.caracteristicasDesejaveis || null,
          quantidade: data.quantidade,
          unidadeMedida: data.unidadeMedida,
          cidade: data.cidade || null,
          uf: data.uf?.toUpperCase() || null,
          camposExtras: data.camposExtras,
        },
      });
      await tx.pesquisa.update({
        where: { id: pesquisa.id },
        data: { totalItens: { increment: 1 }, arquivoSaidaUrl: null },
      });
      return criado;
    });

    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'ITEM_PESQUISA_CRIADO',
      entidade: 'ItemPesquisa',
      entidadeId: item.id,
      detalhe: { pesquisaId: pesquisa.id, sequencia: item.sequencia },
      ip: req.ip,
    });
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

// Reordenação explícita; a lista deve conter todos os itens da pesquisa
router.put(
  '/:id/itens/reordenar',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      await reabrirPesquisaEmitida({
        pesquisaId: pesquisa.id,
        status: pesquisa.status,
        userId: req.usuario.id,
        motivo: 'Itens reordenados.',
        ip: req.ip,
      });
      validarPesquisaEditavel(pesquisa.status);
      const { itens } = z
        .object({
          itens: z
            .array(z.object({ itemId: z.string().uuid(), sequencia: z.number().int().min(1) }))
            .min(1),
        })
        .parse(req.body);
      if (
        new Set(itens.map((item) => item.itemId)).size !== itens.length ||
        new Set(itens.map((item) => item.sequencia)).size !== itens.length
      ) {
        throw new ValidacaoError('Itens e sequências não podem se repetir.');
      }

      const existentes = await prisma.itemPesquisa.findMany({
        where: { pesquisaId: pesquisa.id },
        select: { id: true },
      });
      const idsExistentes = new Set(existentes.map((item) => item.id));
      if (
        existentes.length !== itens.length ||
        itens.some((item) => !idsExistentes.has(item.itemId))
      ) {
        throw new ValidacaoError('A reordenação deve incluir todos os itens da pesquisa.');
      }

      await prisma.$transaction([
        ...itens.map((item, indice) =>
          prisma.itemPesquisa.update({
            where: { id: item.itemId },
            data: { sequencia: -(indice + 1) },
          }),
        ),
        ...itens.map((item) =>
          prisma.itemPesquisa.update({
            where: { id: item.itemId },
            data: { sequencia: item.sequencia },
          }),
        ),
      ]);
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'ITENS_PESQUISA_REORDENADOS',
        entidade: 'Pesquisa',
        entidadeId: pesquisa.id,
        detalhe: { ordem: itens },
        ip: req.ip,
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

router.delete('/:id', autenticar, exigirAcaoPesquisa('EXCLUIR'), async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    await prisma.pesquisa.delete({ where: { id: req.params.id } });
    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'PESQUISA_EXCLUIDA',
      entidade: 'Pesquisa',
      entidadeId: req.params.id,
      detalhe: { titulo: pesquisa.titulo },
      ip: req.ip,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/pesquisas/:id/planilha — upload xlsx → preview (não salva itens ainda)
router.post(
  '/:id/planilha',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  upload.single('arquivo'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      if (!req.file) throw new ValidacaoError('Nenhum arquivo enviado.');

      const preview = await lerPlanilha(req.file.buffer);
      const operacoes = await planejarPreviewImportacao(pesquisa.id, preview.itens);

      const { url } = await salvarArquivo(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
      await prisma.pesquisa.update({
        where: { id: req.params.id },
        data: { arquivoEntradaUrl: url },
      });

      res.json({ preview: { ...preview, operacoes }, arquivoUrl: url });
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/pesquisas/:id/texto — colar TSV → preview
router.post('/:id/texto', autenticar, exigirAcaoPesquisa('EDITAR'), async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);

    const { texto } = z.object({ texto: z.string().min(10) }).parse(req.body);
    const preview = lerListaColada(texto);
    const operacoes = await planejarPreviewImportacao(pesquisa.id, preview.itens);
    res.json({ preview: { ...preview, operacoes } });
  } catch (e) {
    next(e);
  }
});

// POST /api/pesquisas/:id/confirmar — salva itens do preview no banco
// Aplica operações revisadas sem substituir toda a lista de itens
router.post(
  '/:id/importacao/aplicar',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      await reabrirPesquisaEmitida({
        pesquisaId: pesquisa.id,
        status: pesquisa.status,
        userId: req.usuario.id,
        motivo: 'Importação aplicada ao dossiê.',
        ip: req.ip,
      });
      validarPesquisaEditavel(pesquisa.status);

      const operacaoSchema = z.discriminatedUnion('acao', [
        z.object({ acao: z.literal('ADICIONAR'), item: schemaItemImportacao }),
        z.object({
          acao: z.literal('ATUALIZAR'),
          itemId: z.string().uuid(),
          item: schemaItemImportacao,
        }),
        z.object({
          acao: z.literal('IGNORAR'),
          itemId: z.string().uuid().optional(),
          item: schemaItemImportacao,
        }),
      ]);
      const { operacoes } = z.object({ operacoes: z.array(operacaoSchema).min(1) }).parse(req.body);
      const idsAtualizados = operacoes.flatMap((op) =>
        op.acao === 'ATUALIZAR' ? [op.itemId] : [],
      );
      if (idsAtualizados.length > 0) {
        const totalValidos = await prisma.itemPesquisa.count({
          where: { pesquisaId: pesquisa.id, id: { in: idsAtualizados } },
        });
        if (totalValidos !== new Set(idsAtualizados).size) {
          throw new ValidacaoError('A importação contém item que não pertence à pesquisa.');
        }
      }

      const resumo = await prisma.$transaction(async (tx) => {
        let adicionados = 0;
        let atualizados = 0;
        let ignorados = 0;
        for (const operacao of operacoes) {
          if (operacao.acao === 'IGNORAR') {
            ignorados++;
            continue;
          }
          const item = operacao.item;
          const data = {
            sequencia: item.sequencia,
            nome: item.nome,
            descricao: item.descricao,
            especificacao: item.especificacao || null,
            quantidade: item.quantidade,
            unidadeMedida: item.unidadeMedida,
            cidade: item.cidade || null,
            uf: item.uf?.toUpperCase() || null,
            camposExtras: item.camposExtras,
            statusItem: 'PENDENTE' as const,
            precoReferencia: null,
            precoTotal: null,
          };
          if (operacao.acao === 'ADICIONAR') {
            await tx.itemPesquisa.create({ data: { pesquisaId: pesquisa.id, ...data } });
            adicionados++;
          } else {
            await tx.itemPesquisa.update({ where: { id: operacao.itemId }, data });
            await tx.evidenciaPreco.updateMany({
              where: { itemPesquisaId: operacao.itemId, status: { in: ['PENDENTE', 'VALIDA'] } },
              data: { status: 'INVALIDA', justificativa: 'Item alterado por importação.' },
            });
            atualizados++;
          }
        }
        const totalItens = await tx.itemPesquisa.count({ where: { pesquisaId: pesquisa.id } });
        await tx.pesquisa.update({
          where: { id: pesquisa.id },
          data: {
            totalItens,
            status: 'RASCUNHO',
            itensComCotacao: 0,
            itensSemCotacao: 0,
            itensComErro: 0,
            resumoCobertura: null,
            arquivoSaidaUrl: null,
            erroProcessamento: null,
          },
        });
        return { adicionados, atualizados, ignorados, totalItens };
      });

      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'IMPORTACAO_ITENS_APLICADA',
        entidade: 'Pesquisa',
        entidadeId: pesquisa.id,
        detalhe: resumo,
        ip: req.ip,
      });
      res.json({ ok: true, ...resumo });
    } catch (e) {
      next(e);
    }
  },
);

router.post('/:id/confirmar', autenticar, exigirAcaoPesquisa('EDITAR'), async (req, res, next) => {
  try {
    for (const [nome, valor] of Object.entries(cabecalhosDeprecacaoConfirmacao(req.params.id)))
      res.setHeader(nome, valor);
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    if (pesquisa.status === 'PROCESSANDO')
      throw new ValidacaoError('Pesquisa em andamento. Aguarde a conclusão.');

    const { itens } = schemaConfirmacaoLegada.parse(req.body);

    await prisma.$transaction([
      prisma.itemPesquisa.deleteMany({ where: { pesquisaId: req.params.id } }),
      prisma.itemPesquisa.createMany({
        data: itens.map((i) => ({
          pesquisaId: req.params.id,
          sequencia: i.sequencia,
          nome: i.nome,
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidadeMedida: i.unidadeMedida || null,
          cidade: i.cidade || null,
          uf: i.uf || null,
          camposExtras: i.camposExtras,
          statusItem: 'PENDENTE',
        })),
      }),
      prisma.pesquisa.update({
        where: { id: req.params.id },
        data: { totalItens: itens.length, status: 'AGUARDANDO', erroProcessamento: null },
      }),
    ]);

    res.json({ ok: true, totalItens: itens.length });
  } catch (e) {
    next(e);
  }
});

// POST /api/pesquisas/:id/reprocessar — reseta itens e reenfileira o processamento
router.post(
  '/:id/reprocessar',
  autenticar,
  exigirAcaoPesquisa('COLETAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { itens: true } } },
      });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      if (pesquisa.status === 'PROCESSANDO')
        throw new ValidacaoError('Pesquisa já está sendo processada.');
      if (pesquisa._count.itens === 0) throw new ValidacaoError('A pesquisa não tem itens.');

      await prisma.$transaction([
        prisma.itemPesquisa.updateMany({
          where: { pesquisaId: req.params.id },
          data: { statusItem: 'PENDENTE', precoReferencia: null, precoTotal: null },
        }),
        prisma.pesquisa.update({
          where: { id: req.params.id },
          data: {
            status: 'PROCESSANDO',
            itensComCotacao: 0,
            itensSemCotacao: 0,
            itensComErro: 0,
            erroProcessamento: null,
            concluidaEm: null,
          },
        }),
      ]);

      const jobId = await enfileirarPesquisa(req.params.id, req.usuario.id);
      await prisma.pesquisa.update({ where: { id: req.params.id }, data: { jobId } });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'PESQUISA_ENFILEIRADA',
        entidade: 'Pesquisa',
        entidadeId: req.params.id,
        detalhe: { jobId, reprocessar: true },
        ip: req.ip,
      });

      res.json({ ok: true, jobId });
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/pesquisas/:id/processar — enfileira o processamento
router.post(
  '/:id/coleta/iniciar',
  autenticar,
  exigirAcaoPesquisa('COLETAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { itens: true } } },
      });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      if (pesquisa._count.itens === 0)
        throw new ValidacaoError('Cadastre ao menos um item antes de iniciar a coleta.');
      await transicionarPesquisa({
        pesquisaId: pesquisa.id,
        estadoAtual: pesquisa.status,
        destino: 'COLETANDO',
        userId: req.usuario.id,
        motivo: 'Coleta iniciada pelo usuário.',
        ip: req.ip,
      });
      res.json({ id: pesquisa.id, status: 'COLETANDO' });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/:id/coleta/encerrar',
  autenticar,
  exigirAcaoPesquisa('REVISAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({
        where: { id: req.params.id },
        include: { itens: { include: { evidencias: { select: { status: true } } } } },
      });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      const itens = pesquisa.itens.map((item) => {
        const calculo = item.resultadoCalculo as {
          evidenciasIndependentes?: number;
          origensDistintas?: number;
        } | null;
        return {
          itemId: item.id,
          sequencia: item.sequencia,
          pendentes: item.evidencias.filter((evidencia) => evidencia.status === 'PENDENTE').length,
          origensValidas: calculo?.evidenciasIndependentes ?? calculo?.origensDistintas ?? 0,
          metaOrigens: pesquisa.metaOrigensMinima,
        };
      });
      await transicionarPesquisa({
        pesquisaId: pesquisa.id,
        estadoAtual: pesquisa.status,
        destino: 'EM_REVISAO',
        userId: req.usuario.id,
        motivo: 'Coleta encerrada e encaminhada para revisão.',
        ip: req.ip,
      });
      res.json({
        id: pesquisa.id,
        status: 'EM_REVISAO',
        resumo: {
          itens,
          totalPendentes: itens.reduce((total, item) => total + item.pendentes, 0),
          itensAbaixoMeta: itens.filter((item) => item.origensValidas < item.metaOrigens).length,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

router.post('/:id/aprovar', autenticar, exigirAcaoPesquisa('APROVAR'), async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({
      where: { id: req.params.id },
      include: { itens: { include: { evidencias: { select: { status: true } } } } },
    });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    if (pesquisa.itens.length === 0)
      throw new ValidacaoError('A pesquisa não possui itens para aprovação.');
    const pendentes = pesquisa.itens
      .flatMap((item) => item.evidencias)
      .filter((evidencia) => evidencia.status === 'PENDENTE').length;
    if (pendentes > 0)
      throw new ValidacaoError(`Revise as ${pendentes} evidência(s) pendente(s) antes de aprovar.`);
    const bloqueados = pesquisa.itens.filter((item) => {
      const resultado = item.resultadoCalculo as { completa?: boolean } | null;
      return !resultado || (resultado.completa === false && !item.justificativaCobertura);
    });
    if (bloqueados.length > 0)
      throw new ValidacaoError(
        `Há ${bloqueados.length} item(ns) sem cálculo ou justificativa de cobertura.`,
      );
    const { motivo } = z
      .object({ motivo: z.string().trim().min(5).max(1000).default('Dossiê revisado e aprovado.') })
      .parse(req.body ?? {});
    await transicionarPesquisa({
      pesquisaId: pesquisa.id,
      estadoAtual: pesquisa.status,
      destino: 'APROVADA',
      userId: req.usuario.id,
      motivo,
      ip: req.ip,
    });
    const aprovada = await prisma.pesquisa.update({
      where: { id: pesquisa.id },
      data: { aprovadaPorId: req.usuario.id, aprovadaEm: new Date() },
    });
    res.json(aprovada);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/processar', autenticar, exigirAcaoPesquisa('COLETAR'), async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { itens: true } } },
    });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    if (pesquisa.status === 'PROCESSANDO')
      throw new ValidacaoError('Pesquisa já está sendo processada.');
    if (pesquisa._count.itens === 0)
      throw new ValidacaoError('A pesquisa não tem itens. Confirme a planilha primeiro.');

    // Marca PROCESSANDO ANTES de enfileirar — evita race condition com setImmediate
    await prisma.pesquisa.update({
      where: { id: req.params.id },
      data: {
        status: 'PROCESSANDO',
        erroProcessamento: null,
        itensComCotacao: 0,
        itensSemCotacao: 0,
        itensComErro: 0,
        resumoCobertura: null,
        concluidaEm: null,
      },
    });
    const jobId = await enfileirarPesquisa(req.params.id, req.usuario.id);
    await prisma.pesquisa.update({ where: { id: req.params.id }, data: { jobId } });
    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'PESQUISA_ENFILEIRADA',
      entidade: 'Pesquisa',
      entidadeId: req.params.id,
      detalhe: { jobId },
      ip: req.ip,
    });

    res.json({ ok: true, jobId });
  } catch (e) {
    next(e);
  }
});

// GET /api/pesquisas/:id/progresso — SSE com progresso em tempo real do job BullMQ
router.get('/:id/progresso', autenticar, async (req, res) => {
  const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
  if (!pesquisa) {
    res.status(404).json({ erro: 'Pesquisa não encontrada.' });
    return;
  }
  try {
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
  } catch {
    res.status(403).json({ erro: 'Acesso negado.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const enviar = (dados: unknown) => res.write(`data: ${JSON.stringify(dados)}\n\n`);

  const verificar = async () => {
    const p = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!p) {
      res.end();
      return;
    }

    let jp: Record<string, unknown> | null = null;
    if (p.jobId) {
      // Tenta BullMQ primeiro; fallback para store em memória (modo sem Redis)
      const job = await buscarJobPorId(p.jobId).catch(() => null);
      if (job?.progress && typeof job.progress === 'object') {
        jp = job.progress as Record<string, unknown>;
      } else {
        jp = progressStore.get(req.params.id);
      }
    }

    enviar({
      pesquisaId: p.id,
      status: p.status,
      totalItens: p.totalItens,
      processados: jp?.processados ?? 0,
      itensComCotacao: jp?.itensComCotacao ?? p.itensComCotacao,
      itensSemCotacao: jp?.itensSemCotacao ?? p.itensSemCotacao,
      itensComErro: jp?.itensComErro ?? p.itensComErro,
      itemAtual: jp?.itemAtual ?? null,
      tempoEstimadoSegundos: jp?.tempoEstimadoSegundos ?? null,
      resumoCobertura: p.resumoCobertura,
    });

    if (p.status === 'CONCLUIDA' || p.status === 'ERRO') {
      clearInterval(intervalo);
      res.end();
    }
  };

  await verificar();
  const intervalo = setInterval(verificar, 2000);
  req.on('close', () => clearInterval(intervalo));
});

// GET /api/pesquisas/:id/resultado/planilha — download da planilha de saída
router.get('/:id/resultado/planilha', autenticar, async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
    if (pesquisa.status !== 'CONCLUIDA')
      throw new ValidacaoError('A pesquisa ainda não foi concluída.');

    const buffer = await gerarPlanilha(req.params.id);
    const nomeArquivo = `cotacao-${pesquisa.titulo.replace(/[^a-z0-9]/gi, '-').slice(0, 40)}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// PUT /api/pesquisas/:id/itens/:itemId — editar item manualmente
router.put(
  '/:id/itens/:itemId',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      await reabrirPesquisaEmitida({
        pesquisaId: pesquisa.id,
        status: pesquisa.status,
        userId: req.usuario.id,
        motivo: 'Item editado.',
        ip: req.ip,
      });
      validarPesquisaEditavel(pesquisa.status);

      const item = await prisma.itemPesquisa.findUnique({ where: { id: req.params.itemId } });
      if (!item || item.pesquisaId !== req.params.id)
        throw new NaoEncontradoError('Item não encontrado.');

      const data = schemaItemBase
        .partial()
        .extend({
          observacao: z.string().optional(),
          precoManual: z.number().positive().optional(),
          referenciaManual: z.string().optional(),
        })
        .parse(req.body);

      if (data.precoManual !== undefined) {
        const cotacaoManual = await prisma.cotacao.findFirst({
          where: { itemPesquisaId: item.id, fonte: 'manual' },
        });
        if (cotacaoManual) {
          await prisma.cotacao.update({
            where: { id: cotacaoManual.id },
            data: {
              preco: data.precoManual,
              referencia: data.referenciaManual ?? 'Cotação manual',
              editadaManualmente: true,
            },
          });
        } else {
          await prisma.cotacao.create({
            data: {
              itemPesquisaId: item.id,
              fonte: 'manual',
              preco: data.precoManual,
              referencia: data.referenciaManual ?? 'Cotação manual',
              editadaManualmente: true,
            },
          });
        }
      }

      const atualizado = await prisma.itemPesquisa.update({
        where: { id: item.id },
        data: {
          ...(data.nome !== undefined && { nome: data.nome }),
          ...(data.descricao !== undefined && { descricao: data.descricao }),
          ...(data.especificacao !== undefined && { especificacao: data.especificacao || null }),
          ...(data.marcaModelo !== undefined && { marcaModelo: data.marcaModelo || null }),
          ...(data.localEntrega !== undefined && { localEntrega: data.localEntrega || null }),
          ...(data.prazoEntregaDias !== undefined && { prazoEntregaDias: data.prazoEntregaDias }),
          ...(data.garantia !== undefined && { garantia: data.garantia || null }),
          ...(data.caracteristicasObrigatorias !== undefined && {
            caracteristicasObrigatorias: data.caracteristicasObrigatorias || null,
          }),
          ...(data.caracteristicasDesejaveis !== undefined && {
            caracteristicasDesejaveis: data.caracteristicasDesejaveis || null,
          }),
          ...(data.quantidade !== undefined && { quantidade: data.quantidade }),
          ...(data.unidadeMedida !== undefined && { unidadeMedida: data.unidadeMedida }),
          ...(data.cidade !== undefined && { cidade: data.cidade || null }),
          ...(data.uf !== undefined && { uf: data.uf?.toUpperCase() || null }),
          ...(data.camposExtras !== undefined && { camposExtras: data.camposExtras }),
          ...(data.observacao !== undefined && { observacao: data.observacao }),
        },
        include: { cotacoes: true },
      });

      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'ITEM_PESQUISA_ATUALIZADO',
        entidade: 'ItemPesquisa',
        entidadeId: item.id,
        detalhe: { pesquisaId: pesquisa.id, antes: item, alteracoes: data },
        ip: req.ip,
      });

      res.json(atualizado);
    } catch (e) {
      next(e);
    }
  },
);

// GET /api/pesquisas/:id/itens/:itemId/cotacoes-diretas
// Remove um item de uma pesquisa editável
router.delete(
  '/:id/itens/:itemId',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      await reabrirPesquisaEmitida({
        pesquisaId: pesquisa.id,
        status: pesquisa.status,
        userId: req.usuario.id,
        motivo: 'Item removido.',
        ip: req.ip,
      });
      validarPesquisaEditavel(pesquisa.status);
      const item = await prisma.itemPesquisa.findFirst({
        where: { id: req.params.itemId, pesquisaId: pesquisa.id },
      });
      if (!item) throw new NaoEncontradoError('Item não encontrado.');

      await prisma.$transaction([
        prisma.itemPesquisa.delete({ where: { id: item.id } }),
        prisma.pesquisa.update({
          where: { id: pesquisa.id },
          data: { totalItens: { decrement: 1 }, arquivoSaidaUrl: null },
        }),
      ]);
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'ITEM_PESQUISA_REMOVIDO',
        entidade: 'ItemPesquisa',
        entidadeId: item.id,
        detalhe: { pesquisaId: pesquisa.id, item },
        ip: req.ip,
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

// Busca atualizada nas fontes habilitadas para um item já cadastrado
router.post(
  '/:id/itens/:itemId/buscar-precos',
  autenticar,
  exigirAcaoPesquisa('COLETAR'),
  async (req, res, next) => {
    try {
      const escopoPncp = schemaEscopoBuscaPncp.parse(req.body ?? {});
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      let statusAtual = pesquisa.status;
      if (['APROVADA', 'EMITIDA'].includes(statusAtual)) {
        await reabrirPesquisaEmitida({
          pesquisaId: pesquisa.id,
          status: pesquisa.status,
          userId: req.usuario.id,
          motivo: 'Nova busca de preços solicitada.',
          ip: req.ip,
        });
        statusAtual = 'EM_REVISAO';
      }
      if (['RASCUNHO', 'EM_REVISAO'].includes(statusAtual)) {
        await transicionarPesquisa({
          pesquisaId: pesquisa.id,
          estadoAtual: statusAtual,
          destino: 'COLETANDO',
          userId: req.usuario.id,
          motivo: 'Busca online iniciada para um item.',
          ip: req.ip,
        });
        statusAtual = 'COLETANDO';
      }
      if (statusAtual === 'PROCESSANDO') {
        throw new ConflitoError('A pesquisa já possui uma coleta em andamento.');
      }
      const resultado = await buscarPrecosAtualizados({
        pesquisaId: pesquisa.id,
        itemId: req.params.itemId,
        autorId: req.usuario.id,
        escopoPncp,
      });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'BUSCA_PRECOS_ITEM_EXECUTADA',
        entidade: 'ItemPesquisa',
        entidadeId: req.params.itemId,
        detalhe: { pesquisaId: pesquisa.id, sessaoId: resultado.id },
        ip: req.ip,
      });
      res.json(resultado);
    } catch (e) {
      next(e);
    }
  },
);

const schemaEvidencia = z
  .object({
    tipoOrigem: z.enum([
      'FONTE_PUBLICA',
      'FORNECEDOR',
      'TABELA_REFERENCIA',
      'HISTORICO_INTERNO',
      'MANUAL',
    ]),
    origem: z.string().trim().min(2).max(200),
    fornecedorId: z.string().uuid().optional(),
    preco: z.number().positive(),
    dataReferencia: z.coerce.date(),
    referencia: z.string().trim().max(1000).optional(),
    comprovanteUrl: z.string().trim().max(2000).optional(),
    justificativa: z.string().trim().max(1000).optional(),
  })
  .refine((dados) => dados.referencia || dados.comprovanteUrl, {
    message: 'Informe a referência ou um comprovante.',
    path: ['referencia'],
  });

async function obterItemNoEscopo(
  pesquisaId: string,
  itemId: string,
  usuario: { id: string; role: 'ADMIN' | 'OPERADOR' | 'VISUALIZADOR' },
) {
  const item = await prisma.itemPesquisa.findFirst({
    where: { id: itemId, pesquisaId },
    include: { pesquisa: true },
  });
  if (!item) throw new NaoEncontradoError('Item não encontrado para esta pesquisa.');
  checarEscopoPesquisa(item.pesquisa.userId, usuario.id, usuario.role);
  return item;
}

// Evidências são registros unitários e revisáveis; não são apenas o preço agregado da fonte.
router.get('/:id/itens/:itemId/evidencias', autenticar, async (req, res, next) => {
  try {
    await obterItemNoEscopo(req.params.id, req.params.itemId, req.usuario);
    const evidencias = await prisma.evidenciaPreco.findMany({
      where: { itemPesquisaId: req.params.itemId },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        revisadoPor: { select: { id: true, nome: true } },
        cotacaoDireta: {
          include: { fornecedor: { select: { id: true, razaoSocial: true, cnpj: true } } },
        },
      },
      orderBy: [{ status: 'asc' }, { dataColeta: 'desc' }],
    });
    res.json(evidencias);
  } catch (e) {
    next(e);
  }
});

router.post(
  '/:id/itens/:itemId/evidencias',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const item = await obterItemNoEscopo(req.params.id, req.params.itemId, req.usuario);
      await reabrirPesquisaEmitida({
        pesquisaId: item.pesquisa.id,
        status: item.pesquisa.status,
        userId: req.usuario.id,
        motivo: 'Evidência manual adicionada.',
        ip: req.ip,
      });
      validarPesquisaEditavel(item.pesquisa.status);
      const data = schemaEvidencia.parse(req.body);
      const origemChave = montarChaveOrigem({
        tipoOrigem: data.tipoOrigem,
        origem: data.origem,
        fornecedorId: data.fornecedorId,
      });
      const chaveDedupe = montarChaveDedupeEvidencia({
        itemPesquisaId: item.id,
        origemChave,
        referencia: data.referencia,
        preco: data.preco,
        unidade: item.unidadeMedida,
      });
      const duplicada = await prisma.evidenciaPreco.findUnique({ where: { chaveDedupe } });
      if (duplicada)
        throw new ConflitoError(
          'Esta evidência já foi registrada para o item. Revise o registro existente.',
        );
      const evidencia = await prisma.evidenciaPreco.create({
        data: {
          itemPesquisaId: item.id,
          tipoOrigem: data.tipoOrigem,
          origemChave,
          independenciaChave: montarChaveIndependenciaEvidencia({
            tipoOrigem: data.tipoOrigem,
            origemChave,
            referencia: data.referencia,
            fornecedorId: data.fornecedorId,
          }),
          chaveDedupe,
          fonte: data.origem,
          preco: data.preco,
          dataReferencia: data.dataReferencia,
          referencia: data.referencia,
          comprovanteUrl: data.comprovanteUrl,
          justificativa: data.justificativa,
          status: 'PENDENTE',
          criadoPorId: req.usuario.id,
        },
      });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'EVIDENCIA_CRIADA',
        entidade: 'EvidenciaPreco',
        entidadeId: evidencia.id,
        detalhe: { pesquisaId: req.params.id, itemId: item.id, origemChave: evidencia.origemChave },
        ip: req.ip,
      });
      res.status(201).json(evidencia);
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  '/:id/itens/:itemId/evidencias/:evidenciaId',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const item = await obterItemNoEscopo(req.params.id, req.params.itemId, req.usuario);
      await reabrirPesquisaEmitida({
        pesquisaId: item.pesquisa.id,
        status: item.pesquisa.status,
        userId: req.usuario.id,
        motivo: 'Evidência editada.',
        ip: req.ip,
      });
      validarPesquisaEditavel(item.pesquisa.status);
      const existente = await prisma.evidenciaPreco.findFirst({
        where: { id: req.params.evidenciaId, itemPesquisaId: item.id },
      });
      if (!existente) throw new NaoEncontradoError('Evidência não encontrada.');
      if (existente.cotacaoId || existente.cotacaoDiretaId)
        throw new ConflitoError('Edite esta evidência pela cotação de origem.');
      const data = schemaEvidencia.parse(req.body);
      const evidencia = await prisma.evidenciaPreco.update({
        where: { id: existente.id },
        data: {
          tipoOrigem: data.tipoOrigem,
          origemChave: montarChaveOrigem({
            tipoOrigem: data.tipoOrigem,
            origem: data.origem,
            fornecedorId: data.fornecedorId,
          }),
          independenciaChave: montarChaveIndependenciaEvidencia({
            tipoOrigem: data.tipoOrigem,
            origemChave: montarChaveOrigem({
              tipoOrigem: data.tipoOrigem,
              origem: data.origem,
              fornecedorId: data.fornecedorId,
            }),
            referencia: data.referencia,
            fornecedorId: data.fornecedorId,
          }),
          fonte: data.origem,
          preco: data.preco,
          dataReferencia: data.dataReferencia,
          referencia: data.referencia,
          comprovanteUrl: data.comprovanteUrl,
          justificativa: data.justificativa,
          status: 'PENDENTE',
          revisadoPorId: null,
          revisadoEm: null,
        },
      });
      await recalcularItemECobertura(item.id);
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'EVIDENCIA_EDITADA',
        entidade: 'EvidenciaPreco',
        entidadeId: evidencia.id,
        detalhe: { antes: existente, depois: evidencia },
        ip: req.ip,
      });
      res.json(evidencia);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/:id/itens/:itemId/evidencias/:evidenciaId/anexo',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  uploadCotacao.single('arquivo'),
  async (req, res, next) => {
    try {
      await obterItemNoEscopo(req.params.id, req.params.itemId, req.usuario);
      if (!req.file) throw new ValidacaoError('Arquivo não enviado.');
      const existente = await prisma.evidenciaPreco.findFirst({
        where: { id: req.params.evidenciaId, itemPesquisaId: req.params.itemId },
      });
      if (!existente) throw new NaoEncontradoError('Evidência não encontrada.');
      const { url } = await salvarArquivo(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
      const evidencia = await prisma.evidenciaPreco.update({
        where: { id: existente.id },
        data: { comprovanteUrl: url, status: 'PENDENTE', revisadoPorId: null, revisadoEm: null },
      });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'EVIDENCIA_COMPROVANTE_ANEXADO',
        entidade: 'EvidenciaPreco',
        entidadeId: evidencia.id,
        detalhe: { url },
        ip: req.ip,
      });
      res.json(evidencia);
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  '/:id/itens/:itemId/evidencias/:evidenciaId/revisao',
  autenticar,
  exigirAcaoPesquisa('REVISAR'),
  async (req, res, next) => {
    try {
      const item = await obterItemNoEscopo(req.params.id, req.params.itemId, req.usuario);
      await reabrirPesquisaEmitida({
        pesquisaId: item.pesquisa.id,
        status: item.pesquisa.status,
        userId: req.usuario.id,
        motivo: 'Revisão de evidência alterada.',
        ip: req.ip,
      });
      const data = z
        .discriminatedUnion('status', [
          z.object({
            status: z.literal('VALIDA'),
            justificativa: z.string().trim().max(1000).optional(),
          }),
          z.object({
            status: z.literal('DESCARTADA'),
            justificativa: z.string().trim().min(5).max(1000),
          }),
        ])
        .parse(req.body);
      const existente = await prisma.evidenciaPreco.findFirst({
        where: { id: req.params.evidenciaId, itemPesquisaId: item.id },
      });
      if (!existente) throw new NaoEncontradoError('Evidência não encontrada.');
      if (
        data.status === 'VALIDA' &&
        (!existente.dataReferencia || (!existente.referencia && !existente.comprovanteUrl))
      ) {
        throw new ValidacaoError('Uma evidência válida exige data e referência ou comprovante.');
      }
      if (
        data.status === 'VALIDA' &&
        !unidadesCompativeis(item.unidadeMedida, existente.unidadeOriginal)
      ) {
        throw new ValidacaoError(
          `Unidade incompatível: o item usa ${item.unidadeMedida ?? 'unidade não informada'} e a evidência usa ${existente.unidadeOriginal}.`,
        );
      }
      if (
        data.status === 'VALIDA' &&
        existente.possivelDuplicidade &&
        (!data.justificativa || data.justificativa.length < 10)
      ) {
        throw new ValidacaoError(
          'Confirme a possível duplicidade com uma justificativa de pelo menos 10 caracteres.',
        );
      }
      const evidencia = await prisma.evidenciaPreco.update({
        where: { id: existente.id },
        data: {
          status: data.status,
          justificativa: data.justificativa,
          revisadoPorId: req.usuario.id,
          revisadoEm: new Date(),
        },
      });
      await recalcularItemECobertura(item.id);
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: data.status === 'VALIDA' ? 'EVIDENCIA_VALIDADA' : 'EVIDENCIA_DESCARTADA',
        entidade: 'EvidenciaPreco',
        entidadeId: evidencia.id,
        detalhe: { pesquisaId: req.params.id, itemId: item.id, justificativa: data.justificativa },
        ip: req.ip,
      });
      res.json(evidencia);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/:id/itens/:itemId/justificativa-cobertura',
  autenticar,
  exigirAcaoPesquisa('REVISAR'),
  async (req, res, next) => {
    try {
      const item = await obterItemNoEscopo(req.params.id, req.params.itemId, req.usuario);
      const { justificativa } = z
        .object({ justificativa: z.string().trim().min(10).max(2000) })
        .parse(req.body);
      const atualizada = await prisma.itemPesquisa.update({
        where: { id: item.id },
        data: {
          justificativaCobertura: justificativa,
          excecaoAprovadaPorId: req.usuario.id,
          excecaoAprovadaEm: new Date(),
        },
      });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'EXCECAO_COBERTURA_APROVADA',
        entidade: 'ItemPesquisa',
        entidadeId: item.id,
        detalhe: { pesquisaId: req.params.id, justificativa },
        ip: req.ip,
      });
      registrarMetrica('cobertura_excecao_aprovada', 1, {
        pesquisaId: req.params.id,
        itemId: item.id,
        motivoTamanho: justificativa.length,
      });
      res.json(atualizada);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/:id/itens/:itemId/cotacoes-diretas', autenticar, async (req, res, next) => {
  try {
    const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
    if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
    checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);

    const vencidas = await prisma.cotacaoDireta.updateMany({
      where: {
        itemPesquisaId: req.params.itemId,
        status: 'ENVIADA',
        validadeAte: { lt: new Date() },
      },
      data: { status: 'VENCIDA' },
    });
    if (vencidas.count > 0) await recalcularItemECobertura(req.params.itemId);
    const cotacoes = await prisma.cotacaoDireta.findMany({
      where: { itemPesquisaId: req.params.itemId },
      include: { fornecedor: true },
      orderBy: { dataSolicitacao: 'desc' },
    });
    res.json(cotacoes);
  } catch (e) {
    next(e);
  }
});

// POST /api/pesquisas/:id/itens/:itemId/cotacoes-diretas
router.post(
  '/:id/itens/:itemId/cotacoes-diretas',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);

      const data = z
        .object({
          fornecedorId: z.string().uuid(),
          justificativa: z.string().min(5),
          validadeAte: z.coerce.date().optional(),
          observacao: z.string().max(1000).optional(),
        })
        .parse(req.body);

      const item = await prisma.itemPesquisa.findUnique({ where: { id: req.params.itemId } });
      if (!item || item.pesquisaId !== req.params.id)
        throw new NaoEncontradoError('Item não encontrado.');

      const fornecedor = await prisma.fornecedor.findFirst({
        where: { id: data.fornecedorId, ativo: true },
      });
      if (!fornecedor) throw new NaoEncontradoError('Fornecedor ativo não encontrado.');
      const existente = await prisma.cotacaoDireta.findFirst({
        where: {
          itemPesquisaId: item.id,
          fornecedorId: data.fornecedorId,
          status: { in: ['RASCUNHO', 'ENVIADA', 'RESPONDIDA'] },
        },
      });
      if (existente)
        throw new ConflitoError('Já existe uma cotação ativa deste fornecedor para o item.');

      const cotacao = await prisma.cotacaoDireta.create({
        data: {
          itemPesquisaId: item.id,
          fornecedorId: data.fornecedorId,
          justificativa: data.justificativa.trim(),
          validadeAte: data.validadeAte,
          observacao: data.observacao?.trim(),
        },
        include: { fornecedor: true },
      });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'COTACAO_DIRETA_SOLICITADA',
        entidade: 'CotacaoDireta',
        entidadeId: cotacao.id,
        detalhe: { pesquisaId: req.params.id, itemId: item.id, fornecedorId: fornecedor.id },
        ip: req.ip,
      });
      res.status(201).json(cotacao);
    } catch (e) {
      next(e);
    }
  },
);

// GET .../solicitacao — gera prévia sem enviar
router.get(
  '/:id/itens/:itemId/cotacoes-diretas/:cotacaoId/solicitacao',
  autenticar,
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      const cotacao = await prisma.cotacaoDireta.findFirst({
        where: { id: req.params.cotacaoId, itemPesquisaId: req.params.itemId },
        include: { fornecedor: true, item: true },
      });
      if (!cotacao) throw new NaoEncontradoError('Cotação direta não encontrada.');
      res.json(
        montarSolicitacaoCotacao({
          fornecedor: cotacao.fornecedor.razaoSocial,
          item: cotacao.item.descricao || cotacao.item.nome,
          quantidade: String(cotacao.item.quantidade),
          unidade: cotacao.item.unidadeMedida ?? '',
          justificativa: cotacao.justificativa,
          validade: cotacao.validadeAte,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

// POST .../enviar — só envia após confirmação explícita
router.post(
  '/:id/itens/:itemId/cotacoes-diretas/:cotacaoId/enviar',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      z.object({ confirmar: z.literal(true) }).parse(req.body);
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      const cotacao = await prisma.cotacaoDireta.findFirst({
        where: { id: req.params.cotacaoId, itemPesquisaId: req.params.itemId },
        include: { fornecedor: true, item: true },
      });
      if (!cotacao) throw new NaoEncontradoError('Cotação direta não encontrada.');
      if (!cotacao.fornecedor.email)
        throw new ValidacaoError('O fornecedor não possui e-mail cadastrado.');
      if (!['RASCUNHO', 'VENCIDA'].includes(cotacao.status))
        throw new ConflitoError('Esta solicitação já foi enviada ou encerrada.');
      const mensagem = montarSolicitacaoCotacao({
        fornecedor: cotacao.fornecedor.razaoSocial,
        item: cotacao.item.descricao || cotacao.item.nome,
        quantidade: String(cotacao.item.quantidade),
        unidade: cotacao.item.unidadeMedida ?? '',
        justificativa: cotacao.justificativa,
        validade: cotacao.validadeAte,
      });
      const envio = await enviarEmail({ para: cotacao.fornecedor.email, ...mensagem });
      if (envio.enviado) {
        await prisma.cotacaoDireta.update({
          where: { id: cotacao.id },
          data: { status: 'ENVIADA', dataEnvio: new Date(), dataSolicitacao: new Date() },
        });
      }
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: envio.enviado ? 'COTACAO_DIRETA_ENVIADA' : 'COTACAO_DIRETA_ENVIO_SIMULADO',
        entidade: 'CotacaoDireta',
        entidadeId: cotacao.id,
        detalhe: { fornecedorId: cotacao.fornecedorId, email: cotacao.fornecedor.email },
        ip: req.ip,
      });
      res.json({
        ...envio,
        mensagem: envio.enviado
          ? 'Solicitação enviada.'
          : 'SMTP não configurado; solicitação gerada, mas não enviada.',
        previa: mensagem,
      });
    } catch (e) {
      next(e);
    }
  },
);

// PUT /api/pesquisas/:id/itens/:itemId/cotacoes-diretas/:cotacaoId
router.put(
  '/:id/itens/:itemId/cotacoes-diretas/:cotacaoId',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);

      const data = z
        .object({
          preco: z.number().positive().optional(),
          status: z
            .enum(['RASCUNHO', 'ENVIADA', 'RESPONDIDA', 'RECUSADA', 'CANCELADA', 'VENCIDA'])
            .optional(),
          outlier: z.boolean().optional(),
          validadeAte: z.coerce.date().nullable().optional(),
          observacao: z.string().max(1000).nullable().optional(),
        })
        .parse(req.body);

      const existente = await prisma.cotacaoDireta.findFirst({
        where: { id: req.params.cotacaoId, itemPesquisaId: req.params.itemId },
      });
      if (!existente) throw new NaoEncontradoError('Cotação direta não encontrada para este item.');
      if (data.status === 'RESPONDIDA' && data.preco === undefined && existente.preco === null) {
        throw new ValidacaoError('Informe o preço para marcar a cotação como respondida.');
      }
      const cotacao = await prisma.cotacaoDireta.update({
        where: { id: req.params.cotacaoId },
        data: {
          ...data,
          observacao: data.observacao?.trim(),
          dataResposta:
            data.preco !== undefined || ['RESPONDIDA', 'RECUSADA'].includes(data.status ?? '')
              ? new Date()
              : undefined,
        },
        include: { fornecedor: true },
      });
      await sincronizarEvidenciaCotacaoDireta(cotacao, req.usuario.id);
      await recalcularItemECobertura(req.params.itemId);
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'COTACAO_DIRETA_ATUALIZADA',
        entidade: 'CotacaoDireta',
        entidadeId: cotacao.id,
        detalhe: { antes: existente, depois: cotacao },
        ip: req.ip,
      });
      res.json(cotacao);
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/pesquisas/:id/itens/:itemId/cotacoes-diretas/:cotacaoId/anexo
router.post(
  '/:id/itens/:itemId/cotacoes-diretas/:cotacaoId/anexo',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  uploadCotacao.single('arquivo'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      if (!req.file) throw new ValidacaoError('Arquivo não enviado.');
      const tipo = z.enum(['solicitacao', 'resposta']).parse(req.query.tipo);
      const existente = await prisma.cotacaoDireta.findFirst({
        where: { id: req.params.cotacaoId, itemPesquisaId: req.params.itemId },
      });
      if (!existente) throw new NaoEncontradoError('Cotação direta não encontrada para este item.');
      const { url } = await salvarArquivo(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
      const cotacao = await prisma.cotacaoDireta.update({
        where: { id: existente.id },
        data: tipo === 'solicitacao' ? { anexoSolicitacaoUrl: url } : { anexoRespostaUrl: url },
        include: { fornecedor: true },
      });
      if (tipo === 'resposta') await sincronizarEvidenciaCotacaoDireta(cotacao, req.usuario.id);
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'COTACAO_DIRETA_ANEXO',
        entidade: 'CotacaoDireta',
        entidadeId: cotacao.id,
        detalhe: { tipo, url },
        ip: req.ip,
      });
      res.json(cotacao);
    } catch (e) {
      next(e);
    }
  },
);

// DELETE /api/pesquisas/:id/itens/:itemId/cotacoes-diretas/:cotacaoId — cancela sem apagar histórico
router.delete(
  '/:id/itens/:itemId/cotacoes-diretas/:cotacaoId',
  autenticar,
  exigirAcaoPesquisa('EDITAR'),
  async (req, res, next) => {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({ where: { id: req.params.id } });
      if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
      checarEscopoPesquisa(pesquisa.userId, req.usuario.id, req.usuario.role);
      const existente = await prisma.cotacaoDireta.findFirst({
        where: { id: req.params.cotacaoId, itemPesquisaId: req.params.itemId },
      });
      if (!existente) throw new NaoEncontradoError('Cotação direta não encontrada para este item.');
      const cotacao = await prisma.cotacaoDireta.update({
        where: { id: existente.id },
        data: { status: 'CANCELADA' },
        include: { fornecedor: true },
      });
      await sincronizarEvidenciaCotacaoDireta(cotacao, req.usuario.id);
      await recalcularItemECobertura(req.params.itemId);
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'COTACAO_DIRETA_CANCELADA',
        entidade: 'CotacaoDireta',
        entidadeId: cotacao.id,
        detalhe: { pesquisaId: req.params.id, itemId: req.params.itemId },
        ip: req.ip,
      });
      res.json(cotacao);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
