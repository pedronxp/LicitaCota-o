import { describe, expect, it } from 'vitest';
import { validarTransicaoPesquisa } from './ciclo-vida.service.js';

describe('ciclo de vida do dossiê', () => {
  it('aceita o fluxo normal e a reabertura', () => {
    expect(() => validarTransicaoPesquisa('RASCUNHO', 'COLETANDO')).not.toThrow();
    expect(() => validarTransicaoPesquisa('COLETANDO', 'EM_REVISAO')).not.toThrow();
    expect(() => validarTransicaoPesquisa('EM_REVISAO', 'APROVADA')).not.toThrow();
    expect(() => validarTransicaoPesquisa('EMITIDA', 'EM_REVISAO')).not.toThrow();
  });

  it('bloqueia atalhos que eliminam a revisão', () => {
    expect(() => validarTransicaoPesquisa('RASCUNHO', 'APROVADA')).toThrow('Transição inválida');
    expect(() => validarTransicaoPesquisa('COLETANDO', 'EMITIDA')).toThrow('Transição inválida');
  });
});
