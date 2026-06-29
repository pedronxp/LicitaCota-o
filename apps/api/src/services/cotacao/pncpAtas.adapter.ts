import type { FonteCotacao } from '@prisma/client';
import type { ItemNormalizado, ResultadoCotacao, TesteResultado } from '@licitapreco/shared';
import { requisitar } from '../../utils/http.js';
import { logger } from '../../utils/logger.js';
import { media } from './calculo.js';
import type { FonteAdapter } from './adapter.js';

const BASE_CONSULTA = 'https://pncp.gov.br/api/consulta';
const BASE_PNCP = 'https://pncp.gov.br/api/pncp';

interface Ata {
  numeroControlePNCPAta?: string;
  objetoContratacao?: string;
  cancelado?: boolean;
  dataPublicacaoPncp?: string;
  vigenciaFim?: string;
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
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

// Formato: {cnpj14}-{modalidade}-{sequencial}/{ano}-{sequencialAta}
function parsearAta(ata: Ata): { cnpj: string; anoCompra: number; sequencialCompra: number; sequencialAta: number } | null {
  if (!ata.numeroControlePNCPAta || ata.cancelado) return null;
  const controle = ata.numeroControlePNCPAta;
  const cnpj = controle.replace(/\D/g, '').slice(0, 14);
  if (cnpj.length !== 14) return null;
  const match = controle.match(/-(\d+)\/(\d{4})-(\d+)$/);
  if (!match) return null;
  return {
    cnpj,
    sequencialCompra: parseInt(match[1], 10),
    anoCompra: parseInt(match[2], 10),
    sequencialAta: parseInt(match[3], 10),
  };
}

/**
 * Busca as atas mais recentes dentro de uma janela de data.
 * Atas de Registro de Preços são especialmente valiosas: têm preços
 * homologados (valorUnitario = preço final vencedor) e vigência longa.
 */
async function buscarAtasRecentes(
  dataIni: Date,
  dataFim: Date,
  maxAtas = 10,
): Promise<Ata[]> {
  const base = `${BASE_CONSULTA}/v1/atas?dataInicial=${fmt(dataIni)}&dataFinal=${fmt(dataFim)}&tamanhoPagina=50`;

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

  // 2ª chamada: última página = atas mais recentes
  try {
    const r = await requisitar(`${base}&pagina=${totalPaginas}`, { timeoutMs: 10000, retries: 0 });
    if (!r.ok) return [];
    const body = r.corpoJson as { data?: Ata[] } | null;
    const atas = (body?.data ?? []).filter((a) => !a.cancelado && a.numeroControlePNCPAta);
    return atas.slice(-maxAtas).reverse();
  } catch {
    return [];
  }
}

async function buscarItensAta(cnpj: string, ano: number, seq: number, nata: number): Promise<AtaItem[]> {
  const url = `${BASE_PNCP}/v1/orgaos/${cnpj}/compras/${ano}/${seq}/atas/${nata}/itens?pagina=1&tamanhoPagina=50`;
  try {
    const resp = await requisitar(url, { timeoutMs: 8000, retries: 0 });
    if (!resp.ok) return [];
    const body = resp.corpoJson;
    if (Array.isArray(body)) return body as AtaItem[];
    return (body as { data?: AtaItem[] })?.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Estratégia de busca em Atas de Registro de Preços:
 * - Janelas do mais recente ao mais antigo (até 3 anos para atas com vigência longa)
 * - Preço de referência: valorUnitario (preço homologado, mais confiável)
 * - 1 preço por ata (fonte distinta)
 */
async function buscarPrecos(
  cascata: string[],
  limite: number,
): Promise<{ precos: number[]; referencias: string[] }> {
  const janelas = [
    { ini: diasAtras(365), fim: new Date() },          // último ano
    { ini: diasAtras(1095), fim: diasAtras(366) },     // 1-3 anos (atas ainda vigentes)
  ];

  const precosPorFonte = new Map<string, { preco: number; ref: string }>();

  for (const janela of janelas) {
    if (precosPorFonte.size >= limite) break;

    const atas = await buscarAtasRecentes(janela.ini, janela.fim, 8);
    logger.info(`PNCP Atas: ${atas.length} atas recentes na janela`);

    for (const ata of atas) {
      if (precosPorFonte.size >= limite) break;

      const parsed = parsearAta(ata);
      if (!parsed) continue;

      const { cnpj, anoCompra, sequencialCompra, sequencialAta } = parsed;
      const fonteKey = `${cnpj}/${anoCompra}/${sequencialCompra}/ata${sequencialAta}`;

      if (precosPorFonte.has(fonteKey)) continue;

      const itens = await buscarItensAta(cnpj, anoCompra, sequencialCompra, sequencialAta);

      for (const item of itens) {
        const desc = item.descricao ?? item.descricaoItem ?? '';
        // Prefere valorUnitario (preço homologado) ao estimado
        const preco = item.valorUnitario ?? item.valorUnitarioEstimado;
        if (!desc || !preco || preco <= 0) continue;

        if (matcherTermos(cascata, normalizar(desc))) {
          const data = ata.dataPublicacaoPncp?.slice(0, 10) ?? `${anoCompra}`;
          precosPorFonte.set(fonteKey, {
            preco,
            ref: `PNCP Ata — ${cnpj} (${data})`,
          });
          break; // 1 preço por ata
        }
      }
    }
  }

  const resultados = [...precosPorFonte.values()];
  logger.info(`PNCP Atas: ${resultados.length} preços de ${resultados.length} fontes distintas`);

  return {
    precos: resultados.map((r) => r.preco),
    referencias: resultados.map((r) => r.ref),
  };
}

export const pncpAtasAdapter: FonteAdapter = {
  slug: 'pncp-atas',

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
      const url = `${BASE_CONSULTA}/v1/atas?dataInicial=${fmt(ini)}&dataFinal=${fmt(hoje)}&pagina=1&tamanhoPagina=10`;
      const resp = await requisitar(url, { timeoutMs: 15000, retries: 1 });
      const latenciaMs = Date.now() - inicio;
      if (!resp.ok) {
        return { ok: false, latenciaMs, amostraPreco: null, amostraReferencia: null, mensagem: `PNCP Atas respondeu HTTP ${resp.status}.`, dadosBrutos: null };
      }
      const body = resp.corpoJson as { totalRegistros?: number; totalPaginas?: number } | null;
      return {
        ok: true, latenciaMs, amostraPreco: null, amostraReferencia: null,
        mensagem: `PNCP Atas acessível — ${body?.totalRegistros?.toLocaleString('pt-BR')} atas disponíveis em ${latenciaMs}ms.`,
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

export function pncpAtasCacheStatus(): { itens: number; expiresAt: number | null; carregando: boolean } {
  return { itens: 0, expiresAt: null, carregando: false };
}
