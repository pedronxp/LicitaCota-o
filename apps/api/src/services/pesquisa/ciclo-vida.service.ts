import type { StatusPesquisa } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { ConflitoError } from '../../utils/errors.js';
import { registrarAuditoria } from '../auditoria.service.js';

const transicoes: Partial<Record<StatusPesquisa, readonly StatusPesquisa[]>> = {
  RASCUNHO: ['COLETANDO'],
  COLETANDO: ['EM_REVISAO', 'ERRO'],
  EM_REVISAO: ['COLETANDO', 'APROVADA'],
  APROVADA: ['EM_REVISAO', 'EMITIDA'],
  EMITIDA: ['EM_REVISAO'],
  ERRO: ['RASCUNHO', 'COLETANDO'],
  // Compatibilidade durante a migração do ciclo legado.
  AGUARDANDO: ['RASCUNHO', 'COLETANDO'],
  PROCESSANDO: ['COLETANDO', 'EM_REVISAO', 'ERRO'],
  CONCLUIDA: ['EM_REVISAO'],
};

export function validarTransicaoPesquisa(atual: StatusPesquisa, destino: StatusPesquisa): void {
  if (!transicoes[atual]?.includes(destino)) {
    throw new ConflitoError(`Transição inválida de ${atual} para ${destino}.`);
  }
}

export async function transicionarPesquisa(dados: {
  pesquisaId: string;
  estadoAtual: StatusPesquisa;
  destino: StatusPesquisa;
  userId: string;
  motivo: string;
  ip?: string;
}): Promise<void> {
  validarTransicaoPesquisa(dados.estadoAtual, dados.destino);
  const resultado = await prisma.pesquisa.updateMany({
    where: { id: dados.pesquisaId, status: dados.estadoAtual },
    data: { status: dados.destino },
  });
  if (resultado.count !== 1)
    throw new ConflitoError('O estado da pesquisa mudou; atualize a página e tente novamente.');
  await registrarAuditoria({
    userId: dados.userId,
    acao: 'PESQUISA_ESTADO_ALTERADO',
    entidade: 'Pesquisa',
    entidadeId: dados.pesquisaId,
    detalhe: { de: dados.estadoAtual, para: dados.destino, motivo: dados.motivo },
    ip: dados.ip,
  });
}

export async function reabrirPesquisaEmitida(dados: {
  pesquisaId: string;
  status: StatusPesquisa;
  userId: string;
  motivo: string;
  ip?: string;
}): Promise<void> {
  if (dados.status !== 'EMITIDA' && dados.status !== 'APROVADA') return;
  await transicionarPesquisa({ ...dados, estadoAtual: dados.status, destino: 'EM_REVISAO' });
  await prisma.pesquisa.update({
    where: { id: dados.pesquisaId },
    data: { arquivoSaidaUrl: null, aprovadaPorId: null, aprovadaEm: null },
  });
}
