import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { ConflitoError, NaoEncontradoError, ValidacaoError } from '../../utils/errors.js';
import { registrarAuditoria } from '../auditoria.service.js';
import { salvarArquivo } from '../storage.service.js';
import { gerarXlsxDoSnapshot } from './geracao-xlsx.service.js';
import {
  montarSnapshotEmissao,
  snapshotParaJson,
  type SnapshotEmissao,
} from './snapshot.service.js';

export function emissaoVersionadaHabilitada(usuarioId: string): boolean {
  if (!env.FEATURE_DOSSIE_VERSIONADO) return false;
  return (
    env.FEATURE_DOSSIE_PILOT_USERS.length === 0 ||
    env.FEATURE_DOSSIE_PILOT_USERS.includes(usuarioId)
  );
}

export async function criarPreviaDocumento(
  pesquisaId: string,
  usuarioId: string,
): Promise<SnapshotEmissao> {
  const [pesquisa, emissor] = await Promise.all([
    prisma.pesquisa.findUnique({ where: { id: pesquisaId }, select: { versaoAtual: true } }),
    prisma.user.findUnique({
      where: { id: usuarioId },
      select: { id: true, nome: true, cargo: true },
    }),
  ]);
  if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
  if (!emissor) throw new NaoEncontradoError('Usuário emissor não encontrado.');
  return montarSnapshotEmissao({
    pesquisaId,
    versao: pesquisa.versaoAtual + 1,
    emitidoEm: new Date(),
    emissor,
  });
}

export async function emitirDocumentoPesquisa(dados: {
  pesquisaId: string;
  usuarioId: string;
  ip?: string;
}) {
  const [pesquisa, emissor] = await Promise.all([
    prisma.pesquisa.findUnique({ where: { id: dados.pesquisaId } }),
    prisma.user.findUnique({
      where: { id: dados.usuarioId },
      select: { id: true, nome: true, cargo: true },
    }),
  ]);
  if (!pesquisa) throw new NaoEncontradoError('Pesquisa não encontrada.');
  if (!emissor) throw new NaoEncontradoError('Usuário emissor não encontrado.');
  if (!emissaoVersionadaHabilitada(dados.usuarioId))
    throw new ConflitoError('A emissão versionada está restrita ao grupo piloto neste ambiente.');
  if (pesquisa.status !== 'APROVADA')
    throw new ConflitoError('Somente uma pesquisa aprovada pode ser emitida.');

  const pendentes = await prisma.evidenciaPreco.count({
    where: { item: { pesquisaId: pesquisa.id }, status: 'PENDENTE' },
  });
  if (pendentes > 0)
    throw new ValidacaoError(`Existem ${pendentes} evidência(s) pendente(s) de revisão.`);

  const versao = pesquisa.versaoAtual + 1;
  const emitidoEm = new Date();
  const snapshot = await montarSnapshotEmissao({
    pesquisaId: pesquisa.id,
    versao,
    emitidoEm,
    emissor,
  });
  const xlsx = await gerarXlsxDoSnapshot(snapshot);
  const nomeArquivo = `dossie-${pesquisa.id}-v${versao}.xlsx`;
  const arquivo = await salvarArquivo(
    xlsx,
    nomeArquivo,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

  const documento = await prisma.$transaction(async (tx) => {
    const atualizada = await tx.pesquisa.updateMany({
      where: { id: pesquisa.id, status: 'APROVADA', versaoAtual: pesquisa.versaoAtual },
      data: {
        status: 'EMITIDA',
        versaoAtual: versao,
        emitidaEm: emitidoEm,
        arquivoSaidaUrl: arquivo.url,
      },
    });
    if (atualizada.count !== 1)
      throw new ConflitoError(
        'A pesquisa foi alterada durante a emissão. Revise-a antes de tentar novamente.',
      );
    return tx.documentoPesquisa.create({
      data: {
        pesquisaId: pesquisa.id,
        versao,
        snapshot: snapshotParaJson(snapshot),
        arquivoXlsxUrl: arquivo.url,
        emitidoPorId: emissor.id,
        emitidoEm,
      },
    });
  });

  await registrarAuditoria({
    userId: emissor.id,
    acao: 'PESQUISA_ESTADO_ALTERADO',
    entidade: 'Pesquisa',
    entidadeId: pesquisa.id,
    detalhe: {
      de: 'APROVADA',
      para: 'EMITIDA',
      motivo: 'Documento versionado emitido.',
      documentoId: documento.id,
      versao,
    },
    ip: dados.ip,
  });
  await registrarAuditoria({
    userId: emissor.id,
    acao: 'DOCUMENTO_PESQUISA_EMITIDO',
    entidade: 'DocumentoPesquisa',
    entidadeId: documento.id,
    detalhe: { pesquisaId: pesquisa.id, versao, arquivoXlsxUrl: arquivo.url },
    ip: dados.ip,
  });
  return documento;
}
