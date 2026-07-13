import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { autenticar, exigirRole } from '../middleware/auth.js';
import { AppError, ConflitoError, NaoEncontradoError, ValidacaoError } from '../utils/errors.js';
import { registrarAuditoria } from '../services/auditoria.service.js';
import { normalizarChave } from '../utils/texto.js';
import { requisitar } from '../utils/http.js';
import { cnpjValido, normalizarCnpj } from '../utils/cnpj.js';

const router: Router = Router();

const schemaFornecedor = z.object({
  razaoSocial: z.string().min(2),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve conter 14 dígitos sem formatação'),
  contatoNome: z.string().optional(),
  email: z.string().email().optional(),
  telefone: z.string().optional(),
  endereco: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().length(2).optional(),
  origem: z.enum(['MANUAL', 'PNCP']).default('MANUAL'),
  referenciaOrigem: z.string().max(500).optional(),
});

const cacheCnpj = new Map<string, { expiraEm: number; dados: Record<string, unknown> }>();

function limparOpcional(valor: string | undefined): string | undefined {
  const limpo = valor?.trim();
  return limpo || undefined;
}

function normalizarFornecedor(data: z.infer<typeof schemaFornecedor>) {
  return {
    ...data,
    cnpj: normalizarCnpj(data.cnpj),
    razaoSocial: data.razaoSocial.trim(),
    nomeFantasia: limparOpcional(data.nomeFantasia),
    contatoNome: limparOpcional(data.contatoNome),
    email: limparOpcional(data.email)?.toLowerCase(),
    telefone: limparOpcional(data.telefone),
    endereco: limparOpcional(data.endereco),
    municipio: limparOpcional(data.municipio),
    uf: limparOpcional(data.uf)?.toUpperCase(),
    referenciaOrigem: limparOpcional(data.referenciaOrigem),
  };
}

function tratarConflitoCnpj(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new ConflitoError('Já existe um fornecedor cadastrado com este CNPJ.');
  }
  throw e;
}

// GET /api/fornecedores
router.get('/', autenticar, exigirRole('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const { busca, pagina, limite } = z
      .object({
        busca: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      ativo: true,
      ...(busca
        ? {
            OR: [
              { razaoSocial: { contains: busca, mode: 'insensitive' as const } },
              { nomeFantasia: { contains: busca, mode: 'insensitive' as const } },
              { cnpj: { contains: busca } },
            ],
          }
        : {}),
    };

    const [total, fornecedores] = await Promise.all([
      prisma.fornecedor.count({ where }),
      prisma.fornecedor.findMany({
        where,
        orderBy: { razaoSocial: 'asc' },
        skip: (pagina - 1) * limite,
        take: limite,
      }),
    ]);

    res.json({ total, pagina, limite, fornecedores });
  } catch (e) {
    next(e);
  }
});

// GET /api/fornecedores/sugestoes-pncp — apenas dados já observados nas pesquisas do usuário
router.get(
  '/sugestoes-pncp',
  autenticar,
  exigirRole('ADMIN', 'OPERADOR'),
  async (req, res, next) => {
    try {
      const cotacoes = await prisma.cotacao.findMany({
        where: {
          fonte: 'pncp',
          ...(req.usuario.role === 'ADMIN'
            ? {}
            : { item: { pesquisa: { userId: req.usuario.id } } }),
        },
        include: { item: { select: { nome: true } } },
        orderBy: { dataConsulta: 'desc' },
        take: 500,
      });
      const existentes = new Set(
        (await prisma.fornecedor.findMany({ select: { cnpj: true } })).map((f) => f.cnpj),
      );
      const mapa = new Map<
        string,
        {
          cnpj: string;
          razaoSocial: string;
          ocorrencias: number;
          itens: Set<string>;
          ultimoPreco: number | null;
          referencia: string;
        }
      >();
      for (const cotacao of cotacoes) {
        const dados = cotacao.dadosBrutos as {
          cotacoes?: Array<{
            fornecedorCnpj?: string;
            fornecedorNome?: string;
            preco?: number;
            contrato?: string;
          }>;
        } | null;
        for (const encontrada of dados?.cotacoes ?? []) {
          const cnpj = String(encontrada.fornecedorCnpj ?? '').replace(/\D/g, '');
          const razaoSocial = encontrada.fornecedorNome?.trim() ?? '';
          if (cnpj.length !== 14 || razaoSocial.length < 2 || existentes.has(cnpj)) continue;
          const atual = mapa.get(cnpj) ?? {
            cnpj,
            razaoSocial,
            ocorrencias: 0,
            itens: new Set<string>(),
            ultimoPreco: null,
            referencia: encontrada.contrato ?? 'PNCP',
          };
          atual.ocorrencias++;
          atual.itens.add(cotacao.item.nome);
          if (encontrada.preco && encontrada.preco > 0) atual.ultimoPreco = encontrada.preco;
          mapa.set(cnpj, atual);
        }
      }
      res.json({
        sugestoes: [...mapa.values()]
          .map((s) => ({ ...s, itens: [...s.itens].slice(0, 10) }))
          .sort((a, b) => b.ocorrencias - a.ocorrencias)
          .slice(0, 50),
      });
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/fornecedores/importar-pncp — exige confirmação explícita da interface
router.post(
  '/importar-pncp',
  autenticar,
  exigirRole('ADMIN', 'OPERADOR'),
  async (req, res, next) => {
    try {
      const data = z
        .object({
          confirmar: z.literal(true),
          cnpj: z.string().regex(/^\d{14}$/),
          razaoSocial: z.string().min(2),
          referencia: z.string().max(500).optional(),
        })
        .parse(req.body);
      const existente = await prisma.fornecedor.findUnique({ where: { cnpj: data.cnpj } });
      const fornecedor = existente
        ? await prisma.fornecedor.update({
            where: { id: existente.id },
            data: {
              ativo: true,
              origem: 'PNCP',
              referenciaOrigem: data.referencia,
              razaoSocial: data.razaoSocial.trim(),
            },
          })
        : await prisma.fornecedor.create({
            data: {
              cnpj: data.cnpj,
              razaoSocial: data.razaoSocial.trim(),
              origem: 'PNCP',
              referenciaOrigem: data.referencia,
            },
          });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'FORNECEDOR_IMPORTADO_PNCP',
        entidade: 'Fornecedor',
        entidadeId: fornecedor.id,
        detalhe: { cnpj: fornecedor.cnpj, referencia: data.referencia },
        ip: req.ip,
      });
      res.status(existente ? 200 : 201).json(fornecedor);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/consultar-cnpj/:cnpj',
  autenticar,
  exigirRole('ADMIN', 'OPERADOR'),
  async (req, res, next) => {
    try {
      const cnpj = req.params.cnpj.replace(/\D/g, '');
      if (!cnpjValido(cnpj)) throw new ValidacaoError('CNPJ inválido.');
      const cached = cacheCnpj.get(cnpj);
      if (cached && cached.expiraEm > Date.now()) {
        res.json(cached.dados);
        return;
      }

      const resposta = await requisitar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        timeoutMs: 8_000,
        retries: 1,
        pausaMs: 400,
        maxTempoTotalMs: 12_000,
      });
      if (resposta.status === 404)
        throw new NaoEncontradoError('CNPJ não encontrado na base pública.');
      if (!resposta.ok || !resposta.corpoJson)
        throw new AppError(
          'Serviço de consulta de CNPJ temporariamente indisponível.',
          503,
          'CNPJ_INDISPONIVEL',
        );
      const bruto = resposta.corpoJson as Record<string, unknown>;
      const endereco = [
        bruto['descricao_tipo_de_logradouro'],
        bruto['logradouro'],
        bruto['numero'],
        bruto['complemento'],
        bruto['bairro'],
        bruto['cep'],
      ]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)
        .join(', ');
      const dados = {
        cnpj,
        razaoSocial: String(bruto['razao_social'] ?? '').trim(),
        nomeFantasia: String(bruto['nome_fantasia'] ?? '').trim(),
        email: String(bruto['email'] ?? '')
          .trim()
          .toLowerCase(),
        telefone: String(bruto['ddd_telefone_1'] ?? bruto['ddd_telefone_2'] ?? '').trim(),
        municipio: String(bruto['municipio'] ?? '').trim(),
        uf: String(bruto['uf'] ?? '')
          .trim()
          .toUpperCase(),
        endereco,
        situacaoCadastral: String(bruto['descricao_situacao_cadastral'] ?? '').trim(),
        atividadePrincipal: String(bruto['cnae_fiscal_descricao'] ?? '').trim(),
        fonte: 'BrasilAPI',
      };
      cacheCnpj.set(cnpj, { expiraEm: Date.now() + 24 * 60 * 60 * 1000, dados });
      res.json(dados);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/metricas', autenticar, exigirRole('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const escopo =
      req.usuario.role === 'ADMIN' ? {} : { item: { pesquisa: { userId: req.usuario.id } } };
    const [totalAtivos, cotacoes] = await Promise.all([
      prisma.fornecedor.count({ where: { ativo: true } }),
      prisma.cotacaoDireta.findMany({ where: escopo, include: { fornecedor: true } }),
    ]);
    const respondidas = cotacoes.filter((c) => c.status === 'RESPONDIDA');
    const enviadas = cotacoes.filter((c) =>
      ['ENVIADA', 'RESPONDIDA', 'RECUSADA', 'VENCIDA'].includes(c.status),
    );
    const tempos = respondidas
      .filter((c) => c.dataResposta)
      .map(
        (c) =>
          (c.dataResposta!.getTime() - (c.dataEnvio ?? c.dataSolicitacao).getTime()) / 3_600_000,
      )
      .filter((h) => h >= 0);
    const porFornecedor = new Map<string, { nome: string; respostas: number }>();
    for (const c of respondidas) {
      const atual = porFornecedor.get(c.fornecedorId) ?? {
        nome: c.fornecedor.nomeFantasia || c.fornecedor.razaoSocial,
        respostas: 0,
      };
      atual.respostas++;
      porFornecedor.set(c.fornecedorId, atual);
    }
    const ranking = [...porFornecedor.values()].sort((a, b) => b.respostas - a.respostas);
    const alertas: Array<{ tipo: string; mensagem: string }> = [];
    if (respondidas.length >= 3 && ranking[0] && ranking[0].respostas / respondidas.length > 0.6) {
      alertas.push({
        tipo: 'CONCENTRACAO',
        mensagem: `${ranking[0].nome} concentra ${Math.round((ranking[0].respostas / respondidas.length) * 100)}% das respostas.`,
      });
    }
    const outliers = respondidas.filter((c) => c.outlier).length;
    if (outliers > 0)
      alertas.push({
        tipo: 'OUTLIER',
        mensagem: `${outliers} cotação(ões) direta(s) estão fora da faixa aceita.`,
      });
    const vencidas = cotacoes.filter((c) => c.status === 'VENCIDA').length;
    if (vencidas > 0)
      alertas.push({
        tipo: 'VENCIDA',
        mensagem: `${vencidas} solicitação(ões) venceram sem resposta.`,
      });
    res.json({
      totalAtivos,
      totalSolicitacoes: cotacoes.length,
      taxaResposta: enviadas.length
        ? Math.round((respondidas.length / enviadas.length) * 1000) / 10
        : 0,
      tempoMedioRespostaHoras: tempos.length
        ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10
        : null,
      ranking: ranking.slice(0, 5),
      alertas,
    });
  } catch (e) {
    next(e);
  }
});

router.get(
  '/recomendacoes',
  autenticar,
  exigirRole('ADMIN', 'OPERADOR'),
  async (req, res, next) => {
    try {
      const { itemId } = z.object({ itemId: z.string().uuid() }).parse(req.query);
      const item = await prisma.itemPesquisa.findUnique({
        where: { id: itemId },
        include: { pesquisa: true },
      });
      if (!item) throw new NaoEncontradoError('Item não encontrado.');
      if (req.usuario.role !== 'ADMIN' && item.pesquisa.userId !== req.usuario.id)
        throw new NaoEncontradoError('Item não encontrado.');
      const [fornecedores, historico] = await Promise.all([
        prisma.fornecedor.findMany({ where: { ativo: true } }),
        prisma.cotacaoDireta.findMany({ where: { status: 'RESPONDIDA' }, include: { item: true } }),
      ]);
      const alvo = normalizarChave(`${item.nome} ${item.descricao}`);
      const recomendacoes = fornecedores
        .map((fornecedor) => {
          const anteriores = historico.filter((h) => h.fornecedorId === fornecedor.id);
          const semelhantes = anteriores.filter((h) => {
            const texto = normalizarChave(`${h.item.nome} ${h.item.descricao}`);
            const nucleo = normalizarChave(item.nome).split(' ')[0];
            return texto === alvo || (nucleo.length >= 4 && texto.includes(nucleo));
          }).length;
          const mesmaUf = Boolean(item.uf && fornecedor.uf && item.uf === fornecedor.uf);
          const score =
            semelhantes * 5 +
            anteriores.length +
            (mesmaUf ? 2 : 0) +
            (fornecedor.origem === 'PNCP' ? 1 : 0);
          const motivos = [
            semelhantes ? `${semelhantes} resposta(s) para item semelhante` : '',
            mesmaUf ? 'mesma UF' : '',
            fornecedor.origem === 'PNCP' ? 'encontrado no PNCP' : '',
          ].filter(Boolean);
          return { fornecedor, score, motivos };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      res.json({ recomendacoes });
    } catch (e) {
      next(e);
    }
  },
);

// GET /api/fornecedores/:id
router.get('/:id', autenticar, exigirRole('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const f = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
    if (!f) throw new NaoEncontradoError('Fornecedor não encontrado.');
    res.json(f);
  } catch (e) {
    next(e);
  }
});

// POST /api/fornecedores
router.post('/', autenticar, exigirRole('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = normalizarFornecedor(
      schemaFornecedor.parse({
        ...req.body,
        cnpj: String(req.body?.cnpj ?? '').replace(/\D/g, ''),
      }),
    );
    if (!cnpjValido(data.cnpj)) throw new ValidacaoError('CNPJ inválido.');
    try {
      const f = await prisma.fornecedor.create({ data });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'FORNECEDOR_CRIADO',
        entidade: 'Fornecedor',
        entidadeId: f.id,
        detalhe: { cnpj: f.cnpj, origem: f.origem },
        ip: req.ip,
      });
      res.status(201).json(f);
    } catch (e) {
      tratarConflitoCnpj(e);
    }
  } catch (e) {
    next(e);
  }
});

// PUT /api/fornecedores/:id
router.put('/:id', autenticar, exigirRole('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const existente = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new NaoEncontradoError('Fornecedor não encontrado.');
    const parsed = schemaFornecedor
      .partial()
      .parse({
        ...req.body,
        ...(req.body?.cnpj ? { cnpj: String(req.body.cnpj).replace(/\D/g, '') } : {}),
      });
    if (parsed.cnpj && !cnpjValido(parsed.cnpj)) throw new ValidacaoError('CNPJ inválido.');
    const data = {
      ...parsed,
      ...(parsed.cnpj ? { cnpj: parsed.cnpj.replace(/\D/g, '') } : {}),
      ...(parsed.razaoSocial ? { razaoSocial: parsed.razaoSocial.trim() } : {}),
      ...(parsed.email !== undefined ? { email: limparOpcional(parsed.email)?.toLowerCase() } : {}),
      ...(parsed.uf !== undefined ? { uf: limparOpcional(parsed.uf)?.toUpperCase() } : {}),
    };
    try {
      const f = await prisma.fornecedor.update({ where: { id: req.params.id }, data });
      await registrarAuditoria({
        userId: req.usuario.id,
        acao: 'FORNECEDOR_ATUALIZADO',
        entidade: 'Fornecedor',
        entidadeId: f.id,
        detalhe: { antes: existente, depois: f },
        ip: req.ip,
      });
      res.json(f);
    } catch (e) {
      tratarConflitoCnpj(e);
    }
  } catch (e) {
    next(e);
  }
});

// DELETE /api/fornecedores/:id — desativa
router.delete('/:id', autenticar, exigirRole('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const existente = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new NaoEncontradoError('Fornecedor não encontrado.');
    await prisma.fornecedor.update({ where: { id: req.params.id }, data: { ativo: false } });
    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'FORNECEDOR_DESATIVADO',
      entidade: 'Fornecedor',
      entidadeId: existente.id,
      detalhe: { cnpj: existente.cnpj },
      ip: req.ip,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
