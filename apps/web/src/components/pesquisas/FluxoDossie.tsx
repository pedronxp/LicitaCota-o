'use client';

import { AlertTriangle, Check, Circle, Download, FileCheck2, Loader2, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { apiUrl, getAccessToken } from '@/lib/api';
import { useAprovarPesquisa, useDocumentosPesquisa, useEmitirPesquisa, useEncerrarColeta, useIniciarColeta, usePreviaDocumento } from '@/lib/queries';
import { useAuthStore } from '@/lib/auth';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Pesquisa } from '@/types/api';

const etapas = ['Dados', 'Itens', 'Coleta de preços', 'Evidências', 'Análise', 'Revisão e aprovação', 'Emissão'] as const;

export default function FluxoDossie({ pesquisa, modo = 'fluxo' }: { pesquisa: Pesquisa; modo?: 'fluxo' | 'documentos' }) {
  const usuario = useAuthStore((estado) => estado.usuario);
  const previa = usePreviaDocumento(pesquisa.id);
  const documentos = useDocumentosPesquisa(pesquisa.id);
  const iniciar = useIniciarColeta(pesquisa.id);
  const encerrar = useEncerrarColeta(pesquisa.id);
  const aprovar = useAprovarPesquisa(pesquisa.id);
  const emitir = useEmitirPesquisa(pesquisa.id);
  const podeOperar = usuario?.role === 'ADMIN' || usuario?.role === 'OPERADOR';
  const podeAprovarEmitir = usuario?.role === 'ADMIN';
  const bloqueios = previa.data?.bloqueios;
  const indiceAtual = pesquisa.status === 'EMITIDA' ? 6
    : pesquisa.status === 'APROVADA' ? 6
      : pesquisa.status === 'EM_REVISAO' || pesquisa.status === 'CONCLUIDA'
        ? (bloqueios?.evidenciasPendentes || bloqueios?.itensSemDecisao.length ? 4 : 5)
        : pesquisa.status === 'COLETANDO' || pesquisa.status === 'PROCESSANDO' || pesquisa.status === 'ERRO' ? 2
          : pesquisa.totalItens > 0 ? 1 : 0;

  async function executar(acao: 'iniciar' | 'encerrar' | 'aprovar' | 'emitir') {
    const mutacao = { iniciar, encerrar, aprovar, emitir }[acao];
    try {
      await mutacao.mutateAsync(acao === 'aprovar' ? { motivo: 'Dossiê revisado e aprovado para emissão.' } : undefined);
      toast.success({ iniciar: 'Coleta iniciada.', encerrar: 'Pesquisa enviada para revisão.', aprovar: 'Pesquisa aprovada.', emitir: 'Documento versionado emitido.' }[acao]);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.');
    }
  }

  async function baixar(documentoId: string, versao: number) {
    try {
      const resposta = await fetch(apiUrl(`/api/pesquisas/${pesquisa.id}/documentos/${documentoId}/xlsx`), { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` } });
      if (!resposta.ok) throw new Error('Não foi possível baixar esta versão.');
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `dossie-${pesquisa.id}-v${versao}.xlsx`; link.click();
      URL.revokeObjectURL(url);
    } catch (erro) { toast.error(erro instanceof Error ? erro.message : 'Erro ao baixar documento.'); }
  }

  const carregando = iniciar.isPending || encerrar.isPending || aprovar.isPending || emitir.isPending;
  return (
    <section className="card mb-6 space-y-4" aria-label={modo === 'fluxo' ? 'Fluxo do dossiê' : 'Relatórios e documentos'}>
      {modo === 'fluxo' && <><div className="flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Etapas do dossiê</h3><p className="text-xs text-zinc-400">Coleta, revisão humana, aprovação e documento congelado.</p></div>
        {usuario?.role === 'VISUALIZADOR' && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500 dark:bg-zinc-800"><LockKeyhole className="h-3 w-3" />Somente leitura</span>}
      </div>
      <ol className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
        {etapas.map((etapa, indice) => {
          const concluida = indice < indiceAtual || (pesquisa.status === 'EMITIDA' && indice === indiceAtual);
          const atual = indice === indiceAtual;
          return <li key={etapa} className={cn('rounded-lg border px-2 py-2 text-center text-[11px]', atual ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300' : concluida ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/10' : 'border-zinc-200 text-zinc-400 dark:border-zinc-700')}>
            {concluida ? <Check className="mx-auto mb-1 h-3.5 w-3.5" /> : <Circle className="mx-auto mb-1 h-3.5 w-3.5" />}{indice + 1}. {etapa}
          </li>;
        })}
      </ol>
      </>}

      {modo === 'documentos' && <div><h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Relatórios e documentos</h3><p className="mt-1 text-xs text-zinc-400">Consulte a prévia e baixe versões emitidas sem alterar a revisão.</p></div>}

      {previa.isLoading ? <div className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />Preparando prévia...</div> : previa.data && <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">Prévia da versão {previa.data.snapshot.documento.versao}</p><p className="text-[11px] text-zinc-400">{previa.data.snapshot.resumo.totalItens} itens · {formatCurrency(previa.data.snapshot.resumo.valorTotalEstimado)}</p></div><span className="text-[11px] text-zinc-500">Método: {previa.data.snapshot.metodologia.metodoCalculo} · Meta: {previa.data.snapshot.metodologia.metaOrigensMinima} origens</span></div>
        {(bloqueios?.featureFlag || bloqueios?.status || bloqueios?.evidenciasPendentes || bloqueios?.itensSemDecisao.length) ? <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"><p className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Pendências para emissão</p>{bloqueios.featureFlag && <p>{bloqueios.featureFlag}</p>}{bloqueios.status && <p>{bloqueios.status}</p>}{bloqueios.evidenciasPendentes > 0 && <p>Revise {bloqueios.evidenciasPendentes} evidência(s) pendente(s).</p>}{bloqueios.itensSemDecisao.length > 0 && <p>Defina cobertura ou justificativa nos itens: {bloqueios.itensSemDecisao.map((item) => item.sequencia).join(', ')}.</p>}</div> : <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600"><FileCheck2 className="h-4 w-4" />Dossiê sem pendências documentais.</p>}
      </div>}

      {modo === 'fluxo' && podeOperar && <div className="flex flex-wrap gap-2">
        {['RASCUNHO', 'AGUARDANDO', 'ERRO'].includes(pesquisa.status) && <button className="btn-primary" disabled={carregando || pesquisa.totalItens === 0} onClick={() => void executar('iniciar')}>Iniciar coleta</button>}
        {pesquisa.status === 'COLETANDO' && <button className="btn-primary" disabled={carregando} onClick={() => void executar('encerrar')}>Encerrar coleta e revisar</button>}
        {pesquisa.status === 'EM_REVISAO' && podeAprovarEmitir && <button className="btn-primary" disabled={carregando || Boolean(bloqueios?.evidenciasPendentes || bloqueios?.itensSemDecisao.length)} onClick={() => void executar('aprovar')}>Aprovar dossiê</button>}
        {pesquisa.status === 'EM_REVISAO' && !podeAprovarEmitir && <p className="text-xs text-zinc-500">Após resolver as pendências, um administrador deverá aprovar o dossiê.</p>}
        {pesquisa.status === 'APROVADA' && podeAprovarEmitir && <button className="btn-primary" disabled={carregando || !previa.data?.podeEmitir} onClick={() => void executar('emitir')}>Emitir versão {pesquisa.versaoAtual + 1}</button>}
      </div>}

      {modo === 'documentos' && (documentos.data?.length ? <div><p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Versões emitidas</p><div className="space-y-1">{documentos.data.map((documento) => <div key={documento.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800/60"><span>Versão {documento.versao} · {formatDate(documento.emitidoEm)} · {documento.emitidoPor?.nome ?? 'Emissor não informado'}</span><button className="btn-ghost inline-flex items-center gap-1" onClick={() => void baixar(documento.id, documento.versao)}><Download className="h-3.5 w-3.5" />XLSX</button></div>)}</div></div> : <p className="text-xs text-zinc-400">Nenhuma versão foi emitida. Conclua a revisão e a aprovação na etapa 6.</p>)}
    </section>
  );
}
