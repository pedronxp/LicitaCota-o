import type { FonteCotacao, Prisma } from '@prisma/client';
import type { ResultadoCotacao } from '@licitapreco/shared';
import type { EscopoBuscaPncp } from '@licitapreco/shared';
import { prisma } from '../../config/prisma.js';
import { normalizarChave } from '../../utils/texto.js';
import { adapterPara } from '../cotacao/fonteRegistry.js';
import { carregarDicionario, montarItemNormalizado } from '../cotacao/normalizacao.service.js';
import { registrarMetrica } from '../metricas.service.js';
import {
  montarChaveDedupeEvidencia,
  montarChaveIndependenciaEvidencia,
} from '../cotacao/evidencia.service.js';

interface ResultadoFonteBusca {
  fonteId: string;
  slug: string;
  nome: string;
  tipo: FonteCotacao['tipo'];
  consultadoEm: Date;
  resultado?: ResultadoCotacao;
  erro?: string;
  cache?: boolean;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { expiraEm: number; resultados: ResultadoFonteBusca[] }>();

export function montarChaveCacheBusca(dados: {
  pesquisaId: string;
  itemId: string;
  termo: string;
  escopoPncp: EscopoBuscaPncp;
  fontesIds: string[];
}): string {
  const escopo = dados.escopoPncp;
  return `${dados.pesquisaId}|${dados.itemId}|${normalizarChave(dados.termo)}|${escopo.abrangencia}|${escopo.uf ?? ''}|${normalizarChave(escopo.municipio ?? '')}|${escopo.orgaoCnpj ?? ''}|${escopo.dataInicial}|${escopo.dataFinal}|${dados.fontesIds.join(',')}`;
}

export async function executarIsolado<T>(
  executar: () => Promise<T>,
): Promise<{ valor?: T; erro?: string }> {
  try {
    return { valor: await executar() };
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

export async function executarComConcorrencia<T, R>(
  itens: T[],
  limite: number,
  executar: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < itens.length) {
      const indice = cursor++;
      resultados[indice] = await executar(itens[indice]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limite), itens.length) }, () => worker()),
  );
  return resultados;
}

function json(valor: unknown): Prisma.InputJsonValue {
  return valor as Prisma.InputJsonValue;
}

export async function buscarPrecosAtualizados(params: {
  pesquisaId: string;
  itemId: string;
  autorId: string;
  escopoPncp: EscopoBuscaPncp;
}) {
  const inicio = Date.now();
  const item = await prisma.itemPesquisa.findFirst({
    where: { id: params.itemId, pesquisaId: params.pesquisaId },
    include: { pesquisa: true },
  });
  if (!item) throw new Error('Item não encontrado para a busca online.');

  const fontes = await prisma.fonteCotacao.findMany({
    where: { ativo: true, statusValidacao: 'VALIDA' },
    orderBy: { ordem: 'asc' },
  });
  const termo = [item.nome, item.descricao, item.especificacao].filter(Boolean).join(' ');
  const sessao = await prisma.sessaoBuscaOnline.create({
    data: {
      pesquisaId: params.pesquisaId,
      itemPesquisaId: item.id,
      termo,
      abrangenciaPncp: params.escopoPncp.abrangencia,
      dataInicialPncp: new Date(`${params.escopoPncp.dataInicial}T00:00:00.000Z`),
      dataFinalPncp: new Date(`${params.escopoPncp.dataFinal}T23:59:59.999Z`),
      ufPncp: params.escopoPncp.uf,
      municipioPncp: params.escopoPncp.municipio,
      orgaoCnpjPncp: params.escopoPncp.orgaoCnpj,
      fontes: fontes.map((fonte) => ({ id: fonte.id, slug: fonte.slug, nome: fonte.nome })),
      status: 'PROCESSANDO',
      criadoPorId: params.autorId,
    },
  });

  if (fontes.length === 0) {
    const atualizada = await prisma.sessaoBuscaOnline.update({
      where: { id: sessao.id },
      data: {
        status: 'ERRO',
        erros: [{ mensagem: 'Nenhuma fonte ativa e válida está disponível.' }],
        concluidoEm: new Date(),
      },
    });
    registrarMetrica('busca_online_duracao_ms', Date.now() - inicio, {
      pesquisaId: params.pesquisaId,
      itemId: params.itemId,
      sucesso: false,
      fontes: 0,
    });
    return { ...atualizada, evidenciasCriadas: 0, resultados: [] };
  }

  const chaveCache = montarChaveCacheBusca({
    pesquisaId: params.pesquisaId,
    itemId: item.id,
    termo,
    escopoPncp: params.escopoPncp,
    fontesIds: fontes.map((fonte) => fonte.id),
  });
  const entradaCache = cache.get(chaveCache);
  let resultados: ResultadoFonteBusca[];
  if (entradaCache && entradaCache.expiraEm > Date.now()) {
    resultados = entradaCache.resultados.map((resultado) => ({ ...resultado, cache: true }));
  } else {
    const dicionario = await carregarDicionario();
    const itemNormalizado = montarItemNormalizado(
      {
        nome: item.nome,
        descricao: [item.descricao, item.especificacao].filter(Boolean).join(' '),
        quantidade: Number(item.quantidade),
        unidadeMedida: item.unidadeMedida,
        cidade: item.cidade,
        uf: item.uf,
      },
      dicionario,
    );
    resultados = await executarComConcorrencia(
      fontes,
      2,
      async (fonte): Promise<ResultadoFonteBusca> => {
        const consultadoEm = new Date();
        const consulta = await executarIsolado(() =>
          adapterPara(fonte.tipo, fonte.slug).consultar(itemNormalizado, fonte, {
            pncp: params.escopoPncp,
          }),
        );
        if (consulta.valor) {
          return {
            fonteId: fonte.id,
            slug: fonte.slug,
            nome: fonte.nome,
            tipo: fonte.tipo,
            consultadoEm,
            resultado: consulta.valor,
          };
        }
        {
          return {
            fonteId: fonte.id,
            slug: fonte.slug,
            nome: fonte.nome,
            tipo: fonte.tipo,
            consultadoEm,
            erro: consulta.erro ?? 'Falha desconhecida na fonte.',
          };
        }
      },
    );
    cache.set(chaveCache, { expiraEm: Date.now() + CACHE_TTL_MS, resultados });
  }

  let evidenciasCriadas = 0;
  await prisma.$transaction(async (tx) => {
    for (const fonte of resultados) {
      const resultado = fonte.resultado;
      if (!resultado) continue;
      const origemChave = `fonte:${fonte.slug}`;
      const cotacao = await tx.cotacao.create({
        data: {
          itemPesquisaId: item.id,
          fonte: fonte.slug,
          preco: resultado.preco,
          referencia: resultado.referencia || null,
          fundamentacaoArtigo: resultado.fundamentacaoArtigo || null,
          dataConsulta: fonte.consultadoEm,
          erro: resultado.erro || fonte.erro || null,
          dadosBrutos:
            resultado.dadosBrutos === null || resultado.dadosBrutos === undefined
              ? undefined
              : json(resultado.dadosBrutos),
        },
      });
      const precos =
        resultado.cotacoes?.filter((preco) => preco.preco > 0) ??
        (resultado.preco && resultado.preco > 0
          ? [{ preco: resultado.preco, referencia: resultado.referencia }]
          : []);
      if (precos.length > 0) {
        const dadosEvidencias = precos.map((preco) => {
          const partesContrato = preco.contrato?.split('/') ?? [];
          const orgaoCnpj = (preco.orgaoCnpj ?? partesContrato[0] ?? '').replace(/\D/g, '') || null;
          const pncpAno = Number(partesContrato[1]) || null;
          const pncpSequencial = Number(partesContrato[2]) || null;
          const referencia = preco.referencia || resultado.referencia || fonte.nome;
          const chaveDedupe = montarChaveDedupeEvidencia({
            itemPesquisaId: item.id,
            origemChave,
            referencia,
            preco: preco.preco,
            unidade: preco.unidadeMedida,
            orgaoCnpj,
            pncpAno,
            pncpSequencial,
            pncpNumeroItem: preco.numeroItem,
            fornecedorCnpj: preco.fornecedorCnpj,
          });
          return {
            itemPesquisaId: item.id,
            tipoOrigem:
              fonte.tipo === 'TABELA_REFERENCIA'
                ? ('TABELA_REFERENCIA' as const)
                : ('FONTE_PUBLICA' as const),
            origemChave,
            independenciaChave: montarChaveIndependenciaEvidencia({
              tipoOrigem:
                fonte.tipo === 'TABELA_REFERENCIA' ? 'TABELA_REFERENCIA' : 'FONTE_PUBLICA',
              origemChave,
              referencia,
              orgaoCnpj,
              pncpAno,
              pncpSequencial,
              pncpNumeroItem: preco.numeroItem,
              fornecedorCnpj: preco.fornecedorCnpj,
            }),
            fonte: fonte.slug,
            cotacaoId: cotacao.id,
            chaveDedupe,
            preco: preco.preco,
            dataReferencia: fonte.consultadoEm,
            dataColeta: fonte.consultadoEm,
            referencia,
            orgaoCnpj,
            orgaoNome: preco.orgaoNome ?? null,
            pncpAno,
            pncpSequencial,
            pncpNumeroItem: preco.numeroItem ?? null,
            fornecedorCnpj: preco.fornecedorCnpj?.replace(/\D/g, '') || null,
            fornecedorNome: preco.fornecedorNome ?? null,
            tipoPreco: preco.tipoPreco ?? null,
            unidadeOriginal: preco.unidadeMedida ?? null,
            descricaoOriginal: preco.descricaoOriginal ?? null,
            status: 'PENDENTE' as const,
            criadoPorId: params.autorId,
          };
        });
        const existentes = await tx.evidenciaPreco.findMany({
          where: { itemPesquisaId: item.id, origemChave },
          select: {
            id: true,
            chaveDedupe: true,
            referencia: true,
            orgaoCnpj: true,
            pncpAno: true,
            pncpSequencial: true,
            pncpNumeroItem: true,
            fornecedorCnpj: true,
            preco: true,
          },
        });
        const idsPossiveis = new Set<string>();
        const dadosComDuplicidade = dadosEvidencias.map((candidata) => {
          const semelhante = existentes.find(
            (existente) =>
              existente.chaveDedupe !== candidata.chaveDedupe &&
              ((candidata.orgaoCnpj &&
                candidata.pncpAno &&
                candidata.pncpSequencial &&
                existente.orgaoCnpj === candidata.orgaoCnpj &&
                existente.pncpAno === candidata.pncpAno &&
                existente.pncpSequencial === candidata.pncpSequencial &&
                existente.pncpNumeroItem === candidata.pncpNumeroItem) ||
                (normalizarChave(existente.referencia ?? '') ===
                  normalizarChave(candidata.referencia) &&
                  Number(existente.preco) !== candidata.preco)),
          );
          if (semelhante) idsPossiveis.add(semelhante.id);
          return { ...candidata, possivelDuplicidade: Boolean(semelhante) };
        });
        if (idsPossiveis.size > 0)
          await tx.evidenciaPreco.updateMany({
            where: { id: { in: [...idsPossiveis] } },
            data: { possivelDuplicidade: true },
          });
        const criadas = await tx.evidenciaPreco.createMany({
          skipDuplicates: true,
          data: dadosComDuplicidade,
        });
        evidenciasCriadas += criadas.count;
      }
    }
  });

  const resumos = resultados.map((fonte) => ({
    fonteId: fonte.fonteId,
    slug: fonte.slug,
    nome: fonte.nome,
    consultadoEm: fonte.consultadoEm.toISOString(),
    cache: Boolean(fonte.cache),
    preco: fonte.resultado?.preco ?? null,
    referencia: fonte.resultado?.referencia ?? null,
    quantidade: fonte.resultado?.cotacoes?.length ?? (fonte.resultado?.preco ? 1 : 0),
    erro: fonte.erro ?? fonte.resultado?.erro ?? null,
  }));
  const erros = resumos.filter((resultado) => resultado.erro);
  const atualizada = await prisma.sessaoBuscaOnline.update({
    where: { id: sessao.id },
    data: {
      status: evidenciasCriadas > 0 ? 'CONCLUIDA' : 'ERRO',
      resultados: json(resumos),
      erros: erros.length > 0 ? json(erros) : undefined,
      concluidoEm: new Date(),
    },
  });
  registrarMetrica('busca_online_duracao_ms', Date.now() - inicio, {
    pesquisaId: params.pesquisaId,
    itemId: params.itemId,
    sucesso: evidenciasCriadas > 0,
    fontes: resultados.length,
  });
  for (const resultado of resumos)
    registrarMetrica('busca_online_fonte_sucesso', resultado.erro ? 0 : 1, {
      fonte: resultado.slug,
      cache: resultado.cache,
    });
  return { ...atualizada, escopoPncp: params.escopoPncp, evidenciasCriadas, resultados: resumos };
}
