import { readFile } from 'node:fs/promises';
import { lerPlanilha } from '../services/planilha/leitura.service.js';
import { montarItemNormalizado } from '../services/cotacao/normalizacao.service.js';
import { pncpAdapter } from '../services/cotacao/pncp.adapter.js';

const caminho = process.env.PLANILHA_TESTE;
if (!caminho) throw new Error('Defina PLANILHA_TESTE com o caminho da planilha .xlsx.');

const leitura = await lerPlanilha(await readFile(caminho));
const inicio = Date.now();
let cursor = 0;
let concluidos = 0;

const resultados: Array<{
  sequencia: number;
  nome: string;
  totalCotacoes: number;
  preco: number | null;
  duracaoMs: number;
  erro?: string;
}> = [];

async function processar(): Promise<void> {
  while (cursor < leitura.itens.length) {
    const indice = cursor++;
    const item = leitura.itens[indice];
    if (!item) return;
    const itemInicio = Date.now();
    const normalizado = montarItemNormalizado(item, []);
    const resultado = await pncpAdapter.consultar(normalizado, {
      limiteResultados: 3,
      fundamentacaoArtigo: '',
    } as never);
    resultados.push({
      sequencia: item.sequencia,
      nome: item.nome,
      totalCotacoes: resultado.cotacoes?.length ?? 0,
      preco: resultado.preco,
      duracaoMs: Date.now() - itemInicio,
      ...(resultado.erro ? { erro: resultado.erro } : {}),
    });
    concluidos++;
    if (concluidos % 25 === 0 || concluidos === leitura.itens.length) {
      // eslint-disable-next-line no-console
      console.log(
        `PROGRESSO ${concluidos}/${leitura.itens.length} em ${Math.round((Date.now() - inicio) / 1000)}s`,
      );
    }
  }
}

await Promise.all(Array.from({ length: 5 }, () => processar()));
resultados.sort((a, b) => a.sequencia - b.sequencia);

const cobertura = { tres: 0, duas: 0, uma: 0, zero: 0, erros: 0 };
for (const resultado of resultados) {
  if (resultado.erro) cobertura.erros++;
  if (resultado.totalCotacoes >= 3) cobertura.tres++;
  else if (resultado.totalCotacoes === 2) cobertura.duas++;
  else if (resultado.totalCotacoes === 1) cobertura.uma++;
  else cobertura.zero++;
}

// eslint-disable-next-line no-console
console.log(
  JSON.stringify(
    {
      totalItens: leitura.itens.length,
      duracaoMs: Date.now() - inicio,
      cobertura,
      percentualComTres: Math.round((cobertura.tres / leitura.itens.length) * 10000) / 100,
      semTresCotacoesAmostra: resultados.filter((r) => r.totalCotacoes < 3).slice(0, 30),
    },
    null,
    2,
  ),
);
