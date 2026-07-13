'use client';

import { useState } from 'react';
import { Lightbulb, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth';
import { useAtualizarSugestaoMelhoria, useCriarSugestaoMelhoria, useSugestoesMelhoria } from '@/lib/queries';

export default function SugestoesPage() {
  const usuario = useAuthStore((estado) => estado.usuario);
  const { data, isLoading } = useSugestoesMelhoria();
  const criar = useCriarSugestaoMelhoria();
  const atualizar = useAtualizarSugestaoMelhoria();
  const [form, setForm] = useState({ tipo: 'SUGESTAO', titulo: '', descricao: '', tela: '', prioridade: 'MEDIA' });

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    try {
      await criar.mutateAsync(form as Parameters<typeof criar.mutateAsync>[0]);
      setForm({ tipo: 'SUGESTAO', titulo: '', descricao: '', tela: '', prioridade: 'MEDIA' });
      toast.success('Sugestão enviada para análise.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao enviar sugestão.'); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Sugestões e melhorias</h2><p className="text-sm text-zinc-500">Registre dificuldades, erros e ideias observadas no trabalho do setor.</p></div>
      <form onSubmit={enviar} className="card space-y-4">
        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /><h3 className="text-sm font-semibold">Nova contribuição</h3></div>
        <div className="grid gap-3 md:grid-cols-3">
          <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="SUGESTAO">Sugestão</option><option value="ERRO">Erro</option><option value="DIFICULDADE">Dificuldade</option><option value="NOVA_FUNCIONALIDADE">Nova funcionalidade</option></select>
          <select className="input" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select>
          <input className="input" value={form.tela} onChange={(e) => setForm({ ...form, tela: e.target.value })} placeholder="Tela relacionada" />
        </div>
        <input className="input" required minLength={3} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Resumo da sugestão" />
        <textarea className="input min-h-28 resize-y" required minLength={10} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Explique o problema, o impacto e como poderia melhorar." />
        <button className="btn-primary gap-2" disabled={criar.isPending}>{criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar</button>
      </form>
      <div className="space-y-3">
        {isLoading && <div className="card animate-pulse h-24" />}
        {data?.sugestoes.map((sugestao) => <div className="card" key={sugestao.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{sugestao.titulo}</p><p className="mt-1 text-xs text-zinc-500">{sugestao.tipo} · {sugestao.prioridade} · {sugestao.tela || 'Geral'}</p></div>{usuario?.role === 'ADMIN' ? <select className="input w-auto py-1 text-xs" value={sugestao.status} disabled={atualizar.isPending} onChange={(e) => atualizar.mutate({ id: sugestao.id, data: { status: e.target.value as typeof sugestao.status } })}><option value="RECEBIDA">Recebida</option><option value="EM_ANALISE">Em análise</option><option value="PLANEJADA">Planejada</option><option value="EM_DESENVOLVIMENTO">Em desenvolvimento</option><option value="CONCLUIDA">Concluída</option><option value="RECUSADA">Recusada</option></select> : <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] dark:bg-zinc-800">{sugestao.status}</span>}</div><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{sugestao.descricao}</p></div>)}
      </div>
    </div>
  );
}
