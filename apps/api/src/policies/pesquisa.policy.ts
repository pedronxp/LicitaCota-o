import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@licitapreco/shared';
import { ProibidoError } from '../utils/errors.js';

export type AcaoPesquisa =
  | 'CONSULTAR'
  | 'CRIAR'
  | 'EDITAR'
  | 'COLETAR'
  | 'REVISAR'
  | 'APROVAR'
  | 'EMITIR'
  | 'EXCLUIR';

/**
 * Matriz de autorização do dossiê de pesquisa.
 *
 * A política começa conservadora: aprovação, emissão e exclusão ficam com o
 * administrador até que exista um papel institucional específico de aprovador.
 * O escopo por proprietário é validado separadamente por checarEscopoPesquisa.
 */
export const PERMISSOES_PESQUISA: Readonly<Record<AcaoPesquisa, readonly Role[]>> = {
  CONSULTAR: ['ADMIN', 'OPERADOR', 'VISUALIZADOR'],
  CRIAR: ['ADMIN', 'OPERADOR'],
  EDITAR: ['ADMIN', 'OPERADOR'],
  COLETAR: ['ADMIN', 'OPERADOR'],
  REVISAR: ['ADMIN', 'OPERADOR'],
  APROVAR: ['ADMIN'],
  EMITIR: ['ADMIN'],
  EXCLUIR: ['ADMIN'],
};

export function podeExecutarAcaoPesquisa(role: Role, acao: AcaoPesquisa): boolean {
  return PERMISSOES_PESQUISA[acao].includes(role);
}

export function exigirAcaoPesquisa(acao: AcaoPesquisa) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario || !podeExecutarAcaoPesquisa(req.usuario.role, acao)) {
      next(new ProibidoError());
      return;
    }
    next();
  };
}

export function checarEscopoPesquisa(pesquisaUserId: string, usuarioId: string, role: Role): void {
  if (role !== 'ADMIN' && pesquisaUserId !== usuarioId) {
    throw new ProibidoError();
  }
}
