import { describe, expect, it } from 'vitest';
import { schemaEscopoBuscaPncp } from './escopo-pncp.js';

const periodo = { dataInicial: '2025-07-01', dataFinal: '2026-07-01' };

describe('contrato de abrangência PNCP', () => {
  it('aceita busca nacional sem localização implícita', () => {
    expect(schemaEscopoBuscaPncp.parse({ abrangencia: 'NACIONAL', ...periodo })).toEqual({
      abrangencia: 'NACIONAL',
      ...periodo,
    });
  });

  it('exige UF e município nos escopos correspondentes', () => {
    expect(() => schemaEscopoBuscaPncp.parse({ abrangencia: 'UF', ...periodo })).toThrow();
    expect(() =>
      schemaEscopoBuscaPncp.parse({ abrangencia: 'MUNICIPIO', uf: 'MG', ...periodo }),
    ).toThrow();
    expect(
      schemaEscopoBuscaPncp.parse({
        abrangencia: 'MUNICIPIO',
        uf: 'mg',
        municipio: 'Cataguases',
        ...periodo,
      }).uf,
    ).toBe('MG');
  });

  it('normaliza e exige CNPJ no escopo por órgão', () => {
    expect(() => schemaEscopoBuscaPncp.parse({ abrangencia: 'ORGAO', ...periodo })).toThrow();
    expect(
      schemaEscopoBuscaPncp.parse({
        abrangencia: 'ORGAO',
        orgaoCnpj: '12.345.678/0001-90',
        ...periodo,
      }).orgaoCnpj,
    ).toBe('12345678000190');
  });

  it('rejeita período invertido', () => {
    expect(() =>
      schemaEscopoBuscaPncp.parse({
        abrangencia: 'NACIONAL',
        dataInicial: '2026-07-02',
        dataFinal: '2026-07-01',
      }),
    ).toThrow();
  });
});
