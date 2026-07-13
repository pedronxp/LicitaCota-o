import { z } from 'zod';

const dataIso = /^\d{4}-\d{2}-\d{2}$/;

export const schemaEscopoBuscaPncp = z
  .object({
    abrangencia: z.enum(['NACIONAL', 'UF', 'MUNICIPIO', 'ORGAO']),
    dataInicial: z.string().regex(dataIso, 'Data inicial inválida.'),
    dataFinal: z.string().regex(dataIso, 'Data final inválida.'),
    uf: z
      .string()
      .trim()
      .length(2)
      .transform((valor) => valor.toUpperCase())
      .optional(),
    municipio: z.string().trim().min(2).max(120).optional(),
    orgaoCnpj: z
      .string()
      .transform((valor) => valor.replace(/\D/g, ''))
      .refine((valor) => valor.length === 14, 'CNPJ do órgão inválido.')
      .optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.dataInicial > dados.dataFinal)
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataInicial'],
        message: 'A data inicial deve ser anterior à data final.',
      });
    if (dados.abrangencia === 'UF' && !dados.uf)
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uf'],
        message: 'UF é obrigatória nesta abrangência.',
      });
    if (dados.abrangencia === 'MUNICIPIO' && (!dados.uf || !dados.municipio))
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['municipio'],
        message: 'Município e UF são obrigatórios nesta abrangência.',
      });
    if (dados.abrangencia === 'ORGAO' && !dados.orgaoCnpj)
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orgaoCnpj'],
        message: 'CNPJ é obrigatório nesta abrangência.',
      });
  });

export type EscopoBuscaPncpEntrada = z.infer<typeof schemaEscopoBuscaPncp>;
