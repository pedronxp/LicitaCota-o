import { describe, expect, it } from 'vitest';
import { pontuarSugestao } from './catalogo.service.js';

describe('pontuação do catálogo', () => {
  it('prioriza correspondência exata e prefixo', () => {
    expect(pontuarSugestao('caneta azul', 'caneta azul', 1)).toBeGreaterThan(
      pontuarSugestao('caneta azul', 'caneta azul ponta fina', 1),
    );
    expect(pontuarSugestao('caneta azul', 'caneta azul ponta fina', 1)).toBeGreaterThan(
      pontuarSugestao('caneta azul', 'kit escolar com caneta azul', 1),
    );
  });

  it('usa frequência como critério complementar', () => {
    expect(pontuarSugestao('papel a4', 'papel a4 75g', 20)).toBeGreaterThan(
      pontuarSugestao('papel a4', 'papel a4 75g', 0),
    );
  });

  it('não atribui relevância a termo vazio ou sem correspondência', () => {
    expect(pontuarSugestao('', 'caneta azul', 10)).toBe(0);
    expect(pontuarSugestao('computador', 'caneta azul', 10)).toBe(0);
  });
});
