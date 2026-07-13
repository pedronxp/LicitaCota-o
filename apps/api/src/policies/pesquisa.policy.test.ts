import { describe, expect, it } from 'vitest';
import type { Role } from '@licitapreco/shared';
import { ProibidoError } from '../utils/errors.js';
import {
  checarEscopoPesquisa,
  podeExecutarAcaoPesquisa,
  type AcaoPesquisa,
} from './pesquisa.policy.js';

const TODAS_ACOES: AcaoPesquisa[] = [
  'CONSULTAR',
  'CRIAR',
  'EDITAR',
  'COLETAR',
  'REVISAR',
  'APROVAR',
  'EMITIR',
  'EXCLUIR',
];

describe('política de autorização da pesquisa', () => {
  it('permite todas as ações ao administrador', () => {
    for (const acao of TODAS_ACOES) {
      expect(podeExecutarAcaoPesquisa('ADMIN', acao)).toBe(true);
    }
  });

  it('permite ao operador preparar e revisar, mas não aprovar, emitir ou excluir', () => {
    const permitidas: AcaoPesquisa[] = ['CONSULTAR', 'CRIAR', 'EDITAR', 'COLETAR', 'REVISAR'];
    for (const acao of TODAS_ACOES) {
      expect(podeExecutarAcaoPesquisa('OPERADOR', acao)).toBe(permitidas.includes(acao));
    }
  });

  it('mantém o visualizador estritamente em leitura', () => {
    for (const acao of TODAS_ACOES) {
      expect(podeExecutarAcaoPesquisa('VISUALIZADOR', acao)).toBe(acao === 'CONSULTAR');
    }
  });

  it.each<Role>(['OPERADOR', 'VISUALIZADOR'])(
    'restringe o papel %s às pesquisas do próprio usuário',
    (role) => {
      expect(() => checarEscopoPesquisa('dono', 'outro', role)).toThrow(ProibidoError);
      expect(() => checarEscopoPesquisa('dono', 'dono', role)).not.toThrow();
    },
  );

  it('permite ao administrador consultar pesquisa de qualquer proprietário', () => {
    expect(() => checarEscopoPesquisa('dono', 'admin', 'ADMIN')).not.toThrow();
  });
});
