import type { FonteCotacao } from '@prisma/client';
import type { ItemNormalizado, ResultadoCotacao, TesteResultado } from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { media } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

/**
 * Adapter para Atas de Registro de Preço do PNCP.
 * Atas fixam preços máximos durante vigência — melhor referência legal para ARP.
 * Endpoint: /api/consulta/v1/atas → itens via /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/atas/{nata}/itens
 */

const BASE = 'https://pncp.gov.br/api';

interface Ata {
  orgaoEntidade?: { cnpj?: string };
  anoCompra?: number;
  sequencialCompra?: number;
  sequencialAta?: number;
}

interface AtaItem {
  descricaoItem?: string;
  descricao?: string;
  valorUnitario?: number;
  valorUnitarioEstimado?: number;
  quantidade?: number;
  unidadeMedida?: string;
}

function dataFormatada(diasAtras: number): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
}

async function buscarAtas(paginas = 2): Promise<Ata[]> {
  const dataFinal = dataFormatada(1);
  const dataInicial = dataFormatada(61);
  const todas: Ata[] = [];
  for (let p = 1; p <= paginas; p++) {
    const url =
      `${BASE}/consulta/v1/atas` +
      `?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${p}&tamanhoPagina=10`;
    const resp = await requisitar(url, { timeoutMs: 15000, retries: 1 });
    if (!resp.ok) break;
    const body = resp.corpoJson as { data?: Ata[] } | null;
    const data = body?.data ?? [];
    todas.push(...data);
    if (data.length < 10) break;
  }
  return todas;
}

async function buscarItensAta(cnpj: string, ano: number, seq: number, nata: number): Promise<AtaItem[]> {
  const url = `${BASE}/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/atas/${nata}/itens?pagina=1&tamanhoPagina=20`;
  const resp = await requisitar(url, { timeoutMs: 12000, retries: 0 });
  if (!resp.ok) return [];
  const body = resp.corpoJson;
  if (Array.isArray(body)) return body as AtaItem[];
  return (body as { data?: AtaItem[] })?.data ?? [];
}

function precoDeItem(item: AtaItem): number | null {
  const v = item.valorUnitario ?? item.valorUnitarioEstimado;
  return typeof v === 'number' && v > 0 ? v : null;
}

function descricaoDeItem(item: AtaItem): string {
  return item.descricaoItem ?? item.descricao ?? '';
}

async function buscarPrecos(
  termos: string[],
  limite: number,
): Promise<{ precos: number[]; referencia: string | null }> {
  const atas = await buscarAtas(3);
  const precos: number[] = [];
  let referencia: string | null = null;

  for (const ata of atas) {
    if (precos.length >= limite) break;
    const cnpj = ata.orgaoEntidade?.cnpj;
    const ano = ata.anoCompra;
    const seq = ata.sequencialCompra;
    const nata = ata.sequencialAta;
    if (!cnpj || !ano || !seq || !nata) continue;

    const itens = await buscarItensAta(cnpj, ano, seq, nata);
    for (const item of itens) {
      const desc = descricaoDeItem(item);
      if (!desc) continue;
      const descNorm = normalizar(desc);
      const ok = termos.some((t) =>
        normalizar(t).split(' ').filter((w) => w.length > 3).every((w) => descNorm.includes(w)),
      );
      const preco = precoDeItem(item);
      if (ok && preco) {
        precos.push(preco);
        if (!referencia) referencia = `PNCP Ata — ${cnpj} ${ano}/${seq}/ata${nata}`;
        if (precos.length >= limite) break;
      }
    }
  }
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
      const dataFinal = dataFormatada(1);
      const dataInicial = dataFormatada(31);
      const url = `${BASE}/consulta/v1/atas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=1&tamanhoPagina=10`;
      const resp = await requisitar(url, { timeoutMs: 15000, retries: 1 });
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return { ok: false, latenciaMs, amostraPreco: null, amostraReferencia: null, mensagem: `PNCP Atas respondeu HTTP ${resp.status}.`, dadosBrutos: null };
      }
      const body = resp.corpoJson as { data?: unknown[]; totalRegistros?: number } | null;
      const count = body?.data?.length ?? 0;
      const total = body?.totalRegistros ?? 0;
      return {
        ok: count > 0, latenciaMs, amostraPreco: null, amostraReferencia: null,
        mensagem: count > 0
          ? `PNCP Atas — ${count} atas recentes (${total.toLocaleString('pt-BR')} total) em ${latenciaMs}ms.`
          : 'PNCP Atas — nenhuma ata encontrada no período.',
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
