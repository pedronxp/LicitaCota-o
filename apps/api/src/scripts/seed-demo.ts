import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PESQUISA_ID = '00000000-0000-4000-8000-00000000d001';
const ITEM_COBERTO_ID = '00000000-0000-4000-8000-00000000d101';
const ITEM_EXCECAO_ID = '00000000-0000-4000-8000-00000000d102';

async function main(): Promise<void> {
  const email = process.env.DEMO_USER_EMAIL;
  if (!email)
    throw new Error(
      'Informe DEMO_USER_EMAIL para vincular os dados demonstrativos sem criar usuário ou senha artificiais.',
    );
  const usuario = await prisma.user.findUnique({ where: { email } });
  if (!usuario) throw new Error(`Usuário demonstrativo não encontrado: ${email}`);

  await prisma.pesquisa.upsert({
    where: { id: PESQUISA_ID },
    update: {},
    create: {
      id: PESQUISA_ID,
      titulo: '[DEMO] Dossiê de material de expediente',
      descricao: 'Jornada demonstrativa do cadastro manual à revisão.',
      status: 'EM_REVISAO',
      userId: usuario.id,
      modoEntrada: 'MANUAL',
      numeroProcesso: 'DEMO-2026/001',
      orgaoSetor: 'Departamento de Compras',
      responsavelPesquisa: usuario.nome,
      metodoCalculoSnapshot: 'MEDIANA',
      metaOrigensMinima: 3,
      limiteOutlierSnapshot: 30,
      fontesSnapshot: [
        { slug: 'pncp', nome: 'PNCP' },
        { slug: 'tabela-referencia', nome: 'Tabela de referência' },
      ],
      totalItens: 2,
      itensComCotacao: 2,
      resumoCobertura: '2 itens | 1 coberto | 1 exceção justificada',
      valorTotalEstimado: 230,
    },
  });

  await prisma.itemPesquisa.upsert({
    where: { pesquisaId_sequencia: { pesquisaId: PESQUISA_ID, sequencia: 1 } },
    update: {},
    create: {
      id: ITEM_COBERTO_ID,
      pesquisaId: PESQUISA_ID,
      sequencia: 1,
      nome: 'caneta esferografica azul',
      descricao: 'Caneta esferográfica azul',
      especificacao: 'Ponta média de 1 mm',
      quantidade: 10,
      unidadeMedida: 'UN',
      precoReferencia: 11,
      precoTotal: 110,
      statusItem: 'COTADO',
      resultadoCalculo: {
        metodo: 'MEDIANA',
        metaOrigens: 3,
        origensDistintas: 3,
        completa: true,
        precosConsiderados: [10, 11, 12],
      },
    },
  });
  await prisma.itemPesquisa.upsert({
    where: { pesquisaId_sequencia: { pesquisaId: PESQUISA_ID, sequencia: 2 } },
    update: {},
    create: {
      id: ITEM_EXCECAO_ID,
      pesquisaId: PESQUISA_ID,
      sequencia: 2,
      nome: 'papel a4 75g',
      descricao: 'Papel sulfite A4 75 g',
      especificacao: 'Resma com 500 folhas',
      quantidade: 4,
      unidadeMedida: 'RESMA',
      precoReferencia: 30,
      precoTotal: 120,
      statusItem: 'COTADO',
      resultadoCalculo: {
        metodo: 'MEDIANA',
        metaOrigens: 3,
        origensDistintas: 2,
        completa: false,
        precosConsiderados: [29, 31],
      },
      justificativaCobertura:
        'Mercado local possui somente duas fontes válidas para a especificação no período pesquisado.',
      excecaoAprovadaPorId: usuario.id,
      excecaoAprovadaEm: new Date(),
    },
  });

  const evidencias = [
    {
      itemPesquisaId: ITEM_COBERTO_ID,
      chaveDedupe: 'demo:caneta:pncp',
      independenciaChave: 'demo:caneta:pncp',
      tipoOrigem: 'FONTE_PUBLICA' as const,
      origemChave: 'fonte:pncp',
      fonte: 'PNCP',
      preco: 10,
      referencia: 'Contrato PNCP demonstrativo',
    },
    {
      itemPesquisaId: ITEM_COBERTO_ID,
      chaveDedupe: 'demo:caneta:tabela',
      independenciaChave: 'demo:caneta:tabela',
      tipoOrigem: 'TABELA_REFERENCIA' as const,
      origemChave: 'tabela:referencia-demo',
      fonte: 'Tabela de referência',
      preco: 11,
      referencia: 'Tabela institucional demonstrativa',
    },
    {
      itemPesquisaId: ITEM_COBERTO_ID,
      chaveDedupe: 'demo:caneta:manual',
      independenciaChave: 'demo:caneta:manual',
      tipoOrigem: 'MANUAL' as const,
      origemChave: 'manual:comercio-local',
      fonte: 'Comércio local',
      preco: 12,
      referencia: 'Pesquisa manual demonstrativa',
    },
    {
      itemPesquisaId: ITEM_EXCECAO_ID,
      chaveDedupe: 'demo:papel:pncp',
      independenciaChave: 'demo:papel:pncp',
      tipoOrigem: 'FONTE_PUBLICA' as const,
      origemChave: 'fonte:pncp',
      fonte: 'PNCP',
      preco: 29,
      referencia: 'Contrato PNCP demonstrativo',
    },
    {
      itemPesquisaId: ITEM_EXCECAO_ID,
      chaveDedupe: 'demo:papel:tabela',
      independenciaChave: 'demo:papel:tabela',
      tipoOrigem: 'TABELA_REFERENCIA' as const,
      origemChave: 'tabela:referencia-demo',
      fonte: 'Tabela de referência',
      preco: 31,
      referencia: 'Tabela institucional demonstrativa',
    },
  ];
  for (const evidencia of evidencias) {
    await prisma.evidenciaPreco.upsert({
      where: { chaveDedupe: evidencia.chaveDedupe },
      update: {},
      create: {
        ...evidencia,
        dataReferencia: new Date(),
        status: 'VALIDA',
        criadoPorId: usuario.id,
        revisadoPorId: usuario.id,
        revisadoEm: new Date(),
      },
    });
  }

  for (const item of [
    {
      nomeNormalizado: 'caneta esferografica azul',
      descricaoPadrao: 'Caneta esferográfica azul, ponta média de 1 mm',
      unidadeMedida: 'UN',
      preco: 11,
    },
    {
      nomeNormalizado: 'papel a4 75g',
      descricaoPadrao: 'Papel sulfite A4 75 g, resma com 500 folhas',
      unidadeMedida: 'RESMA',
      preco: 30,
    },
  ])
    await prisma.itemCatalogo.upsert({
      where: { nomeNormalizado: item.nomeNormalizado },
      update: {},
      create: {
        nomeNormalizado: item.nomeNormalizado,
        descricaoPadrao: item.descricaoPadrao,
        unidadeMedida: item.unidadeMedida,
        vezesUsado: 1,
        ultimoPrecoReferencia: item.preco,
        ultimaDataReferencia: new Date(),
      },
    });

  // eslint-disable-next-line no-console
  console.log(`Dados demonstrativos disponíveis na pesquisa ${PESQUISA_ID}.`);
}

main().finally(() => prisma.$disconnect());
