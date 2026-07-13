'use client';

import { formatCurrency } from '@/lib/utils';
import type { ItemPesquisa, MetodoCalculo } from '@/types/api';

export default function ReferenceCalculation({
  item,
  metodo,
}: {
  item: ItemPesquisa;
  metodo: MetodoCalculo;
}) {
  return (
    <section className="card" aria-label="Cálculo de referência">
      <h3 className="text-sm font-semibold">Cálculo</h3>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs text-zinc-400">Método congelado</dt>
          <dd className="font-medium">{metodo.replace('_', ' ')}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Preço unitário</dt>
          <dd className="text-xl font-bold">{formatCurrency(item.precoReferencia)}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Quantidade × referência</dt>
          <dd className="font-semibold">{formatCurrency(item.precoTotal)}</dd>
        </div>
      </dl>
    </section>
  );
}
