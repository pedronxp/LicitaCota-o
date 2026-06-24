/**
 * Script de diagnóstico PNCP — rode com: node scripts/debug-pncp.mjs
 * Mostra a estrutura real da resposta e o que o mapeamento extrai.
 */

const TERMO = 'caneta esferografica';

async function testar(label, url, listaResultados, camposPreco) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${label}]`);
  console.log(`URL: ${url}`);
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; LicitaPrecoBot/1.0)',
      },
      signal: AbortSignal.timeout(15000),
    });
    console.log(`Status: ${resp.status}`);
    const txt = await resp.text();
    let json;
    try { json = JSON.parse(txt); } catch { console.log('Resposta não é JSON:', txt.slice(0, 300)); return; }

    // Estrutura raiz
    console.log('Campos raiz:', Object.keys(json));

    // Resolve lista
    let lista = listaResultados ? json[listaResultados] : null;
    if (!Array.isArray(lista)) {
      // Tenta achar o primeiro array
      for (const [k, v] of Object.entries(json)) {
        if (Array.isArray(v)) { lista = v; console.log(`Array encontrado em: "${k}" (${v.length} itens)`); break; }
      }
    } else {
      console.log(`Lista "${listaResultados}": ${lista.length} itens`);
    }

    if (!lista || lista.length === 0) {
      console.log('NENHUM resultado na lista');
      console.log('JSON completo:', JSON.stringify(json, null, 2).slice(0, 1000));
      return;
    }

    const primeiro = lista[0];
    console.log('Campos do 1º item:', Object.keys(primeiro));

    // Tenta extrair preço
    for (const campo of camposPreco) {
      const val = campo.split('.').reduce((o, k) => o?.[k], primeiro);
      console.log(`  campo "${campo}": ${JSON.stringify(val)}`);
    }

    console.log('\n1º item completo:');
    console.log(JSON.stringify(primeiro, null, 2).slice(0, 800));
  } catch (e) {
    console.log('ERRO:', e.message);
  }
}

// Variações de endpoint a testar
await testar(
  'PNCP publicacoes (q=termo)',
  `https://pncp.gov.br/api/pncp/v1/contratacoes/publicacoes?q=${encodeURIComponent(TERMO)}&pagina=1&tamanhoPagina=5`,
  'data',
  ['valorTotalEstimado', 'valorUnitarioEstimado', 'valorUnitario', 'vlrUnitario', 'precoUnitario'],
);

await testar(
  'PNCP publicacoes (sem filtro texto, só data)',
  `https://pncp.gov.br/api/pncp/v1/contratacoes/publicacoes?dataInicial=20260601&dataFinal=20260624&pagina=1&tamanhoPagina=3`,
  'data',
  ['valorTotalEstimado', 'valorUnitarioEstimado', 'numeroControlePNCP'],
);

await testar(
  'PNCP atas publicacoes',
  `https://pncp.gov.br/api/pncp/v1/atas/publicacoes?q=${encodeURIComponent(TERMO)}&pagina=1&tamanhoPagina=5`,
  'data',
  ['valorUnitario', 'valorUnitarioEstimado', 'precoUnitario', 'vlrUnitario'],
);

console.log('\nDiagnóstico concluído.');
