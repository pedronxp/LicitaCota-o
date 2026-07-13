import { MENSAGENS_STATUS } from '@licitapreco/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { calcularPrecoReferencia } from './calculo.js';
import { registrarMetrica } from '../metricas.service.js';

interface EvidenciaCalculo {
  id: string;
  preco: number;
  origemChave: string;
  independenciaChave: string;
  cotacaoDiretaId?: string | null;
  status: 'VALIDA' | 'LEGADA';
}

function json(valor: unknown): Prisma.InputJsonValue {
  return valor as Prisma.InputJsonValue;
}

export async function recalcularItemECobertura(itemId: string): Promise<void> {
  const item = await prisma.itemPesquisa.findUnique({
    where: { id: itemId },
    include: {
      evidencias: true,
      cotacoes: true,
      cotacoesDiretas: { include: { fornecedor: true } },
      pesquisa: true,
    },
  });
  if (!item) return;

  let evidencias: EvidenciaCalculo[] = item.evidencias
    .filter((evidencia) => evidencia.status === 'VALIDA')
    .map((evidencia) => ({
      id: evidencia.id,
      preco: Number(evidencia.preco),
      origemChave: evidencia.origemChave,
      independenciaChave: evidencia.independenciaChave,
      cotacaoDiretaId: evidencia.cotacaoDiretaId,
      status: 'VALIDA',
    }));

  // Compatibilidade temporária para pesquisas ainda não processadas pelo backfill.
  if (item.evidencias.length === 0) {
    const automaticas = item.cotacoes
      .filter((cotacao) => cotacao.preco !== null && Number(cotacao.preco) > 0)
      .map((cotacao) => ({
        id: `cotacao:${cotacao.id}`,
        preco: Number(cotacao.preco),
        origemChave: `fonte:${cotacao.fonte}`,
        independenciaChave: `cotacao:${cotacao.id}`,
        status: 'LEGADA' as const,
      }));
    const agora = new Date();
    const diretas = item.cotacoesDiretas
      .filter(
        (cotacao) =>
          cotacao.status === 'RESPONDIDA' &&
          cotacao.preco !== null &&
          (!cotacao.validadeAte || cotacao.validadeAte >= agora),
      )
      .map((cotacao) => ({
        id: `direta:${cotacao.id}`,
        preco: Number(cotacao.preco),
        origemChave: `fornecedor:${cotacao.fornecedorId}`,
        independenciaChave: `direta:${cotacao.id}`,
        cotacaoDiretaId: cotacao.id,
        status: 'LEGADA' as const,
      }));
    evidencias = [...automaticas, ...diretas];
  }

  const porIndependencia = new Map<string, EvidenciaCalculo>();
  for (const evidencia of evidencias)
    if (!porIndependencia.has(evidencia.independenciaChave))
      porIndependencia.set(evidencia.independenciaChave, evidencia);
  evidencias = [...porIndependencia.values()];
  const evidenciasIndependentes = evidencias.length;
  const metodo = item.pesquisa.metodoCalculoSnapshot ?? 'MENOR_PRECO';
  const limiteOutlier = item.pesquisa.limiteOutlierSnapshot ?? 30;
  const metaOrigens = item.pesquisa.metaOrigensMinima;
  const calc = calcularPrecoReferencia(
    evidencias.map((evidencia) => evidencia.preco),
    {
      metodo,
      limiteOutlierPercentual: limiteOutlier,
      minFontes: metaOrigens,
      quantidadeOrigens: evidenciasIndependentes,
    },
  );

  const descartadas = evidencias.filter((evidencia) =>
    calc.precosDescartados.includes(evidencia.preco),
  );
  const consideradas = evidencias.filter(
    (evidencia) => !calc.precosDescartados.includes(evidencia.preco),
  );
  const idsDiretasOutlier = new Set(
    descartadas.map((evidencia) => evidencia.cotacaoDiretaId).filter(Boolean),
  );
  await Promise.all(
    item.cotacoesDiretas.map((cotacao) => {
      const outlier = idsDiretasOutlier.has(cotacao.id);
      return cotacao.outlier === outlier
        ? Promise.resolve(cotacao)
        : prisma.cotacaoDireta.update({ where: { id: cotacao.id }, data: { outlier } });
    }),
  );

  const statusItem = calc.precoReferencia === null ? 'SEM_RESULTADO' : 'COTADO';
  const precoTotal =
    calc.precoReferencia === null
      ? null
      : Math.round(calc.precoReferencia * Number(item.quantidade) * 100) / 100;
  const observacao =
    calc.precoReferencia === null
      ? MENSAGENS_STATUS.pesquisaManualNecessaria
      : calc.completa
        ? null
        : MENSAGENS_STATUS.pesquisaIncompleta;
  const resultadoCalculo = {
    metodo,
    limiteOutlierPercentual: limiteOutlier,
    metaOrigens,
    origensDistintas: calc.fontesComPreco,
    evidenciasIndependentes: calc.fontesComPreco,
    completa: calc.completa,
    precosConsiderados: calc.precosConsiderados,
    precosDescartados: calc.precosDescartados,
    evidenciasConsideradas: consideradas.map(
      ({ id, origemChave, independenciaChave, preco, status }) => ({
        id,
        origemChave,
        independenciaChave,
        preco,
        status,
      }),
    ),
    evidenciasDescartadas: descartadas.map(
      ({ id, origemChave, independenciaChave, preco, status }) => ({
        id,
        origemChave,
        independenciaChave,
        preco,
        status,
        motivo: 'OUTLIER_METODOLOGICO',
      }),
    ),
    calculadoEm: new Date().toISOString(),
  };

  await prisma.itemPesquisa.update({
    where: { id: item.id },
    data: {
      statusItem,
      precoReferencia: calc.precoReferencia,
      precoTotal,
      observacao,
      resultadoCalculo: json(resultadoCalculo),
      ...(calc.completa
        ? { justificativaCobertura: null, excecaoAprovadaPorId: null, excecaoAprovadaEm: null }
        : {}),
    },
  });

  const itens = await prisma.itemPesquisa.findMany({
    where: { pesquisaId: item.pesquisaId },
    select: { statusItem: true, precoTotal: true, resultadoCalculo: true },
  });
  const itensComCotacao = itens.filter((registro) => registro.statusItem === 'COTADO').length;
  const itensSemCotacao = itens.filter(
    (registro) => registro.statusItem === 'SEM_RESULTADO',
  ).length;
  const itensComErro = itens.filter((registro) => registro.statusItem === 'ERRO').length;
  const valorTotalEstimado = itens.reduce(
    (total, registro) => total + Number(registro.precoTotal ?? 0),
    0,
  );
  const incompletos = itens.filter(
    (registro) => (registro.resultadoCalculo as { completa?: boolean } | null)?.completa === false,
  ).length;
  await prisma.pesquisa.update({
    where: { id: item.pesquisaId },
    data: {
      itensComCotacao,
      itensSemCotacao,
      itensComErro,
      valorTotalEstimado: valorTotalEstimado || null,
      resumoCobertura: `${itens.length} itens | ${itensComCotacao} cotados | ${incompletos} abaixo da meta | ${itensSemCotacao} sem resultado`,
      arquivoSaidaUrl: null,
    },
  });
  registrarMetrica('item_cobertura_evidencias_independentes', calc.fontesComPreco, {
    pesquisaId: item.pesquisaId,
    itemId: item.id,
    completa: calc.completa,
    meta: metaOrigens,
  });
}
