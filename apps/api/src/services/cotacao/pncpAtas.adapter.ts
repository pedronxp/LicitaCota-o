import type { FonteCotacao } from '@prisma/client';
import type {
  ContextoConsultaFonte,
  EscopoBuscaPncp,
  ItemNormalizado,
  ResultadoCotacao,
  TesteResultado,
} from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { logger } from '../../utils/logger.js';
import { parsearPreco } from './extrator.js';
import { mediana } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

const BASE_CONSULTA = 'https://pncp.gov.br/api/consulta';
const BASE_PNCP = 'https://pncp.gov.br/api/pncp';
const COTACOES_POR_ITEM = 3;
const CANDIDATOS_POR_ITEM = 9;
const TAMANHO_PAGINA = 50;
const MAX_PAGINAS = 6;
const MAX_PAGINAS_ITENS = 20;

interface Ata {
  numeroControlePNCPAta?: string;
  numeroControlePNCPCompra?: string;
  cancelado?: boolean;
  dataPublicacaoPncp?: string;
  nomeOrgao?: string;
}

interface AtaItem {
  numeroItem?: number | string;
  descricaoItem?: string;
  descricao?: string;
  valorUnitarioEstimado?: number | string | null;
  unidadeMedida?: string | null;
  temResultado?: boolean;
}

interface ResultadoItem {
  valorUnitarioHomologado?: number | string | null;
  nomeRazaoSocialFornecedor?: string | null;
}

interface AtaComItem {
  ata: Ata;
  cnpj: string;
  ano: number;
  sequencialCompra: number;
  sequencialAta: number;
}

interface CotacaoAta {
  preco: number;
  referencia: string;
  numeroControleAta: string;
  descricao: string;
  unidadeMedida: string;
  tipoPreco: 'homologado' | 'estimado';
}

const itensCache = new Map<string, Promise<AtaItem[]>>();
const resultadosCache = new Map<string, Promise<ResultadoItem[]>>();
let atasCache: Promise<AtaComItem[]> | undefined;

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matcherTermos(termos: string[], descricao: string): boolean {
  const palavrasDescricao = normalizar(descricao).split(/\s+/).filter(Boolean);
  return termos.some((termo) => {
    const palavras = normalizar(termo)
      .split(/\s+/)
      .filter(
        (w) => w.length > 2 || /^\d/.test(w) || ['gb', 'ml', 'kg', 'mm', 'cm', 'lt'].includes(w),
      );
    if (palavras.length === 0) return false;
    const compativel = (candidata: string, palavra: string): boolean =>
      candidata === palavra ||
      (Math.min(candidata.length, palavra.length) >= 5 &&
        (candidata.startsWith(palavra) || palavra.startsWith(candidata)));
    const indicesNucleo = palavrasDescricao
      .map((palavra, indice) => (compativel(palavra, palavras[0]) ? indice : -1))
      .filter((indice) => indice >= 0);
    return indicesNucleo.some((indiceNucleo) => {
      const janela = palavrasDescricao.slice(Math.max(0, indiceNucleo - 5), indiceNucleo + 26);
      const corresponde = (palavra: string): boolean =>
        janela.some((candidata) => compativel(candidata, palavra));
      const especificacoes = palavras.filter(
        (palavra) => /^\d/.test(palavra) || ['gb', 'ml', 'kg', 'mm', 'cm', 'lt'].includes(palavra),
      );
      if (!especificacoes.every(corresponde)) return false;
      const acertos = palavras.filter(corresponde).length;
      return acertos >= Math.max(1, Math.ceil(palavras.length * 0.6));
    });
  });
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function diasAtras(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function listaDaResposta<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: T[] }).data;
  }
  return [];
}

/**
 * O endpoint de consulta de atas não possui rota de itens. Os itens ficam na
 * contratação vinculada à ata (`numeroControlePNCPCompra`).
 */
function parsearAta(ata: Ata): AtaComItem | null {
  if (ata.cancelado) return null;
  const controleCompra =
    ata.numeroControlePNCPCompra ?? ata.numeroControlePNCPAta?.replace(/-\d{6}$/, '');
  const controleAta = ata.numeroControlePNCPAta;
  if (!controleCompra || !controleAta) return null;

  const compra = controleCompra.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  const ataNumero = controleAta.match(/-(\d{6})$/);
  if (!compra || !ataNumero) return null;

  return {
    ata,
    cnpj: compra[1],
    sequencialCompra: Number(compra[2]),
    ano: Number(compra[3]),
    sequencialAta: Number(ataNumero[1]),
  };
}

async function buscarAtasRecentes(): Promise<AtaComItem[]> {
  if (atasCache) return atasCache;

  atasCache = buscarAtasRecentesSemCache();
  const atas = await atasCache;
  if (atas.length === 0) atasCache = undefined;
  return atas;
}

async function buscarAtasRecentesSemCache(escopo?: EscopoBuscaPncp): Promise<AtaComItem[]> {
  const dataInicial = escopo ? new Date(`${escopo.dataInicial}T00:00:00.000Z`) : diasAtras(365);
  const dataFinal = escopo ? new Date(`${escopo.dataFinal}T23:59:59.999Z`) : new Date();
  const base = `${BASE_CONSULTA}/v1/atas?dataInicial=${fmt(dataInicial)}&dataFinal=${fmt(dataFinal)}&tamanhoPagina=${TAMANHO_PAGINA}`;
  try {
    const primeira = await requisitar(`${base}&pagina=1`, { timeoutMs: 30000, retries: 1 });
    if (!primeira.ok) return [];
    const meta = primeira.corpoJson as { totalPaginas?: number } | null;
    const totalPaginas = Math.max(1, meta?.totalPaginas ?? 1);
    const paginas = new Set<number>();
    for (let p = 1; p <= Math.min(MAX_PAGINAS, totalPaginas); p++) paginas.add(p);
    for (let p = totalPaginas; p > Math.max(0, totalPaginas - MAX_PAGINAS); p--) paginas.add(p);

    const respostas = await Promise.allSettled(
      [...paginas]
        .sort((a, b) => b - a)
        .map((pagina) => requisitar(`${base}&pagina=${pagina}`, { timeoutMs: 30000, retries: 1 })),
    );
    const atas: AtaComItem[] = [];
    for (const resultado of respostas) {
      if (resultado.status !== 'fulfilled' || !resultado.value.ok) continue;
      for (const ata of listaDaResposta<Ata>(resultado.value.corpoJson)) {
        const parsed = parsearAta(ata);
        if (parsed) atas.push(parsed);
      }
    }
    return atas;
  } catch (e) {
    logger.warn('PNCP Atas: falha ao consultar atas', e);
    return [];
  }
}

function chaveCompra(ata: AtaComItem): string {
  return `${ata.cnpj}/${ata.ano}/${ata.sequencialCompra}`;
}

async function buscarItensAta(ata: AtaComItem): Promise<AtaItem[]> {
  const key = chaveCompra(ata);
  const existente = itensCache.get(key);
  if (existente) return existente;
  const consulta = (async (): Promise<AtaItem[]> => {
    try {
      const itens: AtaItem[] = [];
      for (let pagina = 1; pagina <= MAX_PAGINAS_ITENS; pagina++) {
        const resp = await requisitar(
          `${BASE_PNCP}/v1/orgaos/${ata.cnpj}/compras/${ata.ano}/${ata.sequencialCompra}/itens?pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`,
          { timeoutMs: 10000, retries: 1 },
        );
        if (!resp.ok) break;
        const lote = listaDaResposta<AtaItem>(resp.corpoJson);
        itens.push(...lote);
        if (lote.length < TAMANHO_PAGINA) break;
      }
      return itens;
    } catch {
      return [];
    }
  })();
  itensCache.set(key, consulta);
  const itens = await consulta;
  if (itens.length === 0) itensCache.delete(key);
  return itens;
}

async function buscarResultadosAta(
  ata: AtaComItem,
  numeroItem: number | string,
): Promise<ResultadoItem[]> {
  const key = `${chaveCompra(ata)}/${numeroItem}`;
  const existente = resultadosCache.get(key);
  if (existente) return existente;
  const consulta = (async (): Promise<ResultadoItem[]> => {
    try {
      const resp = await requisitar(
        `${BASE_PNCP}/v1/orgaos/${ata.cnpj}/compras/${ata.ano}/${ata.sequencialCompra}/itens/${numeroItem}/resultados`,
        { timeoutMs: 10000, retries: 0 },
      );
      return resp.ok ? listaDaResposta<ResultadoItem>(resp.corpoJson) : [];
    } catch {
      return [];
    }
  })();
  resultadosCache.set(key, consulta);
  return consulta;
}

async function buscarPrecos(cascata: string[], escopo?: EscopoBuscaPncp): Promise<CotacaoAta[]> {
  const atasBase = escopo ? await buscarAtasRecentesSemCache(escopo) : await buscarAtasRecentes();
  const atas =
    escopo?.abrangencia === 'ORGAO'
      ? atasBase.filter((ata) => ata.cnpj === (escopo.orgaoCnpj ?? '').replace(/\D/g, ''))
      : escopo && ['UF', 'MUNICIPIO'].includes(escopo.abrangencia)
        ? []
        : atasBase;
  const encontrados: CotacaoAta[] = [];
  const fontes = new Set<string>();

  for (const ata of atas) {
    if (encontrados.length >= CANDIDATOS_POR_ITEM) break;
    const fonte = `${ata.ata.numeroControlePNCPAta}`;
    if (fontes.has(fonte)) continue;
    const itens = await buscarItensAta(ata);

    for (const item of itens) {
      const descricao = item.descricao ?? item.descricaoItem ?? '';
      if (!descricao || !matcherTermos(cascata, descricao)) continue;
      if (['lote', 'global'].includes(normalizar(item.unidadeMedida ?? ''))) continue;
      let preco: number | null = null;
      let fornecedor = '';
      let tipoPreco: CotacaoAta['tipoPreco'] = 'estimado';
      if (item.temResultado && item.numeroItem != null) {
        const resultados = await buscarResultadosAta(ata, item.numeroItem);
        const resultado = resultados.find((r) => parsearPreco(r.valorUnitarioHomologado) !== null);
        preco = resultado ? parsearPreco(resultado.valorUnitarioHomologado) : null;
        fornecedor = resultado?.nomeRazaoSocialFornecedor
          ? ` — ${resultado.nomeRazaoSocialFornecedor}`
          : '';
        if (preco) tipoPreco = 'homologado';
      }
      preco ??= parsearPreco(item.valorUnitarioEstimado);
      if (!preco || preco <= 0) continue;

      const data = ata.ata.dataPublicacaoPncp?.slice(0, 10) ?? `${ata.ano}`;
      encontrados.push({
        preco,
        numeroControleAta: fonte,
        descricao,
        unidadeMedida: item.unidadeMedida ?? '',
        tipoPreco,
        referencia: `PNCP Ata ${fonte} — ${ata.ata.nomeOrgao ?? ata.cnpj}${fornecedor} (${data})`,
      });
      fontes.add(fonte);
      break;
    }
  }

  const centro = mediana(encontrados.map((c) => c.preco));
  const selecionadas = [...encontrados]
    .sort((a, b) => Math.abs(a.preco - centro) - Math.abs(b.preco - centro))
    .slice(0, COTACOES_POR_ITEM);
  logger.info(
    `PNCP Atas: ${selecionadas.length} cotações selecionadas entre ${encontrados.length} candidatos em ${atas.length} atas analisadas`,
  );
  return selecionadas;
}

export const pncpAtasAdapter: FonteAdapter = {
  slug: 'pncp-atas',

  async consultar(
    item: ItemNormalizado,
    config: FonteCotacao,
    contexto?: ContextoConsultaFonte,
  ): Promise<ResultadoCotacao> {
    try {
      const cotacoes = await buscarPrecos(item.cascata, contexto?.pncp);
      const precos = cotacoes.map((c) => c.preco);
      const referencias = cotacoes.map((c) => c.referencia);
      if (precos.length === 0) {
        return {
          preco: null,
          referencia: '',
          fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
          dadosBrutos: { precos: [], referencias: [], totalFontes: 0 },
          cotacoes: [],
        };
      }
      return {
        preco: Math.round(mediana(precos) * 10000) / 10000,
        referencia: referencias.join('; '),
        fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: {
          precos,
          referencias,
          cotacoes,
          totalFontes: precos.length,
          limiteSolicitado: COTACOES_POR_ITEM,
        },
        cotacoes: cotacoes.map(({ preco, referencia }) => ({ preco, referencia })),
      };
    } catch (e) {
      return {
        preco: null,
        referencia: '',
        fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: null,
        cotacoes: [],
        erro: e instanceof Error ? e.message : 'Erro',
      };
    }
  },

  async testar(_config: FonteCotacao, _itemAmostra: string): Promise<TesteResultado> {
    const inicio = Date.now();
    try {
      const resp = await requisitar(
        `${BASE_CONSULTA}/v1/atas?dataInicial=${fmt(diasAtras(30))}&dataFinal=${fmt(new Date())}&pagina=1&tamanhoPagina=10`,
        { timeoutMs: 15000, retries: 1 },
      );
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return {
          ok: false,
          latenciaMs,
          amostraPreco: null,
          amostraReferencia: null,
          mensagem: `PNCP Atas respondeu HTTP ${resp.status}.`,
          dadosBrutos: null,
        };
      }
      const body = resp.corpoJson as { totalRegistros?: number; totalPaginas?: number } | null;
      return {
        ok: true,
        latenciaMs,
        amostraPreco: null,
        amostraReferencia: null,
        mensagem: `PNCP Atas acessível — ${body?.totalRegistros?.toLocaleString('pt-BR')} atas disponíveis em ${latenciaMs}ms.`,
        dadosBrutos: { totalRegistros: body?.totalRegistros, totalPaginas: body?.totalPaginas },
      };
    } catch (e) {
      return {
        ok: false,
        latenciaMs: Date.now() - inicio,
        amostraPreco: null,
        amostraReferencia: null,
        mensagem: e instanceof Error ? `Falha: ${e.message}` : 'Falha de conexão.',
        dadosBrutos: null,
      };
    }
  },
};

export function pncpAtasCacheStatus(): {
  itens: number;
  expiresAt: number | null;
  carregando: boolean;
} {
  return { itens: itensCache.size, expiresAt: null, carregando: false };
}
