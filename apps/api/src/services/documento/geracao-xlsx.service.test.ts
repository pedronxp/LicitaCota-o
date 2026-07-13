import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { gerarXlsxDoSnapshot } from './geracao-xlsx.service.js';
import type { SnapshotEmissao } from './snapshot.service.js';

const snapshot: SnapshotEmissao = {
  schemaVersion: '1.0',
  documento: {
    versao: 2,
    emitidoEm: '2026-07-12T12:00:00.000Z',
    emissor: { id: 'u1', nome: 'Aprovador', cargo: 'Compras' },
    formatos: { xlsx: true, pdf: false, motivoPdf: 'Template não aprovado.' },
  },
  processo: {
    pesquisaId: 'p1',
    titulo: 'Material de expediente',
    descricao: null,
    numeroProcesso: 'PROC-10',
    orgaoSetor: 'Compras',
    responsavelPesquisa: 'Servidor',
    municipio: 'Cidade',
    uf: 'SP',
    fundamentacaoLegal: 'Lei 14.133/2021',
  },
  metodologia: {
    metodoCalculo: 'MEDIANA',
    metaOrigensMinima: 3,
    limiteOutlierPercentual: 30,
    fontesHabilitadas: [{ slug: 'pncp', nome: 'PNCP' }],
  },
  aprovacao: {
    aprovadaEm: '2026-07-12T11:00:00.000Z',
    aprovadaPor: { id: 'u1', nome: 'Aprovador' },
  },
  resumo: {
    totalItens: 1,
    itensComCotacao: 1,
    itensSemCotacao: 0,
    itensComErro: 0,
    valorTotalEstimado: 110,
    cobertura: '1 item coberto',
  },
  buscasPncp: [
    {
      itemPesquisaId: 'i1',
      abrangencia: 'UF',
      dataInicial: '2025-07-01T00:00:00.000Z',
      dataFinal: '2026-07-01T23:59:59.999Z',
      uf: 'MG',
      municipio: null,
      orgaoCnpj: null,
      iniciadoEm: '2026-07-01T12:00:00.000Z',
    },
  ],
  itens: [
    {
      id: 'i1',
      sequencia: 1,
      nome: 'Caneta',
      descricao: 'Caneta azul',
      especificacao: 'Ponta 1mm',
      quantidade: 10,
      unidadeMedida: 'UN',
      precoReferencia: 11,
      precoTotal: 110,
      status: 'COTADO',
      observacao: null,
      justificativaCobertura: null,
      excecaoAprovadaEm: null,
      resultadoCalculo: { origensDistintas: 3, completa: true },
      evidencias: [
        {
          id: 'e1',
          tipoOrigem: 'FONTE_PUBLICA',
          origemChave: 'fonte:pncp',
          independenciaChave: 'pncp:orgao:2026:1:1:fornecedor',
          fonte: 'PNCP',
          preco: 11,
          dataReferencia: '2026-07-10T00:00:00.000Z',
          dataColeta: '2026-07-11T00:00:00.000Z',
          referencia: 'Contrato 1',
          comprovanteUrl: null,
          status: 'VALIDA',
          justificativa: null,
          fornecedor: null,
        },
        {
          id: 'e2',
          tipoOrigem: 'MANUAL',
          origemChave: 'manual:tabela',
          fonte: 'Tabela',
          preco: 1000,
          dataReferencia: '2026-07-09T00:00:00.000Z',
          dataColeta: '2026-07-11T00:00:00.000Z',
          referencia: 'Tabela antiga',
          comprovanteUrl: null,
          status: 'DESCARTADA',
          justificativa: 'Valor incompatível',
          fornecedor: null,
        },
      ],
    },
  ],
};

async function lerResumo(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return {
    abas: workbook.worksheets.map((aba) => aba.name),
    versao: workbook.getWorksheet('Itens')?.getCell('A1').value,
    identidade: workbook.getWorksheet('Quadro Comparativo')?.getCell('E3').value,
    evidenciaValida: workbook.getWorksheet('Quadro Comparativo')?.getCell('I3').value,
    evidenciaDescartada: workbook.getWorksheet('Quadro Comparativo')?.getCell('I4').value,
    metodo: workbook.getWorksheet('Metodologia')?.getCell('B9').value,
  };
}

describe('documento XLSX versionado', () => {
  it('gera quadro comparativo e relatório somente a partir do snapshot', async () => {
    const antes = JSON.stringify(snapshot);
    const arquivo = await gerarXlsxDoSnapshot(snapshot);
    expect(JSON.stringify(snapshot)).toBe(antes);
    expect(await lerResumo(arquivo)).toEqual({
      abas: [
        'Itens',
        'Quadro Comparativo',
        'Metodologia',
        'Fontes Consultadas',
        'Exceções',
        'Duplicidades',
        'Auditoria',
      ],
      versao: expect.stringContaining('Versão 2'),
      identidade: 'pncp:orgao:2026:1:1:fornecedor',
      evidenciaValida: 'Selecionada',
      evidenciaDescartada: 'DESCARTADA',
      metodo: 'MEDIANA',
    });
  });

  it('reproduz o conteúdo histórico mesmo sem consultar configuração corrente', async () => {
    const primeira = await lerResumo(await gerarXlsxDoSnapshot(snapshot));
    const configuracaoGlobalPosterior = { metodoCalculo: 'MENOR_PRECO', metaOrigensMinima: 5 };
    expect(configuracaoGlobalPosterior.metodoCalculo).not.toBe(snapshot.metodologia.metodoCalculo);
    const segunda = await lerResumo(
      await gerarXlsxDoSnapshot(JSON.parse(JSON.stringify(snapshot)) as SnapshotEmissao),
    );
    expect(segunda).toEqual(primeira);
  });
});
