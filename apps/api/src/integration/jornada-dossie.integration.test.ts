import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizarChave } from '../utils/texto.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
const describeComBanco = databaseUrl ? describe : describe.skip;

describeComBanco('jornadas integradas do dossiê', () => {
  const prisma = new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);
  const sufixo = randomUUID();
  const termoCatalogo = `caneta integracao ${sufixo}`;
  const nomeCatalogo = normalizarChave(termoCatalogo);
  let usuarioId: string;
  let pesquisaId: string;
  let itemId: string;
  let fornecedorId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const usuario = await prisma.user.create({
      data: { email: `integracao-${sufixo}@teste.local`, nome: 'Teste Integração', role: 'ADMIN' },
    });
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    if (pesquisaId) await prisma.pesquisa.deleteMany({ where: { id: pesquisaId } });
    if (fornecedorId) await prisma.fornecedor.deleteMany({ where: { id: fornecedorId } });
    await prisma.itemCatalogo.deleteMany({ where: { nomeNormalizado: nomeCatalogo } });
    if (usuarioId) await prisma.user.deleteMany({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  it('percorre cadastro manual, sugestão, coleta, revisão, aprovação e emissão', async () => {
    const { buscarSugestoesCatalogo } = await import('../services/catalogo/catalogo.service.js');
    const { recalcularItemECobertura } = await import('../services/cotacao/recalculo.service.js');
    const { transicionarPesquisa } = await import('../services/pesquisa/ciclo-vida.service.js');
    const { emitirDocumentoPesquisa } = await import('../services/documento/emissao.service.js');

    const pesquisa = await prisma.pesquisa.create({
      data: {
        titulo: 'Jornada integrada',
        status: 'RASCUNHO',
        userId: usuarioId,
        modoEntrada: 'MANUAL',
        metodoCalculoSnapshot: 'MEDIANA',
        metaOrigensMinima: 3,
        limiteOutlierSnapshot: 30,
        totalItens: 1,
      },
    });
    pesquisaId = pesquisa.id;
    await prisma.itemCatalogo.create({
      data: {
        nomeNormalizado: nomeCatalogo,
        descricaoPadrao: 'Caneta azul ponta média',
        unidadeMedida: 'UN',
        vezesUsado: 2,
      },
    });
    expect((await buscarSugestoesCatalogo(termoCatalogo, 5)).length).toBeGreaterThan(0);

    const item = await prisma.itemPesquisa.create({
      data: {
        pesquisaId,
        sequencia: 1,
        nome: 'Caneta',
        descricao: 'Caneta azul ponta média',
        quantidade: 10,
        unidadeMedida: 'UN',
      },
    });
    itemId = item.id;
    for (const [indice, preco] of [10, 11, 12].entries())
      await prisma.evidenciaPreco.create({
        data: {
          itemPesquisaId: item.id,
          tipoOrigem:
            indice === 0 ? 'FONTE_PUBLICA' : indice === 1 ? 'TABELA_REFERENCIA' : 'MANUAL',
          origemChave: `integracao:${sufixo}:${indice}`,
          independenciaChave: `integracao:${sufixo}:${indice}`,
          fonte: `Origem ${indice + 1}`,
          preco,
          dataReferencia: new Date(),
          referencia: `Referência ${indice + 1}`,
          status: 'VALIDA',
          criadoPorId: usuarioId,
          revisadoPorId: usuarioId,
          revisadoEm: new Date(),
        },
      });
    await recalcularItemECobertura(item.id);
    await transicionarPesquisa({
      pesquisaId,
      estadoAtual: 'RASCUNHO',
      destino: 'COLETANDO',
      userId: usuarioId,
      motivo: 'Teste integrado',
    });
    await transicionarPesquisa({
      pesquisaId,
      estadoAtual: 'COLETANDO',
      destino: 'EM_REVISAO',
      userId: usuarioId,
      motivo: 'Teste integrado',
    });
    await transicionarPesquisa({
      pesquisaId,
      estadoAtual: 'EM_REVISAO',
      destino: 'APROVADA',
      userId: usuarioId,
      motivo: 'Teste integrado',
    });
    await prisma.pesquisa.update({
      where: { id: pesquisaId },
      data: { aprovadaPorId: usuarioId, aprovadaEm: new Date() },
    });
    const documento = await emitirDocumentoPesquisa({ pesquisaId, usuarioId });
    expect(documento.versao).toBe(1);
    expect(documento.arquivoXlsxUrl).toContain('.xlsx');
    expect((await prisma.pesquisa.findUnique({ where: { id: pesquisaId } }))?.status).toBe(
      'EMITIDA',
    );
  });

  it('preserva o contrato legado de planilha e vincula resposta direta a evidência', async () => {
    const { schemaConfirmacaoLegada } =
      await import('../services/planilha/compatibilidade-legado.service.js');
    const { sincronizarEvidenciaCotacaoDireta } =
      await import('../services/cotacao/evidencia.service.js');
    expect(
      schemaConfirmacaoLegada.parse({
        itens: [{ sequencia: 1, nome: 'Caneta', descricao: '', quantidade: 1 }],
      }).itens,
    ).toHaveLength(1);

    const fornecedor = await prisma.fornecedor.create({
      data: {
        razaoSocial: 'Fornecedor Integração',
        cnpj: `${Date.now()}`.padStart(14, '0').slice(-14),
      },
    });
    fornecedorId = fornecedor.id;
    const direta = await prisma.cotacaoDireta.create({
      data: {
        itemPesquisaId: itemId,
        fornecedorId,
        preco: 10.5,
        justificativa: 'Teste de regressão',
        status: 'RESPONDIDA',
        dataResposta: new Date(),
        anexoRespostaUrl: '/api/arquivos/comprovante-teste.pdf',
      },
    });
    await sincronizarEvidenciaCotacaoDireta(direta, usuarioId);
    const evidencia = await prisma.evidenciaPreco.findUnique({
      where: { chaveDedupe: `cotacao-direta:${direta.id}` },
    });
    expect(evidencia).toMatchObject({
      tipoOrigem: 'FORNECEDOR',
      cotacaoDiretaId: direta.id,
      status: 'PENDENTE',
    });
  });
});
