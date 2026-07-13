import type { CotacaoDireta, TipoOrigemEvidencia } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { normalizarChave } from '../../utils/texto.js';
import { createHash } from 'node:crypto';

export function unidadesCompativeis(
  unidadeItem?: string | null,
  unidadeEvidencia?: string | null,
): boolean {
  if (!unidadeItem || !unidadeEvidencia) return true;
  const aliases: Record<string, string> = {
    un: 'unidade',
    und: 'unidade',
    unidade: 'unidade',
    cx: 'caixa',
    caixa: 'caixa',
    pct: 'pacote',
    pacote: 'pacote',
    resma: 'resma',
  };
  const item = normalizarChave(unidadeItem);
  const evidencia = normalizarChave(unidadeEvidencia);
  return (aliases[item] ?? item) === (aliases[evidencia] ?? evidencia);
}

export function montarChaveOrigem(dados: {
  tipoOrigem: TipoOrigemEvidencia;
  origem?: string | null;
  fornecedorId?: string | null;
}): string {
  if (dados.tipoOrigem === 'FORNECEDOR') {
    if (!dados.fornecedorId) throw new Error('Fornecedor é obrigatório para esta origem.');
    return `fornecedor:${dados.fornecedorId}`;
  }
  const origem = normalizarChave(dados.origem ?? '');
  if (!origem) throw new Error('Identificação da origem é obrigatória.');
  const prefixos: Record<Exclude<TipoOrigemEvidencia, 'FORNECEDOR'>, string> = {
    FONTE_PUBLICA: 'fonte',
    TABELA_REFERENCIA: 'tabela',
    HISTORICO_INTERNO: 'historico',
    MANUAL: 'manual',
  };
  return `${prefixos[dados.tipoOrigem]}:${origem}`;
}

export function montarChaveIndependenciaEvidencia(dados: {
  tipoOrigem: TipoOrigemEvidencia;
  origemChave: string;
  referencia?: string | null;
  cotacaoDiretaId?: string | null;
  fornecedorId?: string | null;
  orgaoCnpj?: string | null;
  pncpAno?: number | null;
  pncpSequencial?: number | null;
  pncpNumeroItem?: number | null;
  fornecedorCnpj?: string | null;
}): string {
  const orgaoCnpj = (dados.orgaoCnpj ?? '').replace(/\D/g, '');
  const fornecedorCnpj = (dados.fornecedorCnpj ?? '').replace(/\D/g, '');
  if (orgaoCnpj && dados.pncpAno && dados.pncpSequencial && dados.pncpNumeroItem != null) {
    return `pncp:${orgaoCnpj}:${dados.pncpAno}:${dados.pncpSequencial}:${dados.pncpNumeroItem}:${fornecedorCnpj || 'sem-fornecedor'}`;
  }
  if (dados.cotacaoDiretaId) return `direta:${dados.cotacaoDiretaId}`;
  if (dados.tipoOrigem === 'FORNECEDOR' && dados.fornecedorId)
    return `fornecedor:${dados.fornecedorId}:${normalizarChave(dados.referencia ?? '') || 'sem-referencia'}`;
  const referencia = normalizarChave(dados.referencia ?? '');
  return `${dados.origemChave}:${referencia || 'sem-referencia'}`;
}

export function montarChaveDedupeEvidencia(dados: {
  itemPesquisaId: string;
  origemChave: string;
  referencia?: string | null;
  preco: number;
  unidade?: string | null;
  orgaoCnpj?: string | null;
  pncpAno?: number | null;
  pncpSequencial?: number | null;
  pncpNumeroItem?: number | null;
  fornecedorCnpj?: string | null;
}): string {
  const identidadePncp =
    dados.orgaoCnpj && dados.pncpAno && dados.pncpSequencial
      ? `${dados.orgaoCnpj}:${dados.pncpAno}:${dados.pncpSequencial}:${dados.pncpNumeroItem ?? 0}`
      : normalizarChave(dados.referencia ?? '');
  const base = [
    dados.itemPesquisaId,
    dados.origemChave,
    identidadePncp,
    dados.fornecedorCnpj ?? '',
    normalizarChave(dados.unidade ?? ''),
    dados.preco.toFixed(4),
  ].join('|');
  return `evidencia:${createHash('sha256').update(base).digest('hex')}`;
}

export async function sincronizarEvidenciaCotacaoDireta(
  cotacao: CotacaoDireta,
  autorId?: string,
): Promise<void> {
  const chaveDedupe = `cotacao-direta:${cotacao.id}`;
  const respondida = cotacao.status === 'RESPONDIDA' && cotacao.preco !== null;
  if (!respondida) {
    await prisma.evidenciaPreco.updateMany({
      where: { chaveDedupe, status: { in: ['PENDENTE', 'VALIDA'] } },
      data: { status: 'INVALIDA', justificativa: 'Cotação direta deixou de estar respondida.' },
    });
    return;
  }

  await prisma.evidenciaPreco.upsert({
    where: { chaveDedupe },
    create: {
      itemPesquisaId: cotacao.itemPesquisaId,
      tipoOrigem: 'FORNECEDOR',
      origemChave: montarChaveOrigem({
        tipoOrigem: 'FORNECEDOR',
        fornecedorId: cotacao.fornecedorId,
      }),
      independenciaChave: montarChaveIndependenciaEvidencia({
        tipoOrigem: 'FORNECEDOR',
        origemChave: montarChaveOrigem({
          tipoOrigem: 'FORNECEDOR',
          fornecedorId: cotacao.fornecedorId,
        }),
        cotacaoDiretaId: cotacao.id,
        fornecedorId: cotacao.fornecedorId,
        referencia: `Cotação direta do fornecedor ${cotacao.fornecedorId}`,
      }),
      fonte: cotacao.fornecedorId,
      cotacaoDiretaId: cotacao.id,
      chaveDedupe,
      preco: cotacao.preco!,
      dataReferencia: cotacao.dataResposta ?? new Date(),
      referencia: `Cotação direta do fornecedor ${cotacao.fornecedorId}`,
      comprovanteUrl: cotacao.anexoRespostaUrl,
      status: 'PENDENTE',
      criadoPorId: autorId,
    },
    update: {
      independenciaChave: montarChaveIndependenciaEvidencia({
        tipoOrigem: 'FORNECEDOR',
        origemChave: montarChaveOrigem({
          tipoOrigem: 'FORNECEDOR',
          fornecedorId: cotacao.fornecedorId,
        }),
        cotacaoDiretaId: cotacao.id,
        fornecedorId: cotacao.fornecedorId,
        referencia: `Cotação direta do fornecedor ${cotacao.fornecedorId}`,
      }),
      preco: cotacao.preco!,
      dataReferencia: cotacao.dataResposta ?? new Date(),
      comprovanteUrl: cotacao.anexoRespostaUrl,
      status: 'PENDENTE',
      justificativa: null,
      revisadoPorId: null,
      revisadoEm: null,
    },
  });
}
