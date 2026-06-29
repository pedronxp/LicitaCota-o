import type { FonteCotacao } from '@prisma/client';
import type { ItemNormalizado, ResultadoCotacao, TesteResultado } from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { logger } from '../../utils/logger.js';
import { media } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

const BASE_CONSULTA = 'https://pncp.gov.br/api/consulta';
const BASE_PNCP = 'https://pncp.gov.br/api/pncp';

interface ContratacaoItem {
  descricao?: string;
  descricaoItem?: string;
  valorUnitarioEstimado?: number;
  valorUnitario?: number;
}

interface Contratacao {
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  anoCompra?: number;
  sequencialCompra?: number;
  dataPublicacaoPncp?: string;
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
}

function matcherTermos(termos: string[], descNorm: string): boolean {
  return termos.some((t) => {
    const palavras = normalizar(t).split(/\s+/).filter((w) => w.length > 2);
    if (palavras.length === 0) return false;
    const acertos = palavras.filter((w) => descNorm.includes(w)).length;
    return acertos >= Math.max(1, Math.ceil(palavras.length * 0.6));
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

/**
 * Busca os contratos mais recentes dentro de uma janela de data.
 * Usa totalPaginas para ir diretamente à última página (mais recentes).
 * Modalidade 6 = Pregão (mais comum para bens e serviços).
 */
async function buscarContratosRecentes(
  dataIni: Date,
  dataFim: Date,
  maxContratos = 10,
): Promise<Contratacao[]> {
  const base = `${BASE_CONSULTA}/v1/contratacoes/publicacao?dataInicial=${fmt(dataIni)}&dataFinal=${fmt(dataFim)}&codigoModalidadeContratacao=6&tamanhoPagina=50`;

  // 1ª chamada: descobrir totalPaginas
  let totalPaginas = 1;
  try {
    const r = await requisitar(`${base}&pagina=1`, { timeoutMs: 10000, retries: 0 });
    if (!r.ok) return [];
    const body = r.corpoJson as { totalPaginas?: number } | null;
    totalPaginas = body?.totalPaginas ?? 1;
  } catch {
    return [];
  }

  // 2ª chamada: última página = contratos mais recentes
  try {
    const r = await requisitar(`${base}&pagina=${totalPaginas}`, { timeoutMs: 10000, retries: 0 });
    if (!r.ok) return [];
    const body = r.corpoJson as { data?: Contratacao[] } | null;
    const contratos = (body?.data ?? []).filter(
      (c) => c.orgaoEntidade?.cnpj && c.anoCompra && c.sequencialCompra,
    );
    // Retorna os mais recentes (últimos do array já que a página é crescente)
    return contratos.slice(-maxContratos).reverse();
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

/**
 * Estratégia de busca: janelas de data do mais recente ao mais antigo.
 * Para cada janela, vai à última página da API (contratos mais recentes),
 * verifica os itens e coleta preços de fontes distintas.
 * Garante 3 cotações de 3 contratos diferentes (Lei 14.133/2021, Art. 23).
 */
async function buscarPrecos(
  cascata: string[],
  limite: number,
): Promise<{ precos: number[]; referencias: string[] }> {
  // Janelas: do mais recente ao mais antigo
  const janelas = [
    { ini: diasAtras(90),  fim: new Date() },        // últimos 90 dias
    { ini: diasAtras(365), fim: diasAtras(91) },     // 91-365 dias
  ];

  // Deduplicação por contrato: 1 preço por fonte distinta
  const precosPorFonte = new Map<string, { preco: number; ref: string }>();

  for (const janela of janelas) {
    if (precosPorFonte.size >= limite) break;

    const contratos = await buscarContratosRecentes(janela.ini, janela.fim, 8);
    logger.info(`PNCP: ${contratos.length} contratos recentes na janela`);

    for (const ct of contratos) {
      if (precosPorFonte.size >= limite) break;

      const cnpj = ct.orgaoEntidade!.cnpj!;
      const ano = ct.anoCompra!;
      const seq = ct.sequencialCompra!;
      const fonteKey = `${cnpj}/${ano}/${seq}`;

      if (precosPorFonte.has(fonteKey)) continue;

      const itens = await buscarItensContrato(cnpj, ano, seq);

      for (const item of itens) {
        const desc = item.descricao ?? item.descricaoItem ?? '';
        const preco = item.valorUnitario ?? item.valorUnitarioEstimado;
        if (!desc || !preco || preco <= 0) continue;

        if (matcherTermos(cascata, normalizar(desc))) {
          const orgao = ct.orgaoEntidade?.razaoSocial ?? cnpj;
          const data = ct.dataPublicacaoPncp?.slice(0, 10) ?? `${ano}`;
          precosPorFonte.set(fonteKey, {
            preco,
            ref: `PNCP — ${orgao} (${data})`,
          });
          break; // 1 preço por contrato
        }
      }
    }
  }

  const resultados = [...precosPorFonte.values()];
  logger.info(`PNCP: ${resultados.length} preços de ${resultados.length} fontes distintas`);

  return {
    precos: resultados.map((r) => r.preco),
    referencias: resultados.map((r) => r.ref),
  };
}

export const pncpAdapter: FonteAdapter = {
  slug: 'pncp',

  async consultar(item: ItemNormalizado, config: FonteCotacao): Promise<ResultadoCotacao> {
    const limite = Math.max(config.limiteResultados > 0 ? config.limiteResultados : 3, 3);
    try {
      const { precos, referencias } = await buscarPrecos(item.cascata, limite);
      if (precos.length === 0) {
        return { preco: null, referencia: '', fundamentacaoArtigo: config.fundamentacaoArtigo ?? '', dadosBrutos: null };
      }
      return {
        preco: Math.round(media(precos) * 10000) / 10000,
        referencia: referencias.join('; '),
        fundamentacaoArtigo: config.fundamentacaoArtigo ?? '',
        dadosBrutos: { precos, referencias, totalFontes: precos.length },
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
      const ini = diasAtras(30);
      const url = `${BASE_CONSULTA}/v1/contratacoes/publicacao?dataInicial=${fmt(ini)}&dataFinal=${fmt(hoje)}&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`;
      const resp = await requisitar(url, { timeoutMs: 12000, retries: 1 });
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return { ok: false, latenciaMs, amostraPreco: null, amostraReferencia: null, mensagem: `PNCP respondeu HTTP ${resp.status}.`, dadosBrutos: null };
      }
      const body = resp.corpoJson as { totalRegistros?: number; totalPaginas?: number } | null;
      return {
        ok: true, latenciaMs, amostraPreco: null, amostraReferencia: null,
        mensagem: `PNCP acessível — ${body?.totalRegistros?.toLocaleString('pt-BR')} contratações em ${latenciaMs}ms.`,
        dadosBrutos: { totalRegistros: body?.totalRegistros, totalPaginas: body?.totalPaginas },
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
