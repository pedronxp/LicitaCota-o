import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { autenticar, exigirRole } from '../middleware/auth.js';
import { NaoEncontradoError } from '../utils/errors.js';
import { registrarAuditoria } from '../services/auditoria.service.js';

const router: Router = Router();

router.get('/', autenticar, async (req, res, next) => {
  try {
    const filtro = z
      .object({
        status: z
          .enum([
            'RECEBIDA',
            'EM_ANALISE',
            'PLANEJADA',
            'EM_DESENVOLVIMENTO',
            'CONCLUIDA',
            'RECUSADA',
          ])
          .optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(req.query);
    const where = {
      ...(req.usuario.role === 'ADMIN' ? {} : { autorId: req.usuario.id }),
      ...(filtro.status ? { status: filtro.status } : {}),
    };
    const [total, sugestoes] = await Promise.all([
      prisma.sugestaoMelhoria.count({ where }),
      prisma.sugestaoMelhoria.findMany({
        where,
        include: {
          autor: { select: { id: true, nome: true } },
          responsavel: { select: { id: true, nome: true } },
        },
        orderBy: [{ prioridade: 'desc' }, { createdAt: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.limite,
        take: filtro.limite,
      }),
    ]);
    res.json({ total, pagina: filtro.pagina, limite: filtro.limite, sugestoes });
  } catch (e) {
    next(e);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const data = z
      .object({
        tipo: z.enum(['SUGESTAO', 'ERRO', 'DIFICULDADE', 'NOVA_FUNCIONALIDADE']),
        titulo: z.string().trim().min(3).max(200),
        descricao: z.string().trim().min(10).max(5000),
        tela: z.string().trim().max(300).optional(),
        prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
        anexoUrl: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    const sugestao = await prisma.sugestaoMelhoria.create({
      data: {
        ...data,
        autorId: req.usuario.id,
        historico: [
          { status: 'RECEBIDA', em: new Date().toISOString(), por: req.usuario.id },
        ] as Prisma.InputJsonValue,
      },
    });
    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'SUGESTAO_CRIADA',
      entidade: 'SugestaoMelhoria',
      entidadeId: sugestao.id,
      detalhe: { tipo: sugestao.tipo, prioridade: sugestao.prioridade },
      ip: req.ip,
    });
    res.status(201).json(sugestao);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', autenticar, exigirRole('ADMIN'), async (req, res, next) => {
  try {
    const existente = await prisma.sugestaoMelhoria.findUnique({ where: { id: req.params.id } });
    if (!existente) throw new NaoEncontradoError('Sugestão não encontrada.');
    const data = z
      .object({
        status: z
          .enum([
            'RECEBIDA',
            'EM_ANALISE',
            'PLANEJADA',
            'EM_DESENVOLVIMENTO',
            'CONCLUIDA',
            'RECUSADA',
          ])
          .optional(),
        prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).optional(),
        responsavelId: z.string().uuid().nullable().optional(),
        comentarioInterno: z.string().trim().max(5000).nullable().optional(),
      })
      .parse(req.body);
    const historico = Array.isArray(existente.historico) ? existente.historico : [];
    const atualizada = await prisma.sugestaoMelhoria.update({
      where: { id: existente.id },
      data: {
        ...data,
        historico: [
          ...historico,
          {
            status: data.status ?? existente.status,
            prioridade: data.prioridade ?? existente.prioridade,
            em: new Date().toISOString(),
            por: req.usuario.id,
          },
        ] as Prisma.InputJsonValue,
      },
    });
    await registrarAuditoria({
      userId: req.usuario.id,
      acao: 'SUGESTAO_ATUALIZADA',
      entidade: 'SugestaoMelhoria',
      entidadeId: atualizada.id,
      detalhe: { antes: existente, depois: atualizada },
      ip: req.ip,
    });
    res.json(atualizada);
  } catch (e) {
    next(e);
  }
});

export default router;
