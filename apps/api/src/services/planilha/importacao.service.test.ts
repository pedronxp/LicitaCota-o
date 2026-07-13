import { describe, expect, it } from 'vitest';
import { planejarImportacao, type ItemExistenteImportacao } from './importacao.service.js';

const existente: ItemExistenteImportacao = {
  id: 'item-1',
  sequencia: 1,
  nome: 'Caneta azul',
  descricao: 'Caneta esferográfica azul',
  quantidade: 10,
  unidadeMedida: 'UN',
  cidade: null,
  uf: null,
  camposExtras: {},
};

describe('planejamento de importação', () => {
  it('ignora linha equivalente e adiciona uma sequência nova', () => {
    const operacoes = planejarImportacao(
      [
        {
          sequencia: 1,
          nome: 'Caneta azul',
          descricao: 'Caneta esferográfica azul',
          quantidade: 10,
          unidadeMedida: 'UN',
          camposExtras: {},
        },
        {
          sequencia: 2,
          nome: 'Papel A4',
          descricao: 'Papel sulfite A4',
          quantidade: 5,
          unidadeMedida: 'RESMA',
          camposExtras: {},
        },
      ],
      [existente],
    );
    expect(operacoes.map((op) => op.acao)).toEqual(['IGNORAR', 'ADICIONAR']);
    expect(operacoes[0].itemId).toBe('item-1');
  });

  it('propõe atualização quando os dados da sequência mudam', () => {
    const [operacao] = planejarImportacao(
      [
        {
          sequencia: 1,
          nome: 'Caneta azul',
          descricao: 'Caneta esferográfica azul',
          quantidade: 20,
          unidadeMedida: 'UN',
          camposExtras: {},
        },
      ],
      [existente],
    );
    expect(operacao.acao).toBe('ATUALIZAR');
    expect(operacao.itemId).toBe('item-1');
  });
});
