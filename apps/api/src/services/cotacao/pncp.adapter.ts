import type { FonteCotacao } from '@prisma/client';
import type { ItemNormalizado, ResultadoCotacao, TesteResultado } from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { logger } from '../../utils/logger.js';
import { media } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

const BASE = 'https://pncp.gov.br/api';
const BASE_CONSULTA = `${BASE}/consulta`;
const BASE_PNCP = `${BASE}/pncp`;

interface ContratacaoItem {
  descricao?: string;
  descricaoItem?: string;
  valorUnitarioEstimado?: number;
  valorUnitario?: number;
}

interface Contratacao {
  orgaoEntidade?: { cnpj?: string };
  anoCompra?: number;
  sequencialCompra?: number;
  objetoCompra?: string;
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
}

function matcherTermos(termos: string[], descNorm: string): boolean {
  return termos.some((t) => {
    const palavras = normalizar(t).split(/\s+/).filter((w) => w.length > 2);
    if (palavras.length === 0) return false;
    const acertos = palavras.filter((w) => descNorm.includes(w)).length;
    return acertos >= Math.max(1, Math.ceil(palavras.length * 0.5));
  });
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function buscarContratos(diasAtras = 180): Promise<Contratacao[]> {
  const hoje = new Date();
  const ini = new Date(hoje);
  ini.setDate(hoje.getDate() - diasAtras);

  // Busca os contratos mais recentes (Pregão = modalidade 6) sem pré-filtro por objetoCompra.
  // A correspondência real acontece no nível dos itens do contrato.
  const url = `${BASE_CONSULTA}/v1/contratacoes/publicacao?dataInicial=${fmt(ini)}&dataFinal=${fmt(hoje)}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=50`;
  try {
    const resp = await requisitar(url, { timeoutMs: 12000, retries: 0 });
    if (!resp.ok) return [];
    const body = resp.corpoJson as { data?: Contratacao[] } | null;
    return (body?.data ?? []).filter((c) => c.orgaoEntidade?.cnpj && c.anoCompra && c.sequencialCompra);
  } catch {
    return [];
  }
}

async function buscarItensContrato(cnpj: string, ano: number, seq: number): Promise<ContratacaoItem[]> {
  const url = `${BASE_PNCP}/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=1&tamanhoPagina=50`;
  try {
    const resp = await requisitar(url, { timeoutMs: 8000, retries: 0 });
    if (!resp.ok) return [];
    const body = resp.corpoJson;
    if (Array.isArray(body)) return body as ContratacaoItem[];
    return (body as { data?: ContratacaoItem[] })?.data ?? [];
  } catch {
    return [];
  }
}

async function buscarPrecos(
  cascata: string[],
  limite: number,
): Promise<{ precos: number[]; referencia: string | null }> {
  const termos = [...new Set(cascata)];
  const precos: number[] = [];
  let referencia: string | null = null;

  // Busca uma única página de contratos recentes (sem pré-filtro por título).
  // A correspondência é feita nos itens de cada contrato.
  const contratos = await buscarContratos();
  logger.info(`PNCP: ${contratos.length} contratos carregados para varredura`);

  for (const ct of contratos.slice(0, 15)) {
    if (precos.length >= limite) break;
    const cnpj = ct.orgaoEntidade!.cnpj!;
    const ano = ct.anoCompra!;
    const seq = ct.sequencialCompra!;
    const ref = `PNCP — ${cnpj} ${ano}/${seq}`;

    const itens = await buscarItensContrato(cnpj, ano, seq);

    for (const item of itens) {
      if (precos.length >= limite) break;
      const desc = item.descricao ?? item.descricaoItem ?? '';
      const preco = item.valorUnitario ?? item.valorUnitarioEstimado;
      if (!desc || !preco || preco <= 0) continue;
      const descNorm = normalizar(desc);
      if (matcherTermos(termos, descNorm)) {
        precos.push(preco);
        if (!referencia) referencia = ref;
      }
    }
  }

  logger.info(`PNCP: ${precos.length} preços encontrados`);
  return { precos, referencia };
}

export const pncpAdapter: FonteAdapter = {
  slug: 'pncp',

  async consultar(item: ItemNormalizado, config: FonteCotacao): Promise<ResultadoCotacao> {
    const limite = Math.max(config.limiteResultados > 0 ? config.limiteResultados : 5, 3);
    try {
      const { precos, referencia } = await buscarPrecos(item.cascata, limite);
      if (precos.length === 0) {
        return { preco: null, referencia: '', fundamentacaoArtigo: config.fundamentacaoArtigo ?? '', dadosBrutos: null };
      }
      return {
        preco: Math.round(media(precos) * 10000) / 10000,
        referencia: referencia ?? `PNCP — ${new Date().toLocaleDateString('pt-BR')}`,
        fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: { precos },
      };
    } catch (e) {
      logger.error('PNCP consultar erro', e);
      return {
        preco: null, referencia: '', fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: null, erro: e instanceof Error ? e.message : 'Erro',
      };
    }
  },

  async testar(_config: FonteCotacao, _itemAmostra: string): Promise<TesteResultado> {
    const inicio = Date.now();
    try {
      const hoje = new Date();
      const ini = new Date(hoje);
      ini.setDate(hoje.getDate() - 30);
      const url = `${BASE_CONSULTA}/v1/contratacoes/publicacao?dataInicial=${fmt(ini)}&dataFinal=${fmt(hoje)}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`;
      const resp = await requisitar(url, { timeoutMs: 12000, retries: 1 });
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return { ok: false, latenciaMs, amostraPreco: null, amostraReferencia: null, mensagem: `PNCP respondeu HTTP ${resp.status}.`, dadosBrutos: null };
      }
      const body = resp.corpoJson as { data?: unknown[]; totalRegistros?: number } | null;
      const total = body?.totalRegistros ?? 0;
      return {
        ok: true, latenciaMs, amostraPreco: null, amostraReferencia: null,
        mensagem: `PNCP acessível — ${total} contratações disponíveis em ${latenciaMs}ms.`,
        dadosBrutos: { total },
      };
    } catch (e) {
      return {
        ok: false, latenciaMs: Date.now() - inicio, amostraPreco: null, amostraReferencia: null,
        mensagem: e instanceof Error ? `Falha: ${e.message}` : 'Falha de conexão.', dadosBrutos: null,
      };
    }
  },
};

export function pncpCacheStatus(): { itens: number; expiresAt: number | null; carregando: boolean } {
  return { itens: 0, expiresAt: null, carregando: false };
}
