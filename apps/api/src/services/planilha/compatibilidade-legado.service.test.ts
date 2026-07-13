import { describe, expect, it } from 'vitest';
import {
  cabecalhosDeprecacaoConfirmacao,
  schemaConfirmacaoLegada,
} from './compatibilidade-legado.service.js';

describe('compatibilidade da confirmação legada', () => {
  it('aceita o contrato antigo e aplica os defaults históricos', () => {
    const resultado = schemaConfirmacaoLegada.parse({
      itens: [{ sequencia: 1, nome: 'Item', descricao: '', quantidade: 2 }],
    });
    expect(resultado.itens[0]).toMatchObject({ unidadeMedida: '', camposExtras: {} });
  });

  it('aponta explicitamente para a importação não destrutiva', () => {
    expect(cabecalhosDeprecacaoConfirmacao('p1')).toEqual({
      Deprecation: 'true',
      Link: '</api/pesquisas/p1/importacao/aplicar>; rel="successor-version"',
      Warning: '299 - "Endpoint legado; use importacao/aplicar"',
    });
  });
});
