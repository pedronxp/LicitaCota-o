import type { FonteCotacao } from '@prisma/client';
import type { ItemNormalizado, ResultadoCotacao, TesteResultado } from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { media } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

const BASE = 'https://pncp.gov.br/api';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos — reutilizado por todos os itens da pesquisa

interface ContratacaoItem {
  descricaoItem?: string;
  descricao?: string;
  valorUnitarioEstimado?: number;
  valorUnitario?: number;
}

interface Contratacao {
  orgaoEntidade?: { cnpj?: string };
  anoCompra?: number;
  sequencialCompra?: number;
}

type ItemComRef = ContratacaoItem & { _ref: string };

// Cache em módulo: primeira chamada busca do PNCP, demais reutilizam
let _cache: { itens: ItemComRef[]; expiresAt: number } | null = null;
let _fetchPromise: Promise<ItemComRef[]> | null = null;

function dataFormatada(diasAtras: number): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
}

const MODALIDADES = [6, 8];

async function buscarUmaModalidade(modalidade: number, pagina: number): Promise<Contratacao[]> {
  const url =
    `${BASE}/consulta/v1/contratacoes/publicacao` +
    `?dataInicial=${dataFormatada(91)}&dataFinal=${dataFormatada(1)}` +
    `&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=50`;
  const resp = await requisitar(url, { timeoutMs: 12000, retries: 0 });
  if (!resp.ok) return [];
  const body = resp.corpoJson as { data?: Contratacao[] } | null;
  return body?.data ?? [];
}

async function buscarItensContrato(cnpj: string, ano: number, seq: number): Promise<ContratacaoItem[]> {
  const url = `${BASE}/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=1&tamanhoPagina=50`;
  const resp = await requisitar(url, { timeoutMs: 8000, retries: 0 });
  if (!resp.ok) return [];
  const body = resp.corpoJson;
  if (Array.isArray(body)) return body as ContratacaoItem[];
  return (body as { data?: ContratacaoItem[] })?.data ?? [];
}

async function carregarTodosItens(): Promise<ItemComRef[]> {
  // Busca 2 modalidades × 5 páginas → até 500 contratações
  const lotes = await Promise.allSettled(
    MODALIDADES.flatMap((m) => [1, 2, 3, 4, 5].map((p) => buscarUmaModalidade(m, p))),
  );
  const contratacoes = lotes
    .filter((r): r is PromiseFulfilledResult<Contratacao[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  const resultados = await Promise.allSettled(
    contratacoes.map((ct) => {
      const cnpj = ct.orgaoEntidade?.cnpj;
      const ano = ct.anoCompra;
      const seq = ct.sequencialCompra;
      if (!cnpj || !ano || !seq) return Promise.resolve([] as ItemComRef[]);
      return buscarItensContrato(cnpj, ano, seq).then((itens) =>
        itens.map((i) => ({ ...i, _ref: `PNCP — ${cnpj} ${ano}/${seq}` })),
      );
    }),
  );

  return resultados
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => (r as PromiseFulfilledResult<ItemComRef[]>).value);
}

async function obterItensCache(): Promise<ItemComRef[]> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now) return _cache.itens;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = carregarTodosItens()
    .then((itens) => {
      _cache = { itens, expiresAt: now + CACHE_TTL_MS };
      _fetchPromise = null;
      return itens;
    })
    .catch((err: unknown) => {
      _fetchPromise = null;
      throw err;
    });

  return _fetchPromise;
}

function matcherTermos(termos: string[], descNorm: string): boolean {
  return termos.some((t) => {
    const palavras = normalizar(t).split(' ').filter((w) => w.length > 3);
    if (palavras.length === 0) return false;
    const acertos = palavras.filter((w) => descNorm.includes(w)).length;
    return acertos >= Math.max(1, Math.ceil(palavras.length * 0.6));
  });
}

async function buscarPrecos(
  termos: string[],
  limite: number,
): Promise<{ precos: number[]; referencia: string | null }> {
  const todosItens = await obterItensCache();

  const precos: number[] = [];
  let referencia: string | null = null;

  for (const item of todosItens) {
    const desc = item.descricaoItem ?? item.descricao ?? '';
    const preco = item.valorUnitario ?? item.valorUnitarioEstimado;
    if (!desc || !preco || preco <= 0) continue;
    if (matcherTermos(termos, normalizar(desc))) {
      precos.push(preco);
      if (!referencia) referencia = item._ref;
      if (precos.length >= limite) break;
    }
  }

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
      return {
        preco: null, referencia: '', fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: null, erro: e instanceof Error ? e.message : 'Erro',
      };
    }
  },

  async testar(_config: FonteCotacao, _itemAmostra: string): Promise<TesteResultado> {
    const inicio = Date.now();
    try {
      const url =
        `${BASE}/consulta/v1/contratacoes/publicacao` +
        `?dataInicial=${dataFormatada(31)}&dataFinal=${dataFormatada(1)}` +
        `&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`;
      const resp = await requisitar(url, { timeoutMs: 12000, retries: 1 });
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return { ok: false, latenciaMs, amostraPreco: null, amostraReferencia: null, mensagem: `PNCP respondeu HTTP ${resp.status}.`, dadosBrutos: null };
      }
      const body = resp.corpoJson as { data?: unknown[] } | null;
      const count = body?.data?.length ?? 0;
      return {
        ok: count > 0, latenciaMs, amostraPreco: null, amostraReferencia: null,
        mensagem: count > 0
          ? `PNCP acessível — ${count} contratações recentes em ${latenciaMs}ms.`
          : 'PNCP sem contratações recentes no período.',
        dadosBrutos: { contratacoes: count },
      };
    } catch (e) {
      return {
        ok: false, latenciaMs: Date.now() - inicio, amostraPreco: null, amostraReferencia: null,
        mensagem: e instanceof Error ? `Falha: ${e.message}` : 'Falha de conexão.', dadosBrutos: null,
      };
    }
  },
};
