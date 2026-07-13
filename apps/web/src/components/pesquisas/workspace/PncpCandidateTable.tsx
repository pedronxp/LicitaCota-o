'use client';

import { Check, ExternalLink, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, abrirArquivoAutenticado } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { EvidenciaPreco, ItemPesquisa } from '@/types/api';

export default function PncpCandidateTable({
  pesquisaId,
  item,
  onChange,
}: {
  pesquisaId: string;
  item: ItemPesquisa;
  onChange: () => void | Promise<unknown>;
}) {
  const evidencias = item.evidencias ?? [];
  async function decidir(evidencia: EvidenciaPreco, status: 'VALIDA' | 'DESCARTADA') {
    const justificativa =
      status === 'DESCARTADA'
        ? window.prompt('Motivo do descarte (mínimo 5 caracteres):')?.trim()
        : evidencia.possivelDuplicidade
          ? window.prompt('Justifique por que não é duplicidade (mínimo 10 caracteres):')?.trim()
          : undefined;
    if (status === 'DESCARTADA' && (!justificativa || justificativa.length < 5)) return;
    if (
      status === 'VALIDA' &&
      evidencia.possivelDuplicidade &&
      (!justificativa || justificativa.length < 10)
    )
      return;
    try {
      await apiFetch(
        `/api/pesquisas/${pesquisaId}/itens/${item.id}/evidencias/${evidencia.id}/revisao`,
        { method: 'PATCH', body: JSON.stringify({ status, justificativa }) },
      );
      await onChange();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível revisar a evidência.');
    }
  }
  return (
    <section className="card overflow-x-auto" aria-label="Candidatos de preço">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Candidatos encontrados</h3>
        <p className="text-xs text-zinc-400">
          Selecione evidências independentes após conferir referência, unidade e fornecedor.
        </p>
      </div>
      {evidencias.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">
          Nenhum candidato. Configure a abrangência e inicie a busca.
        </p>
      ) : (
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-400">
              <th className="p-2">Órgão / contratação</th>
              <th className="p-2">Fornecedor</th>
              <th className="p-2">Unidade</th>
              <th className="p-2">Data</th>
              <th className="p-2">Preço</th>
              <th className="p-2">Decisão</th>
            </tr>
          </thead>
          <tbody>
            {evidencias.map((e) => {
              const unidadeIncompativel = Boolean(
                e.unidadeOriginal &&
                item.unidadeMedida &&
                normalizarUnidade(e.unidadeOriginal) !== normalizarUnidade(item.unidadeMedida),
              );
              return (
                <tr
                  key={e.id}
                  className={cn(
                    'border-t dark:border-zinc-800',
                    e.status === 'VALIDA' && 'bg-emerald-50/60 dark:bg-emerald-900/10',
                    (e.possivelDuplicidade || unidadeIncompativel) &&
                      'bg-amber-50/60 dark:bg-amber-900/10',
                  )}
                >
                  <td className="p-2">
                    <p className="font-medium">{e.orgaoNome ?? e.fonte ?? e.tipoOrigem}</p>
                    <p className="max-w-[240px] truncate text-xs text-zinc-400">
                      {e.referencia ?? e.independenciaChave}
                    </p>
                  </td>
                  <td className="p-2">
                    {e.fornecedorNome ?? 'Não informado'}
                    {e.fornecedorCnpj && (
                      <p className="text-xs text-zinc-400">{e.fornecedorCnpj}</p>
                    )}
                  </td>
                  <td className="p-2">
                    {e.unidadeOriginal ?? '—'}
                    {unidadeIncompativel && (
                      <span className="ml-1 inline-flex items-center text-amber-600">
                        <ShieldAlert className="h-3.5 w-3.5" /> Divergente
                      </span>
                    )}
                  </td>
                  <td className="p-2">{formatDate(e.dataReferencia)}</td>
                  <td className="p-2 font-mono font-semibold">{formatCurrency(e.preco)}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {e.status === 'PENDENTE' && (
                        <>
                          <button
                            className="btn-secondary text-xs"
                            disabled={unidadeIncompativel}
                            onClick={() => void decidir(e, 'VALIDA')}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Selecionar
                          </button>
                          <button
                            className="btn-ghost text-xs text-red-600"
                            onClick={() => void decidir(e, 'DESCARTADA')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {e.status === 'VALIDA' && (
                        <span className="text-xs font-medium text-emerald-600">Selecionada</span>
                      )}
                      {e.status === 'DESCARTADA' && (
                        <span className="text-xs text-zinc-400">Descartada</span>
                      )}
                      {e.comprovanteUrl && (
                        <button
                          className="btn-ghost"
                          onClick={() => void abrirArquivoAutenticado(e.comprovanteUrl!)}
                          aria-label="Abrir comprovante"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function normalizarUnidade(valor: string): string {
  const chave = valor.trim().toLowerCase();
  return (
    (
      {
        un: 'unidade',
        und: 'unidade',
        unidade: 'unidade',
        cx: 'caixa',
        caixa: 'caixa',
        pct: 'pacote',
        pacote: 'pacote',
      } as Record<string, string>
    )[chave] ?? chave
  );
}
