import { prisma } from '../config/prisma.js';

async function backfillCotacoesAutomaticas(): Promise<number> {
  const cotacoes = await prisma.cotacao.findMany({
    where: { preco: { gt: 0 } },
    select: {
      id: true,
      itemPesquisaId: true,
      fonte: true,
      preco: true,
      referencia: true,
      dataConsulta: true,
      editadaManualmente: true,
      item: { select: { pesquisa: { select: { userId: true } } } },
    },
  });

  const resultado = await prisma.evidenciaPreco.createMany({
    skipDuplicates: true,
    data: cotacoes.flatMap((cotacao) => {
      if (cotacao.preco === null) return [];
      const manual = cotacao.editadaManualmente || cotacao.fonte === 'manual';
      return [
        {
          itemPesquisaId: cotacao.itemPesquisaId,
          tipoOrigem: manual ? ('MANUAL' as const) : ('FONTE_PUBLICA' as const),
          origemChave: manual ? `manual:${cotacao.id}` : `fonte:${cotacao.fonte}`,
          independenciaChave: `cotacao:${cotacao.id}`,
          fonte: cotacao.fonte,
          cotacaoId: cotacao.id,
          chaveDedupe: `cotacao:${cotacao.id}`,
          preco: cotacao.preco,
          dataReferencia: cotacao.dataConsulta,
          dataColeta: cotacao.dataConsulta,
          referencia: cotacao.referencia,
          status: 'VALIDA' as const,
          criadoPorId: cotacao.item.pesquisa.userId,
        },
      ];
    }),
  });
  return resultado.count;
}

async function backfillCotacoesDiretas(): Promise<number> {
  const cotacoes = await prisma.cotacaoDireta.findMany({
    where: { status: 'RESPONDIDA', preco: { gt: 0 } },
    select: {
      id: true,
      itemPesquisaId: true,
      fornecedorId: true,
      preco: true,
      dataResposta: true,
      dataSolicitacao: true,
      anexoRespostaUrl: true,
      fornecedor: { select: { razaoSocial: true, cnpj: true } },
      item: { select: { pesquisa: { select: { userId: true } } } },
    },
  });

  const resultado = await prisma.evidenciaPreco.createMany({
    skipDuplicates: true,
    data: cotacoes.flatMap((cotacao) => {
      if (cotacao.preco === null) return [];
      const dataReferencia = cotacao.dataResposta ?? cotacao.dataSolicitacao;
      return [
        {
          itemPesquisaId: cotacao.itemPesquisaId,
          tipoOrigem: 'FORNECEDOR' as const,
          origemChave: `fornecedor:${cotacao.fornecedorId}`,
          independenciaChave: `direta:${cotacao.id}`,
          cotacaoDiretaId: cotacao.id,
          chaveDedupe: `cotacao-direta:${cotacao.id}`,
          preco: cotacao.preco,
          dataReferencia,
          dataColeta: dataReferencia,
          referencia: `${cotacao.fornecedor.razaoSocial} — CNPJ ${cotacao.fornecedor.cnpj}`,
          comprovanteUrl: cotacao.anexoRespostaUrl,
          status: 'VALIDA' as const,
          criadoPorId: cotacao.item.pesquisa.userId,
        },
      ];
    }),
  });
  return resultado.count;
}

async function main(): Promise<void> {
  const [automaticas, diretas] = await Promise.all([
    backfillCotacoesAutomaticas(),
    backfillCotacoesDiretas(),
  ]);
  // eslint-disable-next-line no-console
  console.log(
    `Backfill concluído: ${automaticas} cotação(ões) e ${diretas} cotação(ões) direta(s) convertidas.`,
  );
}

main()
  .catch((erro) => {
    // eslint-disable-next-line no-console
    console.error('Falha no backfill de evidências:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
