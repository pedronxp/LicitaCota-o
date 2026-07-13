import { describe, expect, it } from 'vitest';
import {
  executarComConcorrencia,
  executarIsolado,
  montarChaveCacheBusca,
} from './busca-online.service.js';

describe('controle de concorrência da busca online', () => {
  it('preserva a ordem e limita execuções simultâneas', async () => {
    let ativas = 0;
    let maximo = 0;
    const resultados = await executarComConcorrencia([1, 2, 3, 4], 2, async (valor) => {
      ativas++;
      maximo = Math.max(maximo, ativas);
      await new Promise((resolve) => setTimeout(resolve, 2));
      ativas--;
      return valor * 2;
    });
    expect(resultados).toEqual([2, 4, 6, 8]);
    expect(maximo).toBeLessThanOrEqual(2);
  });

  it('isola a falha de uma fonte sem perder o resultado das demais', async () => {
    const resultados = await Promise.all([
      executarIsolado(async () => ({ preco: 10 })),
      executarIsolado(async () => {
        throw new Error('fonte indisponível');
      }),
    ]);
    expect(resultados[0].valor).toEqual({ preco: 10 });
    expect(resultados[1].erro).toBe('fonte indisponível');
  });

  it('não compartilha cache entre pesquisas ou itens', () => {
    const base = {
      termo: 'caneta azul',
      escopoPncp: {
        abrangencia: 'UF' as const,
        uf: 'SP',
        dataInicial: '2025-01-01',
        dataFinal: '2026-01-01',
      },
      fontesIds: ['pncp'],
    };
    const primeira = montarChaveCacheBusca({ ...base, pesquisaId: 'p1', itemId: 'i1' });
    expect(montarChaveCacheBusca({ ...base, pesquisaId: 'p2', itemId: 'i1' })).not.toBe(primeira);
    expect(montarChaveCacheBusca({ ...base, pesquisaId: 'p1', itemId: 'i2' })).not.toBe(primeira);
  });

  it('não compartilha cache entre abrangências PNCP', () => {
    const base = { pesquisaId: 'p1', itemId: 'i1', termo: 'caneta azul', fontesIds: ['pncp'] };
    const nacional = montarChaveCacheBusca({
      ...base,
      escopoPncp: { abrangencia: 'NACIONAL', dataInicial: '2025-01-01', dataFinal: '2026-01-01' },
    });
    const mineira = montarChaveCacheBusca({
      ...base,
      escopoPncp: {
        abrangencia: 'UF',
        uf: 'MG',
        dataInicial: '2025-01-01',
        dataFinal: '2026-01-01',
      },
    });
    expect(mineira).not.toBe(nacional);
  });
});
