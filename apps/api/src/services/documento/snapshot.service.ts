import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { NaoEncontradoError } from '../../utils/errors.js';

export const VERSAO_SCHEMA_SNAPSHOT = '1.0' as const;

export interface EvidenciaSnapshot {
  id: string;
  tipoOrigem: string;
  origemChave: string;
  independenciaChave?: string;
  fonte: string | null;
  preco: number;
  dataReferencia: string | null;
  dataColeta: string;
  referencia: string | null;
  comprovanteUrl: string | null;
  status: string;
  justificativa: string | null;
  fornecedor: { id: string; razaoSocial: string; cnpj: string } | null;
  possivelDuplicidade?: boolean;
  orgaoCnpj?: string | null;
  orgaoNome?: string | null;
  pncpAno?: number | null;
  pncpSequencial?: number | null;
  pncpNumeroItem?: number | null;
  fornecedorCnpj?: string | null;
  fornecedorNome?: string | null;
  tipoPreco?: string | null;
  unidadeOriginal?: string | null;
  descricaoOriginal?: string | null;
}

export interface ItemSnapshot {
  id: string;
  sequencia: number;
  nome: string;
  descricao: string;
  especificacao: string | null;
  marcaModelo?: string | null;
  localEntrega?: string | null;
  prazoEntregaDias?: number | null;
  garantia?: string | null;
  caracteristicasObrigatorias?: string | null;
  caracteristicasDesejaveis?: string | null;
  quantidade: number;
  unidadeMedida: string | null;
  precoReferencia: number | null;
  precoTotal: number | null;
  status: string;
  observacao: string | null;
  justificativaCobertura: string | null;
  excecaoAprovadaEm: string | null;
  resultadoCalculo: unknown;
  evidencias: EvidenciaSnapshot[];
}

export interface SnapshotEmissao {
  schemaVersion: typeof VERSAO_SCHEMA_SNAPSHOT;
  documento: {
    versao: number;
    emitidoEm: string;
    emissor: { id: string; nome: string; cargo: string | null };
    formatos: { xlsx: true; pdf: false; motivoPdf: string };
  };
  processo: {
    pesquisaId: string;
    titulo: string;
    descricao: string | null;
    numeroProcesso: string | null;
    orgaoSetor: string | null;
    responsavelPesquisa: string | null;
    secretariaSolicitante?: string | null;
    unidadeAdministrativa?: string | null;
    responsavelRevisao?: string | null;
    responsavelAprovacao?: string | null;
    exercicioFinanceiro?: number | null;
    modalidade?: string | null;
    prazoDesejado?: string | null;
    dotacaoOrcamentaria?: string | null;
    observacoesGerais?: string | null;
    municipio: string | null;
    uf: string | null;
    fundamentacaoLegal: string | null;
  };
  metodologia: {
    metodoCalculo: string;
    metaOrigensMinima: number;
    limiteOutlierPercentual: number | null;
    fontesHabilitadas: unknown;
  };
  aprovacao: {
    aprovadaEm: string | null;
    aprovadaPor: { id: string; nome: string } | null;
  };
  resumo: {
    totalItens: number;
    itensComCotacao: number;
    itensSemCotacao: number;
    itensComErro: number;
    valorTotalEstimado: number | null;
    cobertura: string | null;
  };
  itens: ItemSnapshot[];
  buscasPncp?: Array<{
    itemPesquisaId: string;
    abrangencia: string;
    dataInicial: string | null;
    dataFinal: string | null;
    uf: string | null;
    municipio: string | null;
    orgaoCnpj: string | null;
    iniciadoEm: string;
  }>;
  templatesRelatorio?: unknown;
  auditoria?: Array<{ acao: string; usuario: string | null; em: string; detalhe: unknown }>;
}

export async function montarSnapshotEmissao(dados: {
  pesquisaId: string;
  versao: number;
  emitidoEm: Date;
  emissor: { id: string; nome: string; cargo: string | null };
}): Promise<SnapshotEmissao> {
  const [pesquisa, config, auditoria] = await Promise.all([
    prisma.pesquisa.findUnique({
      where: { id: dados.pesquisaId },
      include: {
        aprovadaPor: { select: { id: true, nome: true } },
        itens: {
          orderBy: { sequencia: 'asc' },
          include: {
            evidencias: {
              orderBy: [{ origemChave: 'asc' }, { dataColeta: 'asc' }],
              include: {
                cotacaoDireta: {
                  include: { fornecedor: { select: { id: true, razaoSocial: true, cnpj: true } } },
                },
              },
            },
          },
        },
        sessoesBusca: { orderBy: { iniciadoEm: 'asc' } },
      },
    }),
    prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } }),
    prisma.logAuditoria.findMany({
      where: { entidadeId: dados.pesquisaId },
      include: { user: { select: { nome: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');

  return {
    schemaVersion: VERSAO_SCHEMA_SNAPSHOT,
    documento: {
      versao: dados.versao,
      emitidoEm: dados.emitidoEm.toISOString(),
      emissor: dados.emissor,
      formatos: {
        xlsx: true,
        pdf: false,
        motivoPdf:
          'PDF adiado até aprovação do template institucional; XLSX é o formato oficial desta versão.',
      },
    },
    processo: {
      pesquisaId: pesquisa.id,
      titulo: pesquisa.titulo,
      descricao: pesquisa.descricao,
      numeroProcesso: pesquisa.numeroProcesso,
      orgaoSetor: pesquisa.orgaoSetor,
      responsavelPesquisa: pesquisa.responsavelPesquisa,
      secretariaSolicitante: pesquisa.secretariaSolicitante,
      unidadeAdministrativa: pesquisa.unidadeAdministrativa,
      responsavelRevisao: pesquisa.responsavelRevisao,
      responsavelAprovacao: pesquisa.responsavelAprovacao,
      exercicioFinanceiro: pesquisa.exercicioFinanceiro,
      modalidade: pesquisa.modalidade,
      prazoDesejado: pesquisa.prazoDesejado?.toISOString() ?? null,
      dotacaoOrcamentaria: pesquisa.dotacaoOrcamentaria,
      observacoesGerais: pesquisa.observacoesGerais,
      municipio: pesquisa.municipio,
      uf: pesquisa.uf,
      fundamentacaoLegal: pesquisa.fundamentacaoLegal,
    },
    metodologia: {
      metodoCalculo: pesquisa.metodoCalculoSnapshot ?? 'MENOR_PRECO',
      metaOrigensMinima: pesquisa.metaOrigensMinima,
      limiteOutlierPercentual: pesquisa.limiteOutlierSnapshot,
      fontesHabilitadas: pesquisa.fontesSnapshot,
    },
    aprovacao: {
      aprovadaEm: pesquisa.aprovadaEm?.toISOString() ?? null,
      aprovadaPor: pesquisa.aprovadaPor,
    },
    resumo: {
      totalItens: pesquisa.itens.length,
      itensComCotacao: pesquisa.itensComCotacao,
      itensSemCotacao: pesquisa.itensSemCotacao,
      itensComErro: pesquisa.itensComErro,
      valorTotalEstimado:
        pesquisa.valorTotalEstimado === null ? null : Number(pesquisa.valorTotalEstimado),
      cobertura: pesquisa.resumoCobertura,
    },
    itens: pesquisa.itens.map((item) => ({
      id: item.id,
      sequencia: item.sequencia,
      nome: item.nome,
      descricao: item.descricao,
      especificacao: item.especificacao,
      marcaModelo: item.marcaModelo,
      localEntrega: item.localEntrega,
      prazoEntregaDias: item.prazoEntregaDias,
      garantia: item.garantia,
      caracteristicasObrigatorias: item.caracteristicasObrigatorias,
      caracteristicasDesejaveis: item.caracteristicasDesejaveis,
      quantidade: Number(item.quantidade),
      unidadeMedida: item.unidadeMedida,
      precoReferencia: item.precoReferencia === null ? null : Number(item.precoReferencia),
      precoTotal: item.precoTotal === null ? null : Number(item.precoTotal),
      status: item.statusItem,
      observacao: item.observacao,
      justificativaCobertura: item.justificativaCobertura,
      excecaoAprovadaEm: item.excecaoAprovadaEm?.toISOString() ?? null,
      resultadoCalculo: item.resultadoCalculo,
      evidencias: item.evidencias.map((evidencia) => ({
        id: evidencia.id,
        tipoOrigem: evidencia.tipoOrigem,
        origemChave: evidencia.origemChave,
        independenciaChave: evidencia.independenciaChave,
        fonte: evidencia.fonte,
        preco: Number(evidencia.preco),
        dataReferencia: evidencia.dataReferencia?.toISOString() ?? null,
        dataColeta: evidencia.dataColeta.toISOString(),
        referencia: evidencia.referencia,
        comprovanteUrl: evidencia.comprovanteUrl,
        status: evidencia.status,
        justificativa: evidencia.justificativa,
        fornecedor: evidencia.cotacaoDireta?.fornecedor ?? null,
        possivelDuplicidade: evidencia.possivelDuplicidade,
        orgaoCnpj: evidencia.orgaoCnpj,
        orgaoNome: evidencia.orgaoNome,
        pncpAno: evidencia.pncpAno,
        pncpSequencial: evidencia.pncpSequencial,
        pncpNumeroItem: evidencia.pncpNumeroItem,
        fornecedorCnpj: evidencia.fornecedorCnpj,
        fornecedorNome: evidencia.fornecedorNome,
        tipoPreco: evidencia.tipoPreco,
        unidadeOriginal: evidencia.unidadeOriginal,
        descricaoOriginal: evidencia.descricaoOriginal,
      })),
    })),
    buscasPncp: pesquisa.sessoesBusca.map((sessao) => ({
      itemPesquisaId: sessao.itemPesquisaId,
      abrangencia: sessao.abrangenciaPncp,
      dataInicial: sessao.dataInicialPncp?.toISOString() ?? null,
      dataFinal: sessao.dataFinalPncp?.toISOString() ?? null,
      uf: sessao.ufPncp,
      municipio: sessao.municipioPncp,
      orgaoCnpj: sessao.orgaoCnpjPncp,
      iniciadoEm: sessao.iniciadoEm.toISOString(),
    })),
    templatesRelatorio: config?.templatesRelatorio ?? null,
    auditoria: auditoria.map((log) => ({
      acao: log.acao,
      usuario: log.user?.nome ?? null,
      em: log.createdAt.toISOString(),
      detalhe: log.detalhe,
    })),
  };
}

export function snapshotParaJson(snapshot: SnapshotEmissao): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}
