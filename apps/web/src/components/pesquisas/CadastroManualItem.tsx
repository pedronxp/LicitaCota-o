'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Database, History, Loader2, Plus, Search, SearchX, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateItemManual, useSugestoesItens, type SugestaoItemCatalogo } from '@/lib/queries';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { FieldHelp } from '@/components/common/FieldHelp';

interface Props {
  pesquisaId: string;
  onAdded?: () => void;
}

export default function CadastroManualItem({ pesquisaId, onAdded }: Props) {
  const [nome, setNome] = useState('');
  const [termoBusca, setTermoBusca] = useState('');
  const [descricao, setDescricao] = useState('');
  const [especificacao, setEspecificacao] = useState('');
  const [marcaModelo, setMarcaModelo] = useState('');
  const [localEntrega, setLocalEntrega] = useState('');
  const [prazoEntregaDias, setPrazoEntregaDias] = useState('');
  const [garantia, setGarantia] = useState('');
  const [caracteristicasObrigatorias, setCaracteristicasObrigatorias] = useState('');
  const [caracteristicasDesejaveis, setCaracteristicasDesejaveis] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [unidade, setUnidade] = useState('UN');
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const criar = useCreateItemManual(pesquisaId);
  const sugestoes = useSugestoesItens(termoBusca);

  useEffect(() => {
    const id = window.setTimeout(() => setTermoBusca(nome.trim()), 350);
    return () => window.clearTimeout(id);
  }, [nome]);

  const quantidadeNumerica = Number(quantidade.replace(',', '.'));
  const formularioValido = useMemo(
    () =>
      nome.trim().length >= 2 &&
      descricao.trim().length >= 2 &&
      Number.isFinite(quantidadeNumerica) &&
      quantidadeNumerica > 0 &&
      unidade.trim().length > 0,
    [descricao, nome, quantidadeNumerica, unidade],
  );

  function selecionarSugestao(sugestao: SugestaoItemCatalogo) {
    setNome(sugestao.nome);
    setDescricao(sugestao.descricaoPadrao);
    if (sugestao.unidadeMedida) setUnidade(sugestao.unidadeMedida);
    setMostrarSugestoes(false);
  }

  function continuarManual() {
    if (!descricao.trim()) setDescricao(nome.trim());
    setMostrarSugestoes(false);
  }

  function limparBusca() {
    setNome('');
    setTermoBusca('');
    setMostrarSugestoes(false);
  }

  async function adicionar() {
    if (!formularioValido) {
      toast.error('Informe nome, descrição, quantidade e unidade.');
      return;
    }
    try {
      await criar.mutateAsync({
        nome: nome.trim(),
        descricao: descricao.trim(),
        especificacao: especificacao.trim() || undefined,
        marcaModelo: marcaModelo.trim() || undefined,
        localEntrega: localEntrega.trim() || undefined,
        prazoEntregaDias: prazoEntregaDias ? Number(prazoEntregaDias) : undefined,
        garantia: garantia.trim() || undefined,
        caracteristicasObrigatorias: caracteristicasObrigatorias.trim() || undefined,
        caracteristicasDesejaveis: caracteristicasDesejaveis.trim() || undefined,
        quantidade: quantidadeNumerica,
        unidadeMedida: unidade.trim().toUpperCase(),
      });
      toast.success('Item adicionado. Configure a abrangência antes de buscar preços.');
      setNome('');
      setTermoBusca('');
      setDescricao('');
      setEspecificacao('');
      setMarcaModelo('');
      setLocalEntrega('');
      setPrazoEntregaDias('');
      setGarantia('');
      setCaracteristicasObrigatorias('');
      setCaracteristicasDesejaveis('');
      setQuantidade('1');
      setUnidade('UN');
      setMostrarSugestoes(false);
      onAdded?.();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Erro ao adicionar item.');
    }
  }

  const processando = criar.isPending;
  const deveMostrarPainel = mostrarSugestoes && termoBusca.length >= 3;

  return (
    <section className="card mb-5 overflow-visible border border-blue-100 bg-gradient-to-b from-white to-blue-50/20 p-0 dark:border-blue-900/50 dark:from-zinc-900 dark:to-blue-950/10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Adicionar item ao dossiê
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Comece pelo nome. O sistema consulta catálogo e histórico após três caracteres.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Database className="h-3 w-3" /> Catálogo + histórico
        </span>
      </header>

      <div className="space-y-4 p-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="nome-item-manual" className="label mb-0">
              Nome do item *
            </label>
            {termoBusca.length >= 3 && (
              <span className="text-[11px] text-zinc-400">Busca automática</span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="nome-item-manual"
              value={nome}
              onChange={(evento) => {
                setNome(evento.target.value);
                setMostrarSugestoes(true);
              }}
              onFocus={() => setMostrarSugestoes(true)}
              onKeyDown={(evento) => {
                if (evento.key === 'Escape') setMostrarSugestoes(false);
              }}
              className="input h-12 pl-10 pr-10 text-sm"
              placeholder="Ex.: notebook, papel A4 ou caneta azul"
              autoComplete="off"
            />
            {sugestoes.isFetching ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />
            ) : (
              nome && (
                <button
                  type="button"
                  onClick={limparBusca}
                  aria-label="Limpar nome do item"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              )
            )}
          </div>

          {deveMostrarPainel && (
            <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              {sugestoes.isLoading ? (
                <div className="flex items-center gap-3 px-4 py-4 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  Consultando sugestões internas...
                </div>
              ) : sugestoes.isError ? (
                <div className="flex items-center gap-3 px-4 py-4 text-sm text-red-600">
                  <SearchX className="h-4 w-4" />
                  Não foi possível consultar o catálogo. O cadastro manual continua disponível.
                </div>
              ) : sugestoes.data?.sugestoes.length ? (
                <div
                  className="max-h-64 overflow-y-auto"
                  role="listbox"
                  aria-label="Sugestões de itens"
                >
                  <div className="border-b border-zinc-100 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                    Sugestões encontradas
                  </div>
                  {sugestoes.data.sugestoes.map((sugestao) => (
                    <button
                      key={`${sugestao.origem}-${sugestao.id ?? sugestao.nome}`}
                      type="button"
                      onClick={() => selecionarSugestao(sugestao)}
                      className="flex w-full items-start gap-3 border-b border-zinc-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-blue-50 dark:border-zinc-800 dark:hover:bg-blue-900/20"
                    >
                      <span
                        className={cn(
                          'mt-0.5 rounded-lg p-1.5',
                          sugestao.origem === 'CATALOGO'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30',
                        )}
                      >
                        {sugestao.origem === 'CATALOGO' ? (
                          <Database className="h-4 w-4" />
                        ) : (
                          <History className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {sugestao.descricaoPadrao}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500">
                          {[
                            sugestao.origem === 'CATALOGO' ? 'Catálogo' : 'Histórico',
                            sugestao.unidadeMedida,
                            sugestao.ultimoPrecoReferencia
                              ? formatCurrency(sugestao.ultimoPrecoReferencia)
                              : '',
                            sugestao.ultimaDataReferencia
                              ? formatDate(sugestao.ultimaDataReferencia)
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="rounded-lg bg-zinc-100 p-2 text-zinc-500 dark:bg-zinc-800">
                      <SearchX className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                        Nenhum resultado interno para “{termoBusca}”
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Você pode cadastrar o item e consultar preços online em seguida.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={continuarManual}
                    className="btn-secondary whitespace-nowrap text-xs"
                  >
                    Usar este nome
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_130px]">
          <div>
            <label htmlFor="descricao-item-manual" className="label">
              Descrição padronizada *{' '}
              <FieldHelp
                helpKey="descricaoItem"
                text="Use descrição objetiva e comparável. Evite termos genéricos que possam retornar itens diferentes no PNCP."
              />
            </label>
            <input
              id="descricao-item-manual"
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              className="input"
              placeholder="Descreva exatamente o objeto a ser cotado"
            />
          </div>
          <div>
            <label htmlFor="quantidade-item-manual" className="label">
              Quantidade *
            </label>
            <input
              id="quantidade-item-manual"
              value={quantidade}
              onChange={(evento) => setQuantidade(evento.target.value)}
              inputMode="decimal"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="unidade-item-manual" className="label">
              Unidade *
            </label>
            <input
              id="unidade-item-manual"
              value={unidade}
              onChange={(evento) => setUnidade(evento.target.value)}
              className="input uppercase"
              placeholder="UN"
            />
          </div>
        </div>

        <div>
          <label htmlFor="especificacao-item-manual" className="label">
            Especificação complementar
          </label>
          <textarea
            id="especificacao-item-manual"
            value={especificacao}
            onChange={(evento) => setEspecificacao(evento.target.value)}
            rows={2}
            className="input resize-y"
            placeholder="Material, dimensões, modelo, cor, embalagem ou outra característica importante"
          />
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Quanto mais específica a descrição, mais relevantes serão os resultados online.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">
              Marca / modelo de referência{' '}
              <FieldHelp text="Preencha somente quando tecnicamente necessário. A aceitação de equivalentes deve observar a justificativa do processo." />
            </label>
            <input
              value={marcaModelo}
              onChange={(e) => setMarcaModelo(e.target.value)}
              className="input"
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="label">Local de entrega</label>
            <input
              value={localEntrega}
              onChange={(e) => setLocalEntrega(e.target.value)}
              className="input"
              placeholder="Almoxarifado, secretaria ou endereço"
            />
          </div>
          <div>
            <label className="label">Prazo de entrega (dias)</label>
            <input
              value={prazoEntregaDias}
              onChange={(e) => setPrazoEntregaDias(e.target.value)}
              type="number"
              min={0}
              className="input"
            />
          </div>
          <div>
            <label className="label">Garantia</label>
            <input
              value={garantia}
              onChange={(e) => setGarantia(e.target.value)}
              className="input"
              placeholder="Ex.: 12 meses"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Características obrigatórias</label>
            <textarea
              value={caracteristicasObrigatorias}
              onChange={(e) => setCaracteristicasObrigatorias(e.target.value)}
              rows={2}
              className="input resize-y"
              placeholder="Requisitos que todos os preços comparados devem atender"
            />
          </div>
          <div>
            <label className="label">Características desejáveis</label>
            <textarea
              value={caracteristicasDesejaveis}
              onChange={(e) => setCaracteristicasDesejaveis(e.target.value)}
              rows={2}
              className="input resize-y"
              placeholder="Preferências que não invalidam a comparação"
            />
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/70 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            formularioValido ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400',
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          {formularioValido ? 'Item pronto para adicionar' : 'Preencha os campos obrigatórios'}
        </p>
        <button
          type="button"
          onClick={() => void adicionar()}
          disabled={processando || !formularioValido}
          className="btn-primary gap-2"
        >
          {processando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Adicionar item
        </button>
      </footer>
    </section>
  );
}
