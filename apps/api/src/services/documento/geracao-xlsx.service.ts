import ExcelJS from 'exceljs';
import type { SnapshotEmissao } from './snapshot.service.js';

const COR_AZUL = 'FF1F3864';
const COR_CABECALHO = 'FF2E75B6';
const COR_BRANCO = 'FFFFFFFF';
const COR_DESTAQUE = 'FFFCE4C8';
const MOEDA = 'R$ #,##0.00';

function tituloAba(planilha: ExcelJS.Worksheet, texto: string, totalColunas: number): void {
  planilha.mergeCells(1, 1, 1, totalColunas);
  const celula = planilha.getCell(1, 1);
  celula.value = texto;
  celula.font = { bold: true, color: { argb: COR_BRANCO }, size: 12 };
  celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_AZUL } };
  celula.alignment = { vertical: 'middle', wrapText: true };
  planilha.getRow(1).height = 32;
}

function cabecalho(planilha: ExcelJS.Worksheet, linha: number, titulos: string[]): void {
  const row = planilha.getRow(linha);
  titulos.forEach((titulo, indice) => {
    const celula = row.getCell(indice + 1);
    celula.value = titulo;
    celula.font = { bold: true, color: { argb: COR_BRANCO }, size: 9 };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
    celula.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

export async function gerarXlsxDoSnapshot(snapshot: SnapshotEmissao): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LicitaPreço';
  workbook.created = new Date(snapshot.documento.emitidoEm);
  workbook.modified = new Date(snapshot.documento.emitidoEm);
  workbook.subject = `Dossiê ${snapshot.processo.pesquisaId} - versão ${snapshot.documento.versao}`;

  const itens = workbook.addWorksheet('Itens', { views: [{ state: 'frozen', ySplit: 2 }] });
  tituloAba(
    itens,
    `DOSSIÊ DE PESQUISA DE PREÇOS | Versão ${snapshot.documento.versao} | ${snapshot.processo.titulo}`,
    10,
  );
  cabecalho(itens, 2, [
    'Nº',
    'Item',
    'Especificação',
    'Unidade',
    'Quantidade',
    'Evidências independentes',
    'Meta',
    'Preço de referência',
    'Preço total',
    'Situação',
  ]);
  [6, 34, 34, 12, 12, 14, 10, 18, 18, 20].forEach((largura, indice) => {
    itens.getColumn(indice + 1).width = largura;
  });
  snapshot.itens.forEach((item, indice) => {
    const calculo = item.resultadoCalculo as {
      evidenciasIndependentes?: number;
      origensDistintas?: number;
      completa?: boolean;
    } | null;
    const row = itens.getRow(indice + 3);
    row.values = [
      item.sequencia,
      item.descricao || item.nome,
      item.especificacao ?? '',
      item.unidadeMedida ?? '',
      item.quantidade,
      calculo?.evidenciasIndependentes ?? calculo?.origensDistintas ?? 0,
      snapshot.metodologia.metaOrigensMinima,
      item.precoReferencia,
      item.precoTotal,
      calculo?.completa
        ? 'Cobertura atendida'
        : item.justificativaCobertura
          ? 'Exceção justificada'
          : 'Pendente',
    ];
    row.getCell(8).numFmt = MOEDA;
    row.getCell(9).numFmt = MOEDA;
    if (!calculo?.completa)
      row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_DESTAQUE } };
  });

  const quadro = workbook.addWorksheet('Quadro Comparativo', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });
  tituloAba(quadro, `QUADRO COMPARATIVO DE EVIDÊNCIAS | Versão ${snapshot.documento.versao}`, 12);
  cabecalho(quadro, 2, [
    'Item',
    'Descrição',
    'Tipo de origem',
    'Origem tecnológica',
    'Identidade independente',
    'Fornecedor',
    'Data de referência',
    'Referência',
    'Seleção',
    'Justificativa',
    'Preço evidenciado',
    'Preço de referência',
  ]);
  [8, 34, 18, 22, 38, 28, 16, 38, 14, 30, 18, 18].forEach((largura, indice) => {
    quadro.getColumn(indice + 1).width = largura;
  });
  let linha = 3;
  for (const item of snapshot.itens) {
    for (const evidencia of item.evidencias) {
      const row = quadro.getRow(linha++);
      row.values = [
        item.sequencia,
        item.descricao || item.nome,
        evidencia.tipoOrigem,
        evidencia.fonte ?? evidencia.origemChave,
        evidencia.independenciaChave ?? evidencia.origemChave,
        evidencia.fornecedor
          ? `${evidencia.fornecedor.razaoSocial} - ${evidencia.fornecedor.cnpj}`
          : (evidencia.fornecedorNome ?? ''),
        evidencia.dataReferencia
          ? new Date(evidencia.dataReferencia).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
          : '',
        evidencia.referencia ?? evidencia.comprovanteUrl ?? '',
        evidencia.status === 'VALIDA' ? 'Selecionada' : evidencia.status,
        evidencia.justificativa ?? '',
        evidencia.preco,
        item.precoReferencia,
      ];
      row.getCell(11).numFmt = MOEDA;
      row.getCell(12).numFmt = MOEDA;
      if (evidencia.status === 'VALIDA') row.getCell(9).font = { bold: true };
      row.alignment = { vertical: 'top', wrapText: true };
    }
  }

  const metodo = workbook.addWorksheet('Metodologia');
  metodo.getColumn(1).width = 32;
  metodo.getColumn(2).width = 100;
  tituloAba(metodo, `RELATÓRIO METODOLÓGICO | Versão ${snapshot.documento.versao}`, 2);
  const fontes = Array.isArray(snapshot.metodologia.fontesHabilitadas)
    ? snapshot.metodologia.fontesHabilitadas
    : [];
  const linhas: Array<[string, string | number]> = [
    ['Identificador', `${snapshot.processo.pesquisaId}/v${snapshot.documento.versao}`],
    ['Emitido em', new Date(snapshot.documento.emitidoEm).toLocaleString('pt-BR')],
    ['Emitido por', snapshot.documento.emissor.nome],
    ['Processo', snapshot.processo.numeroProcesso ?? 'Não informado'],
    ['Órgão/Setor', snapshot.processo.orgaoSetor ?? 'Não informado'],
    ['Responsável', snapshot.processo.responsavelPesquisa ?? 'Não informado'],
    ['Método de cálculo', snapshot.metodologia.metodoCalculo],
    ['Meta de evidências independentes', snapshot.metodologia.metaOrigensMinima],
    ['Limite de outlier (%)', snapshot.metodologia.limiteOutlierPercentual ?? 'Não configurado'],
    [
      'Fontes habilitadas no snapshot',
      fontes
        .map(
          (fonte) =>
            (fonte as { nome?: string; slug?: string }).nome ?? (fonte as { slug?: string }).slug,
        )
        .filter(Boolean)
        .join(', ') || 'Não informadas',
    ],
    ['Cobertura consolidada', snapshot.resumo.cobertura ?? 'Não informada'],
    [
      'Fundamentação legal',
      snapshot.processo.fundamentacaoLegal ?? 'Lei 14.133/2021 e regulamentação aplicável do órgão',
    ],
    ['Formato PDF', snapshot.documento.formatos.motivoPdf],
  ];
  snapshot.itens
    .filter((item) => item.justificativaCobertura)
    .forEach((item) =>
      linhas.push([`Exceção - item ${item.sequencia}`, item.justificativaCobertura!]),
    );
  (snapshot.buscasPncp ?? []).forEach((busca, indice) =>
    linhas.push([
      `Busca PNCP ${indice + 1}`,
      `${busca.abrangencia} | ${busca.uf ?? ''} ${busca.municipio ?? ''} ${busca.orgaoCnpj ?? ''} | ${busca.dataInicial?.slice(0, 10) ?? '?'} a ${busca.dataFinal?.slice(0, 10) ?? '?'}`
        .replace(/\s+/g, ' ')
        .trim(),
    ]),
  );
  linhas.forEach(([rotulo, valor], indice) => {
    const row = metodo.getRow(indice + 3);
    row.getCell(1).value = rotulo;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = valor;
    row.alignment = { vertical: 'top', wrapText: true };
  });

  const fontesRelatorio = workbook.addWorksheet('Fontes Consultadas');
  cabecalho(fontesRelatorio, 1, [
    'Fonte',
    'Identidade independente',
    'Órgão',
    'CNPJ do órgão',
    'Fornecedor',
    'CNPJ fornecedor',
    'Referência',
    'Data',
    'Tipo de preço',
    'Seleção',
  ]);
  let linhaFonte = 2;
  for (const item of snapshot.itens)
    for (const evidencia of item.evidencias) {
      const row = fontesRelatorio.getRow(linhaFonte++);
      row.values = [
        evidencia.fonte ?? evidencia.tipoOrigem,
        evidencia.independenciaChave ?? evidencia.origemChave,
        evidencia.orgaoNome ?? '',
        evidencia.orgaoCnpj ?? '',
        evidencia.fornecedorNome ?? evidencia.fornecedor?.razaoSocial ?? '',
        evidencia.fornecedorCnpj ?? evidencia.fornecedor?.cnpj ?? '',
        evidencia.referencia ?? '',
        evidencia.dataReferencia
          ? new Date(evidencia.dataReferencia).toLocaleDateString('pt-BR')
          : '',
        evidencia.tipoPreco ?? '',
        evidencia.status === 'VALIDA' ? 'Selecionada' : evidencia.status,
      ];
    }
  [20, 38, 30, 18, 30, 18, 45, 14, 16, 16].forEach((largura, indice) => {
    fontesRelatorio.getColumn(indice + 1).width = largura;
  });

  const excecoes = workbook.addWorksheet('Exceções');
  cabecalho(excecoes, 1, [
    'Item',
    'Descrição',
    'Cobertura',
    'Meta',
    'Justificativa',
    'Aprovação da exceção',
  ]);
  snapshot.itens
    .filter(
      (item) =>
        item.justificativaCobertura ||
        !(item.resultadoCalculo as { completa?: boolean } | null)?.completa,
    )
    .forEach((item, indice) => {
      const calculo = item.resultadoCalculo as { origensDistintas?: number } | null;
      excecoes.getRow(indice + 2).values = [
        item.sequencia,
        item.descricao,
        calculo?.origensDistintas ?? 0,
        snapshot.metodologia.metaOrigensMinima,
        item.justificativaCobertura ?? 'Pendente',
        item.excecaoAprovadaEm ?? 'Não aprovada',
      ];
    });
  [8, 45, 12, 10, 60, 22].forEach((largura, indice) => {
    excecoes.getColumn(indice + 1).width = largura;
  });

  const duplicidades = workbook.addWorksheet('Duplicidades');
  cabecalho(duplicidades, 1, ['Item', 'Descrição', 'Origem', 'Referência', 'Preço', 'Situação']);
  let linhaDuplicidade = 2;
  for (const item of snapshot.itens)
    for (const evidencia of item.evidencias.filter((registro) => registro.possivelDuplicidade)) {
      const row = duplicidades.getRow(linhaDuplicidade++);
      row.values = [
        item.sequencia,
        item.descricao,
        evidencia.origemChave,
        evidencia.referencia ?? '',
        evidencia.preco,
        evidencia.status,
      ];
      row.getCell(5).numFmt = MOEDA;
    }
  [8, 45, 25, 50, 18, 16].forEach((largura, indice) => {
    duplicidades.getColumn(indice + 1).width = largura;
  });

  const auditoria = workbook.addWorksheet('Auditoria');
  cabecalho(auditoria, 1, ['Data e hora', 'Ação', 'Usuário', 'Detalhe']);
  (snapshot.auditoria ?? []).forEach((registro, indice) => {
    auditoria.getRow(indice + 2).values = [
      new Date(registro.em).toLocaleString('pt-BR'),
      registro.acao,
      registro.usuario ?? '',
      registro.detalhe ? JSON.stringify(registro.detalhe) : '',
    ];
  });
  [22, 30, 25, 100].forEach((largura, indice) => {
    auditoria.getColumn(indice + 1).width = largura;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
