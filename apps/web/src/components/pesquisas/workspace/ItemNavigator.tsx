'use client';

import { CheckCircle2, CircleAlert, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ItemPesquisa } from '@/types/api';

export function itemResolvido(item: ItemPesquisa): boolean {
  return Boolean(item.resultadoCalculo?.completa || item.justificativaCobertura);
}

export default function ItemNavigator({
  itens,
  itemId,
  onSelect,
}: {
  itens: ItemPesquisa[];
  itemId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      className="border-b border-zinc-200 pb-3 lg:border-b-0 lg:border-r lg:pr-4 dark:border-zinc-800"
      aria-label="Fila de itens da pesquisa"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Itens</h3>
        <span className="text-xs text-zinc-400">
          {itens.filter(itemResolvido).length}/{itens.length}
        </span>
      </div>
      <div className="space-y-1">
        {itens.map((item) => {
          const resolvido = itemResolvido(item);
          const evidencias =
            item.resultadoCalculo?.evidenciasIndependentes ??
            item.resultadoCalculo?.origensDistintas ??
            0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'w-full rounded-xl px-3 py-2 text-left transition-colors',
                itemId === item.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {resolvido ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : evidencias > 0 ? (
                  <CircleAlert className="h-4 w-4 text-amber-500" />
                ) : (
                  <Search className="h-4 w-4 text-zinc-400" />
                )}
                {item.sequencia}. {item.nome}
              </span>
              <span className="ml-6 text-xs text-zinc-400">
                {resolvido
                  ? 'Pronto'
                  : `${evidencias} de ${item.resultadoCalculo?.metaOrigens ?? 3} válidas`}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
