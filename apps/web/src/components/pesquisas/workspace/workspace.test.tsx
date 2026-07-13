import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ItemNavigator, { itemResolvido } from './ItemNavigator';
import SearchScopePanel, { escopoPadrao } from './SearchScopePanel';
import type { ItemPesquisa } from '@/types/api';

function item(patch: Partial<ItemPesquisa> = {}): ItemPesquisa {
  return {
    id: 'i1',
    pesquisaId: 'p1',
    sequencia: 1,
    nome: 'Caneta',
    descricao: 'Caneta azul',
    especificacao: null,
    marcaModelo: null,
    localEntrega: null,
    prazoEntregaDias: null,
    garantia: null,
    caracteristicasObrigatorias: null,
    caracteristicasDesejaveis: null,
    anexos: null,
    descricaoNormalizada: null,
    quantidade: '100',
    unidadeMedida: 'UN',
    cidade: null,
    uf: null,
    camposExtras: null,
    precoReferencia: null,
    precoTotal: null,
    statusItem: 'PENDENTE',
    observacao: null,
    ...patch,
  };
}

describe('workspace orientado ao item', () => {
  it('considera cobertura ou exceção como resolução do item', () => {
    expect(
      itemResolvido(
        item({
          resultadoCalculo: {
            metodo: 'MENOR_PRECO',
            metaOrigens: 3,
            origensDistintas: 3,
            completa: true,
          },
        }),
      ),
    ).toBe(true);
    expect(itemResolvido(item({ justificativaCobertura: 'Exceção documentada' }))).toBe(true);
    expect(itemResolvido(item())).toBe(false);
  });

  it('não aplica localização implícita no escopo padrão', () => {
    const escopo = escopoPadrao();
    expect(escopo.abrangencia).toBe('NACIONAL');
    expect(escopo.uf).toBeUndefined();
    expect(escopo.municipio).toBeUndefined();
  });

  it('expõe navegação acessível e classes responsivas', () => {
    const html = renderToStaticMarkup(
      <ItemNavigator itens={[item()]} itemId="i1" onSelect={() => undefined} />,
    );
    expect(html).toContain('aria-label="Fila de itens da pesquisa"');
    expect(html).toContain('lg:border-r');
  });

  it('renderiza campos condicionais de município com rótulos', () => {
    const html = renderToStaticMarkup(
      <SearchScopePanel
        value={{
          abrangencia: 'MUNICIPIO',
          uf: 'MG',
          municipio: 'Cataguases',
          dataInicial: '2025-01-01',
          dataFinal: '2026-01-01',
        }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('Abrangência da busca PNCP');
    expect(html).toContain('Município');
    expect(html).toContain('Cataguases');
  });
});
