import { describe, expect, it } from 'vitest';
import { calcularPrecoReferencia } from './calculo.js';

describe('cálculo por evidências e origens distintas', () => {
  it('aceita três preços numericamente iguais quando as identidades já foram deduplicadas', () => {
    const resultado = calcularPrecoReferencia([1.2, 1.2, 1.2], {
      metodo: 'MENOR_PRECO',
      limiteOutlierPercentual: 30,
      minFontes: 3,
      quantidadeOrigens: 3,
    });
    expect(resultado.completa).toBe(true);
    expect(resultado.fontesComPreco).toBe(3);
    expect(resultado.precoReferencia).toBe(1.2);
  });
  it('não considera vários preços da mesma fonte como cobertura completa', () => {
    const resultado = calcularPrecoReferencia([10, 11, 12], {
      metodo: 'MEDIA',
      limiteOutlierPercentual: 50,
      minFontes: 3,
      quantidadeOrigens: 1,
    });
    expect(resultado.fontesComPreco).toBe(1);
    expect(resultado.completa).toBe(false);
    expect(resultado.precoReferencia).toBe(11);
  });

  it('recalcula a cobertura depois de descartar outlier', () => {
    const resultado = calcularPrecoReferencia([10, 11, 1000], {
      metodo: 'MEDIANA',
      limiteOutlierPercentual: 30,
      minFontes: 3,
      quantidadeOrigens: 3,
    });
    expect(resultado.fontesComPreco).toBe(2);
    expect(resultado.completa).toBe(false);
    expect(resultado.precosDescartados).toEqual([1000]);
    expect(resultado.precoReferencia).toBe(10.5);
  });
});
