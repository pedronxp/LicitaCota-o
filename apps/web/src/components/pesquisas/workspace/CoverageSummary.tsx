'use client';

import { CheckCircle2, CircleAlert } from 'lucide-react';
import type { ItemPesquisa } from '@/types/api';

export default function CoverageSummary({ item, meta }: { item: ItemPesquisa; meta: number }) {
  const quantidade =
    item.resultadoCalculo?.evidenciasIndependentes ?? item.resultadoCalculo?.origensDistintas ?? 0;
  const completa = Boolean(item.resultadoCalculo?.completa);
  return (
    <section className="card" aria-label="Cobertura do item">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Cobertura</h3>
          <p className="text-xs text-zinc-400">Evidências independentes restantes após descartes</p>
        </div>
        {completa ? (
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        ) : (
          <CircleAlert className="h-6 w-6 text-amber-500" />
        )}
      </div>
      <p className="mt-4 text-3xl font-bold">
        {quantidade} <span className="text-base font-normal text-zinc-400">de {meta}</span>
      </p>
      <div className="mt-3 flex gap-2">
        {Array.from({ length: meta }, (_, i) => (
          <span key={i} className={cnDot(i < quantidade)} />
        ))}
      </div>
      {item.justificativaCobertura && (
        <p className="mt-3 text-xs text-amber-700">Exceção: {item.justificativaCobertura}</p>
      )}
    </section>
  );
}

function cnDot(ativo: boolean): string {
  return `h-3 flex-1 rounded-full ${ativo ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`;
}
