import { describe, expect, it } from 'vitest';
import { montarChaveDedupeEvidencia } from './evidencia.service.js';

describe('deduplicação de evidências', () => {
  it('gera a mesma chave para a mesma contratação e item em reprocessamentos diferentes', () => {
    const base = {
      itemPesquisaId: 'item-1',
      origemChave: 'fonte:pncp',
      referencia: 'PNCP',
      preco: 10,
      unidade: 'UN',
      orgaoCnpj: '11222333000181',
      pncpAno: 2026,
      pncpSequencial: 15,
      pncpNumeroItem: 2,
      fornecedorCnpj: '33444555000100',
    };
    expect(montarChaveDedupeEvidencia(base)).toBe(montarChaveDedupeEvidencia({ ...base }));
  });

  it('não mistura itens oficiais diferentes', () => {
    const base = {
      itemPesquisaId: 'item-1',
      origemChave: 'fonte:pncp',
      referencia: 'PNCP',
      preco: 10,
      unidade: 'UN',
      orgaoCnpj: '11222333000181',
      pncpAno: 2026,
      pncpSequencial: 15,
    };
    expect(montarChaveDedupeEvidencia({ ...base, pncpNumeroItem: 1 })).not.toBe(
      montarChaveDedupeEvidencia({ ...base, pncpNumeroItem: 2 }),
    );
  });
});
