import { prisma } from '../../config/prisma.js';
import { normalizarChave } from '../../utils/texto.js';

export interface SugestaoItemCatalogo {
  id: string | null;
  nome: string;
  descricaoPadrao: string;
  unidadeMedida: string | null;
  vezesUsado: number;
  ultimoPrecoReferencia: number | null;
  ultimaDataReferencia: Date | null;
  origem: 'CATALOGO' | 'HISTORICO';
  score: number;
}

export function pontuarSugestao(busca: string, nome: string, vezesUsado: number): number {
  const termo = normalizarChave(busca);
  const candidato = normalizarChave(nome);
  if (!termo || !candidato) return 0;
  let score = 0;
  if (candidato === termo) score += 100;
  else if (candidato.startsWith(termo)) score += 70;
  else if (candidato.includes(termo)) score += 45;
  const termosBusca = new Set(termo.split(' ').filter((token) => token.length >= 2));
  const termosCandidato = new Set(candidato.split(' '));
  const comuns = [...termosBusca].filter((token) => termosCandidato.has(token)).length;
  score += termosBusca.size > 0 ? (comuns / termosBusca.size) * 30 : 0;
  if (score === 0) return 0;
  score += Math.min(15, Math.log2(vezesUsado + 1) * 3);
  return Math.round(score * 100) / 100;
}

export async function buscarSugestoesCatalogo(
  termo: string,
  limite = 10,
): Promise<SugestaoItemCatalogo[]> {
  const busca = normalizarChave(termo);
  const candidatos = await prisma.itemCatalogo.findMany({
    where: {
      OR: [
        { nomeNormalizado: { contains: busca } },
        { descricaoPadrao: { contains: termo, mode: 'insensitive' } },
      ],
    },
    take: limite * 4,
    orderBy: [{ vezesUsado: 'desc' }, { ultimaDataReferencia: 'desc' }],
  });

  if (candidatos.length > 0) {
    return candidatos
      .map((item) => ({
        id: item.id,
        nome: item.nomeNormalizado,
        descricaoPadrao: item.descricaoPadrao,
        unidadeMedida: item.unidadeMedida,
        vezesUsado: item.vezesUsado,
        ultimoPrecoReferencia: item.ultimoPrecoReferencia
          ? Number(item.ultimoPrecoReferencia)
          : null,
        ultimaDataReferencia: item.ultimaDataReferencia,
        origem: 'CATALOGO' as const,
        score: pontuarSugestao(
          busca,
          `${item.nomeNormalizado} ${item.descricaoPadrao}`,
          item.vezesUsado,
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.vezesUsado - a.vezesUsado)
      .slice(0, limite);
  }

  const historicos = await prisma.historicoPreco.findMany({
    where: { itemNome: { contains: busca } },
    orderBy: { dataReferencia: 'desc' },
    take: limite * 5,
  });
  const unicos = new Map<string, (typeof historicos)[number]>();
  for (const historico of historicos) {
    if (!unicos.has(historico.itemNome)) unicos.set(historico.itemNome, historico);
  }
  return [...unicos.values()].slice(0, limite).map((historico) => ({
    id: null,
    nome: historico.itemNome,
    descricaoPadrao: historico.itemNome,
    unidadeMedida: null,
    vezesUsado: 0,
    ultimoPrecoReferencia: Number(historico.preco),
    ultimaDataReferencia: historico.dataReferencia,
    origem: 'HISTORICO' as const,
    score: pontuarSugestao(busca, historico.itemNome, 0),
  }));
}
