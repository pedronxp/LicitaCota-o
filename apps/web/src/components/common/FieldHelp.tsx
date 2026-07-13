'use client';

import { HelpCircle } from 'lucide-react';
import { useConfig } from '@/lib/queries';

export function FieldHelp({ text, helpKey }: { text: string; helpKey?: string }) {
  const { data: config } = useConfig();
  const resolvedText = helpKey ? config?.textosAjuda?.[helpKey] || text : text;
  return (
    <span className="group relative inline-flex align-middle ml-1" tabIndex={0} aria-label={resolvedText}>
      <HelpCircle className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block group-focus:block">
        {resolvedText}
      </span>
    </span>
  );
}
