import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { autenticar, exigirRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoria.service.js';
import { cnpjValido, normalizarCnpj } from '../utils/cnpj.js';

const router: Router = Router();

function toJson(v: Record<string, unknown>): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

// GET /api/config
router.get('/', autenticar, async (_req, res, next) => {
  try {
    const config = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } });
    res.json(config ?? {});
  } catch (e) {
    next(e);
  }
});

// PUT /api/config — somente ADMIN
router.put('/', autenticar, exigirRole('ADMIN'), async (req, res, next) => {
  try {
    const data = z
      .object({
        nomeOrgao: z.string().trim().max(200).optional(),
        cnpjOrgao: z.string().trim().optional().or(z.literal('')),
        municipio: z.string().optional(),
        uf: z.string().length(2).optional(),
        brasaoUrl: z.string().url().optional().or(z.literal('')),
        responsavelTecnico: z.string().optional(),
        metodoCalculo: z.enum(['MEDIA', 'MEDIANA', 'MENOR_PRECO']).optional(),
        limiteOutlierPercentual: z.number().int().min(5).max(100).optional(),
        minFontesCompleta: z.number().int().min(1).max(10).optional(),
        itemAmostraTeste: z.string().min(3).optional(),
        textosFundamentacao: z.record(z.string()).optional(),
        smtpConfig: z.record(z.unknown()).optional(),
        canalSuporte: z.record(z.unknown()).optional(),
        secretarias: z.array(z.string().trim().min(2).max(200)).optional(),
        setores: z.array(z.string().trim().min(2).max(200)).optional(),
        textosAjuda: z.record(z.string()).optional(),
        camposConfig: z.record(z.unknown()).optional(),
        templatesRelatorio: z.record(z.unknown()).optional(),
        janelaBuscaDias: z.number().int().min(30).max(3650).optional(),
      })
      .superRefine((valor, ctx) => {
        if (valor.cnpjOrgao && !cnpjValido(valor.cnpjOrgao))
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cnpjOrgao'],
            message: 'CNPJ institucional inválido.',
          });
      })
      .parse(req.body);

    const campos = {
      ...(data.nomeOrgao !== undefined && { nomeOrgao: data.nomeOrgao }),
      ...(data.cnpjOrgao !== undefined && {
        cnpjOrgao: data.cnpjOrgao ? normalizarCnpj(data.cnpjOrgao) : null,
      }),
      ...(data.municipio !== undefined && { municipio: data.municipio }),
      ...(data.uf !== undefined && { uf: data.uf }),
      ...(data.brasaoUrl !== undefined && { brasaoUrl: data.brasaoUrl || null }),
      ...(data.responsavelTecnico !== undefined && { responsavelTecnico: data.responsavelTecnico }),
      ...(data.metodoCalculo !== undefined && { metodoCalculo: data.metodoCalculo }),
      ...(data.limiteOutlierPercentual !== undefined && {
        limiteOutlierPercentual: data.limiteOutlierPercentual,
      }),
      ...(data.minFontesCompleta !== undefined && { minFontesCompleta: data.minFontesCompleta }),
      ...(data.itemAmostraTeste !== undefined && { itemAmostraTeste: data.itemAmostraTeste }),
      ...(data.textosFundamentacao !== undefined && {
        textosFundamentacao: toJson(data.textosFundamentacao),
      }),
      ...(data.smtpConfig !== undefined && { smtpConfig: toJson(data.smtpConfig) }),
      ...(data.canalSuporte !== undefined && { canalSuporte: toJson(data.canalSuporte) }),
      ...(data.secretarias !== undefined && {
        secretarias: data.secretarias as Prisma.InputJsonValue,
      }),
      ...(data.setores !== undefined && { setores: data.setores as Prisma.InputJsonValue }),
      ...(data.textosAjuda !== undefined && { textosAjuda: toJson(data.textosAjuda) }),
      ...(data.camposConfig !== undefined && { camposConfig: toJson(data.camposConfig) }),
      ...(data.templatesRelatorio !== undefined && {
        templatesRelatorio: toJson(data.templatesRelatorio),
      }),
      ...(data.janelaBuscaDias !== undefined && { janelaBuscaDias: data.janelaBuscaDias }),
      updatedById: req.usuario.id,
    };

    const config = await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: campos,
      create: { id: 'singleton', ...campos },
    });

    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'CONFIG_ATUALIZADA',
      entidade: 'ConfiguracaoSistema',
      entidadeId: 'singleton',
      ip: req.ip,
    });

    res.json(config);
  } catch (e) {
    next(e);
  }
});

export default router;
