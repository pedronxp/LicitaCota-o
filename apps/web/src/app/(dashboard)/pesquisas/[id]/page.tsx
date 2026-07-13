'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { usePesquisa } from '@/lib/queries';
import { PesquisaBadge } from '@/components/common/StatusBadge';
import PesquisaWorkspace from '@/components/pesquisas/workspace/PesquisaWorkspace';
import { formatDate } from '@/lib/utils';

export default function PesquisaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: pesquisa, isLoading, refetch } = usePesquisa(id);

  if (isLoading) return <div className="mx-auto max-w-6xl space-y-4 animate-pulse"><div className="h-8 w-1/3 rounded-full bg-zinc-200 dark:bg-zinc-700" /><div className="card h-96" /></div>;
  if (!pesquisa) return null;

  return <div className="mx-auto max-w-7xl">
    <header className="mb-6 flex items-start gap-3">
      <button type="button" onClick={() => router.push('/pesquisas')} className="btn-ghost mt-0.5 h-8 w-8 p-0" aria-label="Voltar para pesquisas"><ArrowLeft className="h-4 w-4" /></button>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="truncate text-xl font-semibold text-zinc-900 dark:text-white">{pesquisa.titulo}</h1><PesquisaBadge status={pesquisa.status} /></div><p className="mt-1 text-xs text-zinc-400">Criada em {formatDate(pesquisa.createdAt)} · {pesquisa.totalItens} item(ns)</p></div>
    </header>
    <PesquisaWorkspace pesquisa={pesquisa} onRefresh={refetch} />
  </div>;
}
