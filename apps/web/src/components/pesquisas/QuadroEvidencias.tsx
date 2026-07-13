'use client';

import { useState } from 'react';
import { Check, ExternalLink, FileUp, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { abrirArquivoAutenticado, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { EvidenciaPreco, ItemPesquisa, TipoOrigemEvidencia } from '@/types/api';

interface Props {
  pesquisaId: string;
  item: ItemPesquisa;
  pesquisando: boolean;
  onBuscar: () => void | Promise<void>;
  onChange: () => void | Promise<unknown>;
}

export default function QuadroEvidencias({ pesquisaId, item, pesquisando, onBuscar, onChange }: Props) {
  const usuario = useAuthStore((estado) => estado.usuario);
  const podeEditar = usuario?.role !== 'VISUALIZADOR';
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [tipoOrigem, setTipoOrigem] = useState<TipoOrigemEvidencia>('MANUAL');
  const [origem, setOrigem] = useState('');
  const [preco, setPreco] = useState('');
  const [dataReferencia, setDataReferencia] = useState(new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [justificativaCobertura, setJustificativaCobertura] = useState('');
  const evidencias = item.evidencias ?? [];
  const cobertura = item.resultadoCalculo;

  async function criar() {
    const valor = Number(preco.replace(',', '.'));
    if (origem.trim().length < 2 || !Number.isFinite(valor) || valor <= 0 || (!referencia.trim() && !arquivo)) {
      toast.error('Informe origem, preço e referência ou comprovante.');
      return;
    }
    setSalvando('nova');
    try {
      const evidencia = await apiFetch<EvidenciaPreco>(`/api/pesquisas/${pesquisaId}/itens/${item.id}/evidencias`, {
        method: 'POST',
        body: JSON.stringify({ tipoOrigem, origem, preco: valor, dataReferencia, referencia: referencia.trim() || arquivo?.name }),
      });
      if (arquivo) {
        const form = new FormData();
        form.append('arquivo', arquivo);
        await apiFetch(`/api/pesquisas/${pesquisaId}/itens/${item.id}/evidencias/${evidencia.id}/anexo`, { method: 'POST', body: form });
      }
      setOrigem(''); setPreco(''); setReferencia(''); setArquivo(null); setMostrarForm(false);
      toast.success('Evidência adicionada para revisão.');
      await onChange();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Erro ao adicionar evidência.');
    } finally { setSalvando(null); }
  }

  async function revisar(evidencia: EvidenciaPreco, status: 'VALIDA' | 'DESCARTADA') {
    const justificativa = status === 'DESCARTADA'
      ? window.prompt('Informe o motivo do descarte (mínimo de 5 caracteres):')?.trim()
      : evidencia.possivelDuplicidade ? window.prompt('Explique por que este registro não é uma duplicidade indevida (mínimo de 10 caracteres):')?.trim() : undefined;
    if (status === 'DESCARTADA' && (!justificativa || justificativa.length < 5)) return;
    if (status === 'VALIDA' && evidencia.possivelDuplicidade && (!justificativa || justificativa.length < 10)) return;
    setSalvando(evidencia.id);
    try {
      await apiFetch(`/api/pesquisas/${pesquisaId}/itens/${item.id}/evidencias/${evidencia.id}/revisao`, {
        method: 'PATCH', body: JSON.stringify({ status, justificativa }),
      });
      toast.success(status === 'VALIDA' ? 'Evidência validada.' : 'Evidência descartada.');
      await onChange();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Erro ao revisar evidência.');
    } finally { setSalvando(null); }
  }

  async function aprovarExcecao() {
    if (justificativaCobertura.trim().length < 10) {
      toast.error('Descreva por que o item pode seguir abaixo da meta.');
      return;
    }
    setSalvando('excecao');
    try {
      await apiFetch(`/api/pesquisas/${pesquisaId}/itens/${item.id}/justificativa-cobertura`, {
        method: 'POST', body: JSON.stringify({ justificativa: justificativaCobertura }),
      });
      toast.success('Exceção de cobertura registrada.');
      setJustificativaCobertura('');
      await onChange();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Erro ao registrar exceção.');
    } finally { setSalvando(null); }
  }

  return (
    <section className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Evidências de preço</p>
          <p className="text-[11px] text-zinc-400">
            {cobertura ? `${cobertura.origensDistintas} de ${cobertura.metaOrigens} origens distintas` : 'Revise cada resultado antes do cálculo'}
          </p>
        </div>
        {podeEditar && <div className="flex gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-xs" onClick={() => setMostrarForm((valor) => !valor)}>
            <Plus className="h-3.5 w-3.5" /> Adicionar manual
          </button>
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-xs" disabled={pesquisando} onClick={() => void onBuscar()}>
            <Search className={cn('h-3.5 w-3.5', pesquisando && 'animate-pulse')} /> {pesquisando ? 'Pesquisando...' : 'Buscar atualizados'}
          </button>
        </div>}
      </div>

      {mostrarForm && podeEditar && <div className="mt-3 grid gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60 sm:grid-cols-2 lg:grid-cols-3">
        <select className="input" value={tipoOrigem} onChange={(evento) => setTipoOrigem(evento.target.value as TipoOrigemEvidencia)}>
          <option value="MANUAL">Entrada manual</option><option value="TABELA_REFERENCIA">Tabela de referência</option><option value="FONTE_PUBLICA">Fonte pública</option><option value="HISTORICO_INTERNO">Histórico interno</option>
        </select>
        <input className="input" placeholder="Origem (órgão, tabela ou site)" value={origem} onChange={(evento) => setOrigem(evento.target.value)} />
        <input className="input" placeholder="Preço unitário" inputMode="decimal" value={preco} onChange={(evento) => setPreco(evento.target.value)} />
        <input className="input" type="date" value={dataReferencia} onChange={(evento) => setDataReferencia(evento.target.value)} />
        <input className="input" placeholder="Referência, processo ou URL" value={referencia} onChange={(evento) => setReferencia(evento.target.value)} />
        <label className="input flex cursor-pointer items-center gap-2 text-xs text-zinc-500"><FileUp className="h-4 w-4" />{arquivo?.name ?? 'Anexar PDF ou imagem'}<input className="hidden" type="file" accept="application/pdf,image/*" onChange={(evento) => setArquivo(evento.target.files?.[0] ?? null)} /></label>
        <button className="btn-primary sm:col-span-2 lg:col-span-3" disabled={salvando === 'nova'} onClick={() => void criar()}>{salvando === 'nova' ? 'Salvando...' : 'Salvar evidência'}</button>
      </div>}

      {evidencias.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {evidencias.map((evidencia) => <article key={evidencia.id} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
          <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-zinc-700 dark:text-zinc-300">{evidencia.fonte ?? evidencia.tipoOrigem}</p><p className="font-mono font-bold">{formatCurrency(evidencia.preco)}</p></div><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', evidencia.status === 'VALIDA' ? 'bg-emerald-100 text-emerald-700' : evidencia.status === 'PENDENTE' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500')}>{evidencia.status}</span></div>
          <p className="mt-1 truncate text-zinc-400" title={evidencia.referencia ?? undefined}>{evidencia.referencia ?? 'Sem referência textual'} · {evidencia.dataReferencia ? formatDate(evidencia.dataReferencia) : 'sem data'}</p>
          {(evidencia.orgaoNome || evidencia.fornecedorNome) && <p className="mt-1 text-[11px] text-zinc-500">{evidencia.orgaoNome ? `Órgão: ${evidencia.orgaoNome}${evidencia.orgaoCnpj ? ` (${evidencia.orgaoCnpj})` : ''}` : ''}{evidencia.fornecedorNome ? ` · Fornecedor: ${evidencia.fornecedorNome}${evidencia.fornecedorCnpj ? ` (${evidencia.fornecedorCnpj})` : ''}` : ''}</p>}
          {evidencia.tipoPreco && <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">Preço {evidencia.tipoPreco}</p>}
          {evidencia.possivelDuplicidade && <p className="mt-1 rounded bg-orange-100 px-2 py-1 text-[11px] font-medium text-orange-700">Possível duplicidade: confira a contratação e o item antes de validar.</p>}
          {evidencia.comprovanteUrl && <button type="button" className="mt-1 inline-flex items-center gap-1 text-blue-600" onClick={() => void abrirArquivoAutenticado(evidencia.comprovanteUrl!).catch((erro) => toast.error(erro instanceof Error ? erro.message : 'Erro ao abrir comprovante.'))}><ExternalLink className="h-3 w-3" />Comprovante</button>}
          {evidencia.justificativa && <p className="mt-1 text-zinc-500">Motivo: {evidencia.justificativa}</p>}
          {podeEditar && evidencia.status === 'PENDENTE' && <div className="mt-2 flex gap-1"><button className="btn-secondary inline-flex flex-1 items-center justify-center gap-1 text-[11px]" disabled={salvando === evidencia.id} onClick={() => void revisar(evidencia, 'VALIDA')}><Check className="h-3 w-3" />Validar</button><button className="btn-secondary inline-flex flex-1 items-center justify-center gap-1 text-[11px] text-red-600" disabled={salvando === evidencia.id} onClick={() => void revisar(evidencia, 'DESCARTADA')}><X className="h-3 w-3" />Descartar</button></div>}
        </article>)}
      </div> : <p className="mt-3 text-xs text-zinc-400">Nenhuma evidência coletada para este item.</p>}

      {cobertura && !cobertura.completa && podeEditar && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/10"><p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Cobertura abaixo da meta</p>{item.justificativaCobertura ? <p className="mt-1 text-xs text-amber-700">Exceção aprovada: {item.justificativaCobertura}</p> : <div className="mt-2 flex gap-2"><input className="input flex-1" placeholder="Justifique a aprovação excepcional deste item" value={justificativaCobertura} onChange={(evento) => setJustificativaCobertura(evento.target.value)} /><button className="btn-secondary text-xs" disabled={salvando === 'excecao'} onClick={() => void aprovarExcecao()}>Registrar exceção</button></div>}</div>}
    </section>
  );
}
