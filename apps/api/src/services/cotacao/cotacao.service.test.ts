import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adapter: {
    consultar: vi.fn(),
  },
  prisma: {
    cotacao: { deleteMany: vi.fn(), create: vi.fn() },
    historicoPreco: { create: vi.fn() },
    cotacaoDireta: { findMany: vi.fn() },
    itemPesquisa: { update: vi.fn() },
    itemCatalogo: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('../../config/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('./fonteRegistry.js', () => ({ adapterPara: () => mocks.adapter }));
vi.mock('../notificacao.service.js', () => ({ notificar: vi.fn() }));

import { cotarItem } from './cotacao.service.js';

describe('orquestração das três cotações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.cotacao.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.cotacao.create.mockResolvedValue({});
    mocks.prisma.historicoPreco.create.mockResolvedValue({});
    mocks.prisma.cotacaoDireta.findMany.mockResolvedValue([]);
    mocks.prisma.itemPesquisa.update.mockResolvedValue({});
    mocks.prisma.itemCatalogo.findUnique.mockResolvedValue(null);
    mocks.prisma.itemCatalogo.upsert.mockResolvedValue({});
    mocks.adapter.consultar.mockResolvedValue({
      preco: 11,
      referencia: 'PNCP 1; PNCP 2; PNCP 3',
      fundamentacaoArtigo: 'Art. 23',
      dadosBrutos: { precos: [10, 11, 12] },
      cotacoes: [
        { preco: 10, referencia: 'PNCP 1' },
        { preco: 11, referencia: 'PNCP 2' },
        { preco: 12, referencia: 'PNCP 3' },
      ],
    });
  });

  it('considera os três preços no cálculo e no histórico', async () => {
    const resultado = await cotarItem(
      'item-1',
      {
        nome: 'Caneta',
        descricao: 'Caneta esferográfica azul',
        descricaoNormalizada: 'caneta esferografica azul',
        cascata: ['caneta esferografica azul'],
        quantidade: 2,
        unidadeMedida: 'Unidade',
      },
      [
        {
          slug: 'pncp',
          tipo: 'API_REST',
          pausaMs: 0,
          fundamentacaoArtigo: 'Art. 23',
        } as never,
      ],
      { metodoCalculo: 'MEDIA', limiteOutlierPercentual: 30, minFontesCompleta: 3 },
      { pesquisaId: 'pesquisa-1', autorId: 'usuario-1' },
    );

    expect(resultado).toMatchObject({
      statusItem: 'COTADO',
      precoReferencia: 11,
      precoTotal: 22,
      fontesComPreco: 3,
      completa: true,
    });
    expect(mocks.prisma.historicoPreco.create).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.itemPesquisa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ precoReferencia: 11, precoTotal: 22 }),
      }),
    );
  });
});
