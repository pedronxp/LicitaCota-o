'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, FileDown, ListChecks, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useBuscarPrecosAtualizados } from '@/lib/queries';
import { useAuthStore } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { EscopoBuscaPncp, Pesquisa, ResultadoLeitura } from '@/types/api';
import CadastroManualItem from '../CadastroManualItem';
import FluxoDossie from '../FluxoDossie';
import UploadZone from '../UploadZone';
import CoverageSummary from './CoverageSummary';
import ItemNavigator, { itemResolvido } from './ItemNavigator';
import PncpCandidateTable from './PncpCandidateTable';
import ReferenceCalculation from './ReferenceCalculation';
import SearchScopePanel, { escopoPadrao } from './SearchScopePanel';

type Etapa = 'itens' | 'buscar' | 'calcular' | 'exportar';
const etapas: Array<{ id: Etapa; label: string; icon: typeof ListChecks }> = [
  { id: 'itens', label: '1. Itens', icon: ListChecks },
  { id: 'buscar', label: '2. Buscar e revisar', icon: Search },
  { id: 'calcular', label: '3. Calcular', icon: Calculator },
  { id: 'exportar', label: '4. Exportar', icon: FileDown },
];

export default function PesquisaWorkspace({
  pesquisa,
  onRefresh,
}: {
  pesquisa: Pesquisa;
  onRefresh: () => Promise<unknown>;
}) {
  const usuario = useAuthStore((estado) => estado.usuario);
  const podeEditar = usuario?.role !== 'VISUALIZADOR';
  const itens = pesquisa.itens ?? [];
  const [etapa, setEtapa] = useState<Etapa>(itens.length ? 'buscar' : 'itens');
  const [itemId, setItemId] = useState<string | null>(null);
  const [escopo, setEscopo] = useState<EscopoBuscaPncp>(() => escopoPadrao());
  const [preview, setPreview] = useState<ResultadoLeitura | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const buscar = useBuscarPrecosAtualizados(pesquisa.id);

  const itemAtual = useMemo(
    () => itens.find((item) => item.id === itemId) ?? null,
    [itens, itemId],
  );
  const todosResolvidos = itens.length > 0 && itens.every(itemResolvido);

  useEffect(() => {
    if (itemId && itens.some((item) => item.id === itemId)) return;
    setItemId(itens.find((item) => !itemResolvido(item))?.id ?? itens[0]?.id ?? null);
  }, [itens, itemId]);

  async function pesquisar() {
    if (!itemAtual) return;
    if (
      (escopo.abrangencia === 'UF' && !escopo.uf) ||
      (escopo.abrangencia === 'MUNICIPIO' && (!escopo.uf || !escopo.municipio)) ||
      (escopo.abrangencia === 'ORGAO' && !escopo.orgaoCnpj)
    ) {
      toast.error('Preencha os campos obrigatórios da abrangência.');
      return;
    }
    try {
      const resultado = await buscar.mutateAsync({ itemId: itemAtual.id, escopo });
      toast.success(
        resultado.evidenciasCriadas
          ? `${resultado.evidenciasCriadas} candidato(s) encontrado(s).`
          : 'Nenhum candidato novo encontrado.',
      );
      await onRefresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Falha na busca PNCP.');
    }
  }

  async function aplicarImportacao() {
    if (!preview) return;
    const operacoes =
      preview.operacoes ?? preview.itens.map((item) => ({ acao: 'ADICIONAR' as const, item }));
    setAplicando(true);
    try {
      await apiFetch(`/api/pesquisas/${pesquisa.id}/importacao/aplicar`, {
        method: 'POST',
        body: JSON.stringify({ operacoes }),
      });
      toast.success('Importação aplicada sem substituir os demais itens.');
      setPreview(null);
      await onRefresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Falha ao aplicar importação.');
    } finally {
      setAplicando(false);
    }
  }

  function proximoItem() {
    const atual = itemAtual ? itens.findIndex((item) => item.id === itemAtual.id) : -1;
    const proximo = [...itens.slice(atual + 1), ...itens.slice(0, Math.max(0, atual + 1))].find(
      (item) => !itemResolvido(item),
    );
    if (proximo) {
      setItemId(proximo.id);
      setEtapa('buscar');
    } else setEtapa('exportar');
  }

  return (
    <div className="space-y-5">
      <nav className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Etapas da pesquisa">
        {etapas.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setEtapa(id)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors',
              etapa === id
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <ItemNavigator
          itens={itens}
          itemId={itemId}
          onSelect={(id) => {
            setItemId(id);
            setEtapa('buscar');
          }}
        />
        <main className="min-w-0 space-y-4">
          {etapa === 'itens' && (
            <>
              {podeEditar && (
                <CadastroManualItem pesquisaId={pesquisa.id} onAdded={() => onRefresh()} />
              )}
              {podeEditar && (
                <section className="card">
                  <div className="mb-4 flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">Importar ou complementar por XLS</h3>
                  </div>
                  <UploadZone pesquisaId={pesquisa.id} onPreview={setPreview} />
                </section>
              )}
              {preview && (
                <section className="card">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Prévia não destrutiva</h3>
                      <p className="text-xs text-zinc-400">
                        {preview.itens.length} linha(s): adicionar, atualizar ou ignorar.
                      </p>
                    </div>
                    <button
                      className="btn-primary"
                      disabled={aplicando}
                      onClick={() => void aplicarImportacao()}
                    >
                      {aplicando ? 'Aplicando...' : 'Aplicar operações'}
                    </button>
                  </div>
                  <div className="mt-3 space-y-1">
                    {(
                      preview.operacoes ??
                      preview.itens.map((item) => ({ acao: 'ADICIONAR' as const, item }))
                    ).map((op) => (
                      <div
                        key={`${op.item.sequencia}-${op.item.nome}`}
                        className="flex justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800/50"
                      >
                        <span>
                          {op.item.sequencia}. {op.item.nome}
                        </span>
                        <span className="font-medium">{op.acao}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {etapa === 'buscar' && itemAtual && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {itemAtual.sequencia}. {itemAtual.descricao}
                  </h2>
                  <p className="text-sm text-zinc-400">
                    {itemAtual.quantidade} {itemAtual.unidadeMedida}
                    {itemAtual.especificacao ? ` · ${itemAtual.especificacao}` : ''}
                  </p>
                </div>
                {podeEditar && (
                  <button
                    className="btn-primary gap-2"
                    disabled={buscar.isPending}
                    onClick={() => void pesquisar()}
                  >
                    <Search className={cn('h-4 w-4', buscar.isPending && 'animate-pulse')} />
                    {buscar.isPending ? 'Pesquisando...' : 'Buscar no PNCP'}
                  </button>
                )}
              </div>
              <SearchScopePanel value={escopo} onChange={setEscopo} />
              <PncpCandidateTable pesquisaId={pesquisa.id} item={itemAtual} onChange={onRefresh} />
            </>
          )}

          {etapa === 'calcular' && itemAtual && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <CoverageSummary item={itemAtual} meta={pesquisa.metaOrigensMinima} />
                <ReferenceCalculation
                  item={itemAtual}
                  metodo={pesquisa.metodoCalculoSnapshot ?? 'MENOR_PRECO'}
                />
              </div>
              <PncpCandidateTable pesquisaId={pesquisa.id} item={itemAtual} onChange={onRefresh} />
              {podeEditar && (
                <div className="flex justify-end">
                  <button
                    className="btn-primary"
                    disabled={!itemResolvido(itemAtual)}
                    onClick={proximoItem}
                  >
                    {itemResolvido(itemAtual)
                      ? 'Concluir e ir ao próximo item'
                      : 'Complete a cobertura para avançar'}
                  </button>
                </div>
              )}
            </>
          )}

          {etapa === 'exportar' && (
            <>
              <div
                className={cn(
                  'rounded-xl border p-3 text-sm',
                  todosResolvidos
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-900/10 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/10 dark:text-amber-300',
                )}
              >
                {todosResolvidos
                  ? 'Todos os itens estão resolvidos. Revise, aprove e emita a versão.'
                  : 'Ainda existem itens sem cobertura ou justificativa.'}
              </div>
              <FluxoDossie pesquisa={pesquisa} />
              <FluxoDossie pesquisa={pesquisa} modo="documentos" />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
