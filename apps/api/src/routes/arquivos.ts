import path from 'node:path';
import { Router } from 'express';
import { autenticar } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { lerArquivoArmazenado } from '../services/storage.service.js';
import { NaoEncontradoError, ProibidoError, ValidacaoError } from '../utils/errors.js';

const router: Router = Router();

const tipos: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

router.get('/:chave', autenticar, async (req, res, next) => {
  try {
    const chave = req.params.chave;
    if (path.basename(chave) !== chave || !/^[a-zA-Z0-9._-]+$/.test(chave))
      throw new ValidacaoError('Chave de arquivo inválida.');
    const urls = [`/api/arquivos/${chave}`, `/uploads/${chave}`];
    const [pesquisa, documento, evidencia, direta] = await Promise.all([
      prisma.pesquisa.findFirst({
        where: { OR: [{ arquivoEntradaUrl: { in: urls } }, { arquivoSaidaUrl: { in: urls } }] },
        select: { userId: true },
      }),
      prisma.documentoPesquisa.findFirst({
        where: { OR: [{ arquivoXlsxUrl: { in: urls } }, { arquivoPdfUrl: { in: urls } }] },
        select: { pesquisa: { select: { userId: true } } },
      }),
      prisma.evidenciaPreco.findFirst({
        where: { comprovanteUrl: { in: urls } },
        select: { item: { select: { pesquisa: { select: { userId: true } } } } },
      }),
      prisma.cotacaoDireta.findFirst({
        where: { OR: [{ anexoSolicitacaoUrl: { in: urls } }, { anexoRespostaUrl: { in: urls } }] },
        select: { item: { select: { pesquisa: { select: { userId: true } } } } },
      }),
    ]);
    const proprietarioId =
      pesquisa?.userId ??
      documento?.pesquisa.userId ??
      evidencia?.item.pesquisa.userId ??
      direta?.item.pesquisa.userId;
    if (!proprietarioId) throw new NaoEncontradoError('Arquivo sem vínculo ativo.');
    if (req.usuario.role !== 'ADMIN' && req.usuario.id !== proprietarioId)
      throw new ProibidoError();
    const arquivo = await lerArquivoArmazenado(chave);
    if (!arquivo) throw new NaoEncontradoError('Arquivo não encontrado.');
    res.setHeader(
      'Content-Type',
      tipos[path.extname(chave).toLowerCase()] ?? 'application/octet-stream',
    );
    res.setHeader('Content-Disposition', `inline; filename="${chave}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(arquivo);
  } catch (erro) {
    next(erro);
  }
});

export default router;
