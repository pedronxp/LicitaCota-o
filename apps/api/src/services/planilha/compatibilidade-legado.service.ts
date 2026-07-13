import { z } from 'zod';

export const schemaConfirmacaoLegada = z.object({
  itens: z
    .array(
      z.object({
        sequencia: z.number().int().min(1),
        nome: z.string().min(1),
        descricao: z.string(),
        quantidade: z.number().positive(),
        unidadeMedida: z.string().default(''),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        camposExtras: z.record(z.union([z.string(), z.number(), z.null()])).default({}),
      }),
    )
    .min(1),
});

export function cabecalhosDeprecacaoConfirmacao(pesquisaId: string): Record<string, string> {
  return {
    Deprecation: 'true',
    Link: `</api/pesquisas/${pesquisaId}/importacao/aplicar>; rel="successor-version"`,
    Warning: '299 - "Endpoint legado; use importacao/aplicar"',
  };
}
