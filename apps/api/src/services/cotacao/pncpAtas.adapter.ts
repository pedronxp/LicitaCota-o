import type { FonteCotacao } from '@prisma/client';
import type { ItemNormalizado, ResultadoCotacao, TesteResultado } from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { logger } from '../../utils/logger.js';
import { media } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

const BASE = 'https://pncp.gov.br/api';

interface Ata {
  cnpjOrgao?: string;
  numeroControlePNCPAta?: string;
  cancelado?: boolean;
}

interface AtaItem {
  descricaoItem?: string;
  descricao?: string;
  valorUnitario?: number;
  valorUnitarioEstimado?: number;
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
}

// Formato: {cnpj}-{modalidade}-{seq}/{ano}-{nata}
function parsearAta(ata: Ata): { cnpj: string; anoCompra: number; sequencialCompra: number; sequencialAta: number } | null {
  if (!ata.cnpjOrgao || !ata.numeroControlePNCPAta || ata.cancelado) return null;
  const match = ata.numeroControlePNCPAta.match(/-(\d+)\/(\d{4})-(\d+)$/);
  if (!match) return null;
  return {
    cnpj: ata.cnpjOrgao,
    sequencialCompra: parseInt(match[1], 10),
    anoCompra: parseInt(match[2], 10),
    sequencialAta: parseInt(match[3], 10),
  };
}

function matcherTermos(termos: string[], descNorm: string): boolean {
  return termos.some((t) => {
    const palavras = normalizar(t).split(' ').filter((w) => w.length > 2);
    if (palavras.length === 0) return false;
    const acertos = palavras.filter((w) => descNorm.includes(w)).length;
    return acertos >= Math.max(1, Math.ceil(palavras.length * 0.5));
  });
}

async function buscarAtasPorTexto(termo: string): Promise<Ata[]> {
  const url = `${BASE}/consulta/v1/atas?q=${encodeURIComponent(termo)}&pagina=1&tamanhoPagina=10`;
  const resp = await requisitar(url, { timeoutMs: 8000, retries: 0 });
  if (!resp.ok) {
    logger.warn(`PNCP Atas busca textual HTTP ${resp.status}`, { termo });
    return [];
  }
  const body = resp.corpoJson as { data?: Ata[] } | null;
  return body?.data ?? [];
}

async function buscarItensAta(cnpj: string, ano: number, seq: number, nata: number): Promise<AtaItem[]> {
  const url = `${BASE}/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/atas/${nata}/itens?pagina=1&tamanhoPagina=50`;
  const resp = await requisitar(url, { timeoutMs: 8000, retries: 0 });
  if (!resp.ok) return [];
  const body = resp.corpoJson;
  if (Array.isArray(body)) return body as AtaItem[];
  return (body as { data?: AtaItem[] })?.data ?? [];
}

async function buscarPrecos(
  cascata: string[],
  limite: number,
): Promise<{ precos: number[]; referencia: string | null }> {
  const termos = [...new Set(cascata)];
  const precos: number[] = [];
  let referencia: string | null = null;

  for (const termo of termos) {
    if (precos.length >= limite) break;

    logger.info(`PNCP Atas busca textual: termo="${termo}"`);
    let atas: Ata[];
    try {
      atas = await buscarAtasPorTexto(termo);
    } catch (e) {
      logger.warn('PNCP Atas: falha na busca textual, tentando próximo termo', { termo, e });
      continue;
    }

    const candidatas = atas.map(parsearAta).filter((a): a is NonNullable<ReturnType<typeof parsearAta>> => a !== null).slice(0, 5);
    logger.info(`PNCP Atas: ${candidatas.length} atas válidas para "${termo}"`);

    for (const { cnpj, anoCompra, sequencialCompra, sequencialAta } of candidatas) {
      if (precos.length >= limite) break;
      const ref = `PNCP Ata — ${cnpj} ${anoCompra}/${sequencialCompra}/ata${sequencialAta}`;

      let itens: AtaItem[];
      try {
        itens = await buscarItensAta(cnpj, anoCompra, sequencialCompra, sequencialAta);
      } catch {
        continue;
      }

      for (const item of itens) {
        if (precos.length >= limite) break;
        const desc = item.descricaoItem ?? item.descricao ?? '';
        const preco = item.valorUnitario ?? item.valorUnitarioEstimado;
        if (!desc || !preco || preco <= 0) continue;
        if (matcherTermos([termo], normalizar(desc))) {
          precos.push(preco);
          if (!referencia) referencia = ref;
        }
      }
    }
  }

  logger.info(`PNCP Atas: ${precos.length} preços encontrados`);
  return { precos, referencia };
}

export const pncpAtasAdapter: FonteAdapter = {
  slug: 'pncp-atas',

  async consultar(item: ItemNormalizado, config: FonteCotacao): Promise<ResultadoCotacao> {
    const limite = Math.max(config.limiteResultados > 0 ? config.limiteResultados : 5, 3);
    try {
      const { precos, referencia } = await buscarPrecos(item.cascata, limite);
      if (precos.length === 0) {
        return { preco: null, referencia: '', fundamentacaoArtigo: config.fundamentacaoArtigo ?? '', dadosBrutos: null };
      }
      return {
        preco: Math.round(media(precos) * 10000) / 10000,
        referencia: referencia ?? `PNCP Atas — ${new Date().toLocaleDateString('pt-BR')}`,
        fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: { precos, fonte: 'pncp-atas' },
      };
    } catch (e) {
      return {
        preco: null, referencia: '', fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: null, erro: e instanceof Error ? e.message : 'Erro',
      };
    }
  },

  async testar(_config: FonteCotacao, _itemAmostra: string): Promise<TesteResultado> {
    const inicio = Date.now();
    try {
      const url = `${BASE}/consulta/v1/atas?q=papel&pagina=1&tamanhoPagina=5`;
      const resp = await requisitar(url, { timeoutMs: 15000, retries: 1 });
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return { ok: false, latenciaMs, amostraPreco: null, amostraReferencia: null, mensagem: `PNCP Atas respondeu HTTP ${resp.status}.`, dadosBrutos: null };
      }
      const body = resp.corpoJson as { data?: Ata[]; totalRegistros?: number } | null;
      const count = body?.data?.length ?? 0;
      const total = body?.totalRegistros ?? 0;
      return {
        ok: true, latenciaMs, amostraPreco: null, amostraReferencia: null,
        mensagem: `PNCP Atas acessível — ${count} atas para "papel" (${total.toLocaleString('pt-BR')} total) em ${latenciaMs}ms.`,
        dadosBrutos: { atas: count, totalRegistros: total },
      };
    } catch (e) {
      return {
        ok: false, latenciaMs: Date.now() - inicio, amostraPreco: null, amostraReferencia: null,
        mensagem: e instanceof Error ? `Falha: ${e.message}` : 'Falha de conexão.', dadosBrutos: null,
      };
    }
  },
};

export function pncpAtasCacheStatus(): { itens: number; expiresAt: number | null; carregando: boolean } {
  return { itens: 0, expiresAt: null, carregando: false };
}
