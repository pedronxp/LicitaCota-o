'use client';

import { useMemo, useState } from 'react';
import { FileUp, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { abrirArquivoAutenticado, apiFetch } from '@/lib/api';
import { useFornecedores, useRecomendacoesFornecedores } from '@/lib/queries';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CotacaoDireta, ItemPesquisa } from '@/types/api';
import { useAuthStore } from '@/lib/auth';

interface Props {
  pesquisaId: string;
  item: ItemPesquisa;
  onChange: () => void | Promise<unknown>;
}

const rotuloStatus: Record<CotacaoDireta['status'], string> = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Aguardando resposta',
  RESPONDIDA: 'Respondida',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Vencida',
};

export default function CotacaoDiretaPanel({ pesquisaId, item, onChange }: Props) {
  const usuario = useAuthStore((estado) => estado.usuario);
  const podeEditar = usuario?.role === 'ADMIN' || usuario?.role === 'OPERADOR';
  const { data } = useFornecedores('', 1);
  const { data: recomendacoesData } = useRecomendacoesFornecedores(item.id);
  const [fornecedorId, setFornecedorId] = useState('');
  const [justificativa, setJustificativa] = useState('Complementação da pesquisa de preços');
  const [validadeAte, setValidadeAte] = useState('');
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ id: string; texto: string } | null>(null);
  const fornecedores = useMemo(() => {
    const lista = [...(data?.fornecedores ?? [])];
    const scores = new Map((recomendacoesData?.recomendacoes ?? []).map((r) => [r.fornecedor.id, r.score]));
    return lista.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  }, [data, recomendacoesData]);
  const motivos = useMemo(() => new Map((recomendacoesData?.recomendacoes ?? []).map((r) => [r.fornecedor.id, r.motivos])), [recomendacoesData]);
  const cotacoes = item.cotacoesDiretas ?? [];

  async function criar() {
    if (!fornecedorId || justificativa.trim().length < 5) {
      toast.error('Selecione o fornecedor e informe a justificativa.');
      return;
    }
    setSalvando('nova');
    try {
      await apiFetch(`/api/pesquisas/${pesquisaId}/itens/${item.id}/cotacoes-diretas`, {
        method: 'POST',
        body: JSON.stringify({ fornecedorId, justificativa, validadeAte: validadeAte || undefined }),
      });
      setFornecedorId('');
      setValidadeAte('');
      toast.success('Solicitação de cotação registrada.');
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar cotação');
    } finally {
      setSalvando(null);
    }
  }

  async function atualizar(cotacao: CotacaoDireta, status: 'RESPONDIDA' | 'RECUSADA') {
    const preco = Number(String(precos[cotacao.id] ?? '').replace(',', '.'));
    if (status === 'RESPONDIDA' && (!Number.isFinite(preco) || preco <= 0)) {
      toast.error('Informe um preço válido.');
      return;
    }
    setSalvando(cotacao.id);
    try {
      await apiFetch(`/api/pesquisas/${pesquisaId}/itens/${item.id}/cotacoes-diretas/${cotacao.id}`, {
        method: 'PUT',
        body: JSON.stringify(status === 'RESPONDIDA' ? { status, preco } : { status }),
      });
      toast.success(status === 'RESPONDIDA' ? 'Preço registrado.' : 'Recusa registrada.');
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar cotação');
    } finally {
      setSalvando(null);
    }
  }

  async function cancelar(cotacao: CotacaoDireta) {
    setSalvando(cotacao.id);
    try {
      await apiFetch(`/api/pesquisas/${pesquisaId}/itens/${item.id}/cotacoes-diretas/${cotacao.id}`, { method: 'DELETE' });
      toast.success('Cotação cancelada.');
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar cotação');
    } finally {
      setSalvando(null);
    }
  }

  async function visualizar(cotacao: CotacaoDireta) {
    try {
      const mensagem = await apiFetch<{ texto: string }>(`/api/pesquisas/${pesquisaId}/itens/${item.id}/cotacoes-diretas/${cotacao.id}/solicitacao`);
      setPrevia({ id: cotacao.id, texto: mensagem.texto });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar solicitação');
    }
  }

  async function enviar(cotacao: CotacaoDireta) {
    if (!confirm(`Enviar a solicitação para ${cotacao.fornecedor?.email ?? 'o fornecedor'}?`)) return;
    setSalvando(cotacao.id);
    try {
      const resultado = await apiFetch<{ enviado: boolean; mensagem: string; previa: { texto: string } }>(`/api/pesquisas/${pesquisaId}/itens/${item.id}/cotacoes-diretas/${cotacao.id}/enviar`, { method: 'POST', body: JSON.stringify({ confirmar: true }) });
      if (resultado.enviado) toast.success(resultado.mensagem);
      else {
        toast.warning(resultado.mensagem);
        setPrevia({ id: cotacao.id, texto: resultado.previa.texto });
      }
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar solicitação');
    } finally {
      setSalvando(null);
    }
  }

  async function anexar(cotacao: CotacaoDireta, arquivo: File) {
    const form = new FormData();
    form.append('arquivo', arquivo);
    setSalvando(cotacao.id);
    try {
      await apiFetch(`/api/pesquisas/${pesquisaId}/itens/${item.id}/cotacoes-diretas/${cotacao.id}/anexo?tipo=resposta`, { method: 'POST', body: form });
      toast.success('Comprovante anexado.');
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao anexar arquivo');
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-200 dark:border-zinc-700 pt-4">
      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">Cotações diretas com fornecedores</p>
      {podeEditar && <div className="grid gap-2 md:grid-cols-[1.2fr_1.5fr_160px_auto]">
        <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="input text-xs">
          <option value="">Selecione um fornecedor</option>
          {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial} — {f.cnpj}{motivos.has(f.id) ? ` — recomendado: ${motivos.get(f.id)?.join(', ')}` : ''}</option>)}
        </select>
        <input value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="input text-xs" placeholder="Justificativa" />
        <input type="date" value={validadeAte} onChange={(e) => setValidadeAte(e.target.value)} className="input text-xs" title="Validade da solicitação" />
        <button type="button" onClick={criar} disabled={salvando === 'nova'} className="btn-secondary text-xs gap-1">
          {salvando === 'nova' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Solicitar
        </button>
      </div>}

      <div className="mt-3 space-y-2">
        {cotacoes.map((c) => (
          <div key={c.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{c.fornecedor?.nomeFantasia || c.fornecedor?.razaoSocial || 'Fornecedor'}</strong>
              <span className="text-zinc-400">{rotuloStatus[c.status]}</span>
              <span className="text-zinc-400">Solicitada em {formatDate(c.dataSolicitacao)}</span>
              {c.preco && <span className="font-bold text-emerald-600">{formatCurrency(c.preco)}</span>}
              {c.anexoRespostaUrl && <button type="button" onClick={() => void abrirArquivoAutenticado(c.anexoRespostaUrl!).catch((erro) => toast.error(erro instanceof Error ? erro.message : 'Erro ao abrir comprovante.'))} className="text-blue-500">Ver comprovante</button>}
            </div>
            {podeEditar && c.status === 'RASCUNHO' && (
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => visualizar(c)} className="btn-ghost text-xs">Visualizar solicitação</button>
                <button type="button" onClick={() => enviar(c)} disabled={salvando === c.id} className="btn-secondary text-xs">Enviar com confirmação</button>
                <button type="button" onClick={() => cancelar(c)} className="btn-ghost text-xs text-red-500 gap-1"><X className="w-3.5 h-3.5" /> Cancelar</button>
              </div>
            )}
            {podeEditar && c.status === 'ENVIADA' && (
              <div className="flex flex-wrap gap-2 mt-2">
                <input value={precos[c.id] ?? ''} onChange={(e) => setPrecos((p) => ({ ...p, [c.id]: e.target.value }))} className="input max-w-32 text-xs" placeholder="Preço unitário" inputMode="decimal" />
                <button type="button" onClick={() => atualizar(c, 'RESPONDIDA')} className="btn-secondary text-xs">Registrar resposta</button>
                <button type="button" onClick={() => atualizar(c, 'RECUSADA')} className="btn-ghost text-xs">Recusou</button>
                <label className="btn-ghost text-xs cursor-pointer gap-1"><FileUp className="w-3.5 h-3.5" /> Anexar<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && anexar(c, e.target.files[0])} /></label>
                <button type="button" onClick={() => cancelar(c)} className="btn-ghost text-xs text-red-500 gap-1"><X className="w-3.5 h-3.5" /> Cancelar</button>
              </div>
            )}
            {previa?.id === c.id && (
              <div className="mt-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                {previa.texto}
              </div>
            )}
          </div>
        ))}
        {cotacoes.length === 0 && <p className="text-zinc-400">Nenhuma cotação direta registrada para este item.</p>}
      </div>
    </div>
  );
}
