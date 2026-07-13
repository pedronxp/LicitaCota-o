import type { ItemPlanilhaEntrada } from '@licitapreco/shared';
import { normalizarChave } from '../../utils/texto.js';

export type AcaoImportacao = 'ADICIONAR' | 'ATUALIZAR' | 'IGNORAR';

export interface ItemExistenteImportacao {
  id: string;
  sequencia: number;
  nome: string;
  descricao: string;
  quantidade: number;
  unidadeMedida: string | null;
  cidade: string | null;
  uf: string | null;
  camposExtras: unknown;
}

export interface OperacaoImportacao {
  acao: AcaoImportacao;
  itemId?: string;
  item: ItemPlanilhaEntrada;
}

function camposIguais(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function itemEquivalente(novo: ItemPlanilhaEntrada, existente: ItemExistenteImportacao): boolean {
  return (
    normalizarChave(novo.nome) === normalizarChave(existente.nome) &&
    normalizarChave(novo.descricao) === normalizarChave(existente.descricao) &&
    novo.quantidade === existente.quantidade &&
    normalizarChave(novo.unidadeMedida) === normalizarChave(existente.unidadeMedida ?? '') &&
    normalizarChave(novo.cidade ?? '') === normalizarChave(existente.cidade ?? '') &&
    (novo.uf ?? '').toUpperCase() === (existente.uf ?? '').toUpperCase() &&
    camposIguais(novo.camposExtras, existente.camposExtras)
  );
}

export function planejarImportacao(
  itens: ItemPlanilhaEntrada[],
  existentes: ItemExistenteImportacao[],
): OperacaoImportacao[] {
  const porSequencia = new Map(existentes.map((item) => [item.sequencia, item]));
  return itens.map((item) => {
    const existente = porSequencia.get(item.sequencia);
    if (!existente) return { acao: 'ADICIONAR', item };
    return {
      acao: itemEquivalente(item, existente) ? 'IGNORAR' : 'ATUALIZAR',
      itemId: existente.id,
      item,
    };
  });
}
