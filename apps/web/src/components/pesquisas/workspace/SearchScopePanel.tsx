'use client';

import type { EscopoBuscaPncp } from '@/types/api';

export function escopoPadrao(): EscopoBuscaPncp {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setFullYear(inicio.getFullYear() - 1);
  return {
    abrangencia: 'NACIONAL',
    dataInicial: inicio.toISOString().slice(0, 10),
    dataFinal: fim.toISOString().slice(0, 10),
  };
}

export default function SearchScopePanel({
  value,
  onChange,
}: {
  value: EscopoBuscaPncp;
  onChange: (value: EscopoBuscaPncp) => void;
}) {
  const set = (patch: Partial<EscopoBuscaPncp>) => onChange({ ...value, ...patch });
  return (
    <section className="card space-y-3" aria-label="Abrangência da busca PNCP">
      <div>
        <h3 className="text-sm font-semibold">Onde pesquisar no PNCP</h3>
        <p className="text-xs text-zinc-400">
          A localização do XLS não é aplicada automaticamente.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="label">
          Abrangência
          <select
            className="input mt-1"
            value={value.abrangencia}
            onChange={(e) =>
              set({
                abrangencia: e.target.value as EscopoBuscaPncp['abrangencia'],
                uf: undefined,
                municipio: undefined,
                orgaoCnpj: undefined,
              })
            }
          >
            <option value="NACIONAL">Nacional</option>
            <option value="UF">Por UF</option>
            <option value="MUNICIPIO">Por município</option>
            <option value="ORGAO">Por órgão/CNPJ</option>
          </select>
        </label>
        <label className="label">
          Data inicial
          <input
            className="input mt-1"
            type="date"
            value={value.dataInicial}
            onChange={(e) => set({ dataInicial: e.target.value })}
          />
        </label>
        <label className="label">
          Data final
          <input
            className="input mt-1"
            type="date"
            value={value.dataFinal}
            onChange={(e) => set({ dataFinal: e.target.value })}
          />
        </label>
        {['UF', 'MUNICIPIO'].includes(value.abrangencia) && (
          <label className="label">
            UF
            <input
              className="input mt-1 uppercase"
              maxLength={2}
              value={value.uf ?? ''}
              onChange={(e) => set({ uf: e.target.value.toUpperCase() })}
              placeholder="MG"
            />
          </label>
        )}
        {value.abrangencia === 'MUNICIPIO' && (
          <label className="label md:col-span-2">
            Município
            <input
              className="input mt-1"
              value={value.municipio ?? ''}
              onChange={(e) => set({ municipio: e.target.value })}
              placeholder="Cataguases"
            />
          </label>
        )}
        {value.abrangencia === 'ORGAO' && (
          <label className="label md:col-span-3">
            CNPJ do órgão
            <input
              className="input mt-1"
              value={value.orgaoCnpj ?? ''}
              onChange={(e) => set({ orgaoCnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
            />
          </label>
        )}
      </div>
    </section>
  );
}
