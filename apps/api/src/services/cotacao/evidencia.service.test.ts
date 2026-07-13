import { describe, expect, it } from 'vitest';
import {
  montarChaveIndependenciaEvidencia,
  montarChaveOrigem,
  unidadesCompativeis,
} from './evidencia.service.js';

describe('chave de origem distinta', () => {
  it('normaliza fontes e tabelas sem misturar os tipos', () => {
    expect(montarChaveOrigem({ tipoOrigem: 'FONTE_PUBLICA', origem: ' PNCP Nacional ' })).toBe(
      'fonte:pncp nacional',
    );
    expect(montarChaveOrigem({ tipoOrigem: 'TABELA_REFERENCIA', origem: 'PNCP Nacional' })).toBe(
      'tabela:pncp nacional',
    );
  });

  it('identifica fornecedor pelo cadastro e exige origem manual', () => {
    expect(montarChaveOrigem({ tipoOrigem: 'FORNECEDOR', fornecedorId: 'fornecedor-1' })).toBe(
      'fornecedor:fornecedor-1',
    );
    expect(() => montarChaveOrigem({ tipoOrigem: 'MANUAL', origem: ' ' })).toThrow();
  });
});

describe('chave de independência', () => {
  it('distingue três contratações PNCP mesmo na mesma fonte', () => {
    const base = {
      tipoOrigem: 'FONTE_PUBLICA' as const,
      origemChave: 'fonte:pncp',
      orgaoCnpj: '12345678000190',
      pncpAno: 2026,
      fornecedorCnpj: '11111111000111',
    };
    const chaves = [1, 2, 3].map((pncpSequencial) =>
      montarChaveIndependenciaEvidencia({ ...base, pncpSequencial, pncpNumeroItem: 1 }),
    );
    expect(new Set(chaves).size).toBe(3);
  });

  it('distingue referências manuais independentes mesmo com valores iguais', () => {
    const a = montarChaveIndependenciaEvidencia({
      tipoOrigem: 'MANUAL',
      origemChave: 'manual:mercado-a',
      referencia: 'Proposta A',
    });
    const b = montarChaveIndependenciaEvidencia({
      tipoOrigem: 'MANUAL',
      origemChave: 'manual:mercado-b',
      referencia: 'Proposta B',
    });
    expect(a).not.toBe(b);
  });
});

describe('compatibilidade de unidade', () => {
  it('aceita aliases e rejeita caixa contra unidade', () => {
    expect(unidadesCompativeis('UN', 'unidade')).toBe(true);
    expect(unidadesCompativeis('UN', 'CX')).toBe(false);
  });
});
