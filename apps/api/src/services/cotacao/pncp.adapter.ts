import type { FonteCotacao } from '@prisma/client';
import type {
  ContextoConsultaFonte,
  EscopoBuscaPncp,
  ItemNormalizado,
  ResultadoCotacao,
  TesteResultado,
} from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { parsearPreco } from './extrator.js';
import { logger } from '../../utils/logger.js';
import { mediana } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

const BASE_CONSULTA = 'https://pncp.gov.br/api/consulta';
const BASE_PNCP = 'https://pncp.gov.br/api/pncp';
const COTACOES_POR_ITEM = 9;
const CANDIDATOS_POR_ITEM = 9;
const TAMANHO_PAGINA = 50;
const MAX_PAGINAS_POR_MODALIDADE = 6;
const MAX_PAGINAS_ITENS = 20;
const MAX_TEMPO_BUSCA_MS = 75_000;
const CONCORRENCIA_PAGINAS = 2;

// A consulta pública exige uma modalidade, portanto cobrimos as modalidades
// que normalmente publicam compras de bens e serviços comuns.
const MODALIDADES = [6, 8, 4, 9, 10];

interface ContratacaoItem {
  numeroItem?: number | string;
  descricao?: string;
  descricaoItem?: string;
  valorUnitarioEstimado?: number | string | null;
  quantidade?: number | string | null;
  unidadeMedida?: string | null;
  temResultado?: boolean;
}

interface ResultadoItem {
  valorUnitarioHomologado?: number | string | null;
  nomeRazaoSocialFornecedor?: string | null;
  niFornecedor?: string | null;
  numeroDocumentoFornecedor?: string | null;
  dataResultado?: string | null;
}

export interface Contratacao {
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  unidadeOrgao?: { municipioNome?: string; ufSigla?: string };
  anoCompra?: number;
  sequencialCompra?: number;
  dataPublicacaoPncp?: string;
}

function somenteDigitos(valor?: string | null): string {
  return (valor ?? '').replace(/\D/g, '');
}

export function contratacaoDentroEscopo(
  contratacao: Contratacao,
  escopo: EscopoBuscaPncp,
): boolean {
  if (escopo.abrangencia === 'NACIONAL') return true;
  if (escopo.abrangencia === 'ORGAO') {
    return somenteDigitos(contratacao.orgaoEntidade?.cnpj) === somenteDigitos(escopo.orgaoCnpj);
  }
  const uf = normalizar(contratacao.unidadeOrgao?.ufSigla ?? '');
  if (uf !== normalizar(escopo.uf ?? '')) return false;
  if (escopo.abrangencia === 'UF') return true;
  return (
    normalizar(contratacao.unidadeOrgao?.municipioNome ?? '') === normalizar(escopo.municipio ?? '')
  );
}

interface CotacaoPNCP {
  preco: number;
  referencia: string;
  contrato: string;
  descricao: string;
  unidadeMedida: string;
  quantidade: number | null;
  tipoPreco: 'homologado' | 'estimado';
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  numeroItem?: number;
  orgaoCnpj?: string;
  orgaoNome?: string;
}

const contratosCache = new Map<string, Promise<Contratacao[]>>();
const itensCache = new Map<string, Promise<ContratacaoItem[]>>();
const resultadosCache = new Map<string, Promise<ResultadoItem[]>>();

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

export function matcherTermos(termos: string[], descNorm: string): boolean {
  const palavrasDescricao = normalizar(descNorm).split(/\s+/).filter(Boolean);
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
      // Restringe a comparação ao contexto próximo do núcleo. Isso evita
      // casar "pendrive" e "16 GB" em trechos distantes de um edital longo.
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

function chaveContrato(ct: Contratacao): string | null {
  const cnpj = ct.orgaoEntidade?.cnpj;
  if (!cnpj || !ct.anoCompra || !ct.sequencialCompra) return null;
  return `${cnpj}/${ct.anoCompra}/${ct.sequencialCompra}`;
}

async function consultarContratos(
  dataIni: Date,
  dataFim: Date,
  modalidade: number,
): Promise<Contratacao[]> {
  const cacheKey = `${fmt(dataIni)}-${fmt(dataFim)}-${modalidade}`;
  const existente = contratosCache.get(cacheKey);
  if (existente) return existente;

  const consulta = (async (): Promise<Contratacao[]> => {
    const base = `${BASE_CONSULTA}/v1/contratacoes/publicacao?dataInicial=${fmt(dataIni)}&dataFinal=${fmt(dataFim)}&codigoModalidadeContratacao=${modalidade}&tamanhoPagina=${TAMANHO_PAGINA}`;
    try {
      const primeira = await requisitar(`${base}&pagina=1`, {
        timeoutMs: 10_000,
        retries: 0,
        maxTempoTotalMs: 10_000,
      });
      if (!primeira.ok) return [];
      const meta = primeira.corpoJson as { totalPaginas?: number } | null;
      const totalPaginas = Math.max(1, meta?.totalPaginas ?? 1);
      const inicio = Math.max(1, totalPaginas - MAX_PAGINAS_POR_MODALIDADE + 1);
      const contratos: Contratacao[] = [...listaDaResposta<Contratacao>(primeira.corpoJson)];

      // A API retorna as páginas em ordem antiga -> recente. Percorrer de trás
      // para frente prioriza contratações recentes sem assumir que a última
      // página tenha apenas os registros mais novos.
      const paginas = Array.from(
        { length: totalPaginas - inicio + 1 },
        (_, i) => totalPaginas - i,
      ).filter((pagina) => pagina !== 1);
      for (let i = 0; i < paginas.length; i += CONCORRENCIA_PAGINAS) {
        const respostas = await Promise.allSettled(
          paginas
            .slice(i, i + CONCORRENCIA_PAGINAS)
            .map((pagina) =>
              requisitar(`${base}&pagina=${pagina}`, {
                timeoutMs: 10_000,
                retries: 0,
                maxTempoTotalMs: 10_000,
              }),
            ),
        );
        for (const resultado of respostas) {
          if (resultado.status === 'fulfilled' && resultado.value.ok) {
            contratos.push(...listaDaResposta<Contratacao>(resultado.value.corpoJson));
          }
        }
      }
      return contratos;
    } catch (e) {
      logger.warn(`PNCP: modalidade ${modalidade} indisponível; seguindo para a próxima`, {
        erro: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  })();

  contratosCache.set(cacheKey, consulta);
  const contratos = await consulta;
  if (contratos.length === 0) contratosCache.delete(cacheKey);
  return contratos;
}

async function buscarItensContrato(ct: Contratacao): Promise<ContratacaoItem[]> {
  const key = chaveContrato(ct);
  if (!key) return [];
  const existente = itensCache.get(key);
  if (existente) return existente;

  const [cnpj, ano, seq] = key.split('/');
  const consulta = (async (): Promise<ContratacaoItem[]> => {
    try {
      const itens: ContratacaoItem[] = [];
      for (let pagina = 1; pagina <= MAX_PAGINAS_ITENS; pagina++) {
        const resp = await requisitar(
          `${BASE_PNCP}/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`,
          { timeoutMs: 8_000, retries: 0, maxTempoTotalMs: 8_000 },
        );
        if (!resp.ok) break;
        const lote = listaDaResposta<ContratacaoItem>(resp.corpoJson);
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

async function buscarResultadosItem(
  ct: Contratacao,
  numeroItem: number | string,
): Promise<ResultadoItem[]> {
  const key = `${chaveContrato(ct) ?? ''}/${numeroItem}`;
  const existente = resultadosCache.get(key);
  if (existente) return existente;

  const contrato = chaveContrato(ct);
  if (!contrato) return [];
  const [cnpj, ano, seq] = contrato.split('/');
  const consulta = (async (): Promise<ResultadoItem[]> => {
    try {
      const resp = await requisitar(
        `${BASE_PNCP}/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${numeroItem}/resultados`,
        { timeoutMs: 8_000, retries: 0, maxTempoTotalMs: 8_000 },
      );
      return resp.ok ? listaDaResposta<ResultadoItem>(resp.corpoJson) : [];
    } catch {
      return [];
    }
  })();

  resultadosCache.set(key, consulta);
  return consulta;
}

async function buscarPrecos(cascata: string[], escopo?: EscopoBuscaPncp): Promise<CotacaoPNCP[]> {
  const inicioBusca = Date.now();
  const janelas = escopo
    ? [
        {
          ini: new Date(`${escopo.dataInicial}T00:00:00.000Z`),
          fim: new Date(`${escopo.dataFinal}T23:59:59.999Z`),
        },
      ]
    : [
        { ini: diasAtras(90), fim: new Date() },
        { ini: diasAtras(365), fim: diasAtras(91) },
      ];
  const contratosVisitados = new Set<string>();
  const cotacoes: CotacaoPNCP[] = [];
  busca: for (const janela of janelas) {
    for (const modalidade of MODALIDADES) {
      if (Date.now() - inicioBusca >= MAX_TEMPO_BUSCA_MS) {
        logger.warn('PNCP: orçamento de tempo atingido; retornando os candidatos já coletados.', {
          candidatos: cotacoes.length,
          limiteMs: MAX_TEMPO_BUSCA_MS,
        });
        break busca;
      }
      if (cotacoes.length >= CANDIDATOS_POR_ITEM) break;
      const encontrados = await consultarContratos(janela.ini, janela.fim, modalidade);
      for (const ct of encontrados) {
        if (escopo && !contratacaoDentroEscopo(ct, escopo)) continue;
        if (cotacoes.length >= CANDIDATOS_POR_ITEM) break;
        const contrato = chaveContrato(ct);
        if (!contrato || contratosVisitados.has(contrato)) continue;
        contratosVisitados.add(contrato);
        const itens = await buscarItensContrato(ct);

        for (const item of itens) {
          const descricao = item.descricao ?? item.descricaoItem ?? '';
          if (!descricao || !matcherTermos(cascata, descricao)) continue;
          const unidadeMedida = item.unidadeMedida ?? '';
          if (['lote', 'global'].includes(normalizar(unidadeMedida))) continue;

          let preco: number | null = null;
          let fornecedor = '';
          let fornecedorNome = '';
          let fornecedorCnpj = '';
          let tipoPreco: CotacaoPNCP['tipoPreco'] = 'estimado';
          if (item.temResultado && item.numeroItem != null) {
            const resultados = await buscarResultadosItem(ct, item.numeroItem);
            const resultado = resultados.find(
              (r) => parsearPreco(r.valorUnitarioHomologado) !== null,
            );
            preco = resultado ? parsearPreco(resultado.valorUnitarioHomologado) : null;
            fornecedorNome = resultado?.nomeRazaoSocialFornecedor?.trim() ?? '';
            fornecedorCnpj = String(
              resultado?.niFornecedor ?? resultado?.numeroDocumentoFornecedor ?? '',
            ).replace(/\D/g, '');
            fornecedor = fornecedorNome
              ? ` — ${fornecedorNome}${fornecedorCnpj.length === 14 ? ` (CNPJ ${fornecedorCnpj})` : ''}`
              : '';
            if (preco) tipoPreco = 'homologado';
          }
          preco ??= parsearPreco(item.valorUnitarioEstimado);
          if (!preco || preco <= 0) continue;

          const orgao =
            ct.orgaoEntidade?.razaoSocial ?? ct.orgaoEntidade?.cnpj ?? 'Órgão não informado';
          const data = ct.dataPublicacaoPncp?.slice(0, 10) ?? `${ct.anoCompra}`;
          cotacoes.push({
            preco,
            contrato,
            descricao,
            unidadeMedida,
            quantidade: parsearPreco(item.quantidade),
            tipoPreco,
            referencia: `PNCP — ${orgao}${fornecedor} (${data})`,
            fornecedorNome: fornecedorNome || undefined,
            fornecedorCnpj: fornecedorCnpj.length === 14 ? fornecedorCnpj : undefined,
            numeroItem: item.numeroItem == null ? undefined : Number(item.numeroItem),
            orgaoCnpj: ct.orgaoEntidade?.cnpj?.replace(/\D/g, ''),
            orgaoNome: ct.orgaoEntidade?.razaoSocial,
          });
          break;
        }
      }
    }
  }

  const centro = mediana(cotacoes.map((c) => c.preco));
  const selecionadas = [...cotacoes]
    .sort((a, b) => Math.abs(a.preco - centro) - Math.abs(b.preco - centro))
    .slice(0, COTACOES_POR_ITEM);
  logger.info(
    `PNCP: ${selecionadas.length} cotações selecionadas entre ${cotacoes.length} candidatos em ${contratosVisitados.size} contratações analisadas`,
  );
  return selecionadas;
}

export const pncpAdapter: FonteAdapter = {
  slug: 'pncp',

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
        cotacoes: cotacoes.map((cotacao) => ({
          preco: cotacao.preco,
          referencia: cotacao.referencia,
          contrato: cotacao.contrato,
          numeroItem: cotacao.numeroItem,
          orgaoCnpj: cotacao.orgaoCnpj,
          orgaoNome: cotacao.orgaoNome,
          fornecedorCnpj: cotacao.fornecedorCnpj,
          fornecedorNome: cotacao.fornecedorNome,
          tipoPreco: cotacao.tipoPreco,
          unidadeMedida: cotacao.unidadeMedida,
          descricaoOriginal: cotacao.descricao,
        })),
      };
    } catch (e) {
      logger.error('PNCP consultar erro', e);
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
      const hoje = new Date();
      const ini = diasAtras(30);
      const url = `${BASE_CONSULTA}/v1/contratacoes/publicacao?dataInicial=${fmt(ini)}&dataFinal=${fmt(hoje)}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`;
      const resp = await requisitar(url, {
        timeoutMs: 10_000,
        retries: 0,
        maxTempoTotalMs: 10_000,
      });
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return {
          ok: false,
          latenciaMs,
          amostraPreco: null,
          amostraReferencia: null,
          mensagem: `PNCP respondeu HTTP ${resp.status}.`,
          dadosBrutos: null,
        };
      }
      const body = resp.corpoJson as { totalRegistros?: number; totalPaginas?: number } | null;
      return {
        ok: true,
        latenciaMs,
        amostraPreco: null,
        amostraReferencia: null,
        mensagem: `PNCP acessível — ${body?.totalRegistros?.toLocaleString('pt-BR')} contratações em ${latenciaMs}ms.`,
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

export function pncpCacheStatus(): {
  itens: number;
  expiresAt: number | null;
  carregando: boolean;
} {
  return { itens: itensCache.size, expiresAt: null, carregando: false };
}
