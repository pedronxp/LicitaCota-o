ALTER TYPE "StatusPesquisa" ADD VALUE IF NOT EXISTS 'RASCUNHO';
ALTER TYPE "StatusPesquisa" ADD VALUE IF NOT EXISTS 'COLETANDO';
ALTER TYPE "StatusPesquisa" ADD VALUE IF NOT EXISTS 'EM_REVISAO';
ALTER TYPE "StatusPesquisa" ADD VALUE IF NOT EXISTS 'APROVADA';
ALTER TYPE "StatusPesquisa" ADD VALUE IF NOT EXISTS 'EMITIDA';

DO $$ BEGIN
  CREATE TYPE "ModoEntradaPesquisa" AS ENUM ('MANUAL', 'PLANILHA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoOrigemEvidencia" AS ENUM ('FONTE_PUBLICA', 'FORNECEDOR', 'TABELA_REFERENCIA', 'HISTORICO_INTERNO', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusEvidencia" AS ENUM ('PENDENTE', 'VALIDA', 'DESCARTADA', 'INVALIDA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusSessaoBusca" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'ERRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Pesquisa"
  ADD COLUMN IF NOT EXISTS "modoEntrada" "ModoEntradaPesquisa" NOT NULL DEFAULT 'PLANILHA',
  ADD COLUMN IF NOT EXISTS "numeroProcesso" TEXT,
  ADD COLUMN IF NOT EXISTS "orgaoSetor" TEXT,
  ADD COLUMN IF NOT EXISTS "responsavelPesquisa" TEXT,
  ADD COLUMN IF NOT EXISTS "metodoCalculoSnapshot" "MetodoCalculo",
  ADD COLUMN IF NOT EXISTS "metaOrigensMinima" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "limiteOutlierSnapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "fontesSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "aprovadaPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "aprovadaEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emitidaEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "versaoAtual" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ItemPesquisa"
  ADD COLUMN IF NOT EXISTS "especificacao" TEXT,
  ADD COLUMN IF NOT EXISTS "resultadoCalculo" JSONB,
  ADD COLUMN IF NOT EXISTS "justificativaCobertura" TEXT,
  ADD COLUMN IF NOT EXISTS "excecaoAprovadaPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "excecaoAprovadaEm" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "EvidenciaPreco" (
  "id" TEXT NOT NULL,
  "itemPesquisaId" TEXT NOT NULL,
  "tipoOrigem" "TipoOrigemEvidencia" NOT NULL,
  "origemChave" TEXT NOT NULL,
  "fonte" TEXT,
  "cotacaoId" TEXT,
  "cotacaoDiretaId" TEXT,
  "chaveDedupe" TEXT,
  "preco" DECIMAL(18,4) NOT NULL,
  "dataReferencia" TIMESTAMP(3),
  "dataColeta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referencia" TEXT,
  "comprovanteUrl" TEXT,
  "dadosBrutos" JSONB,
  "status" "StatusEvidencia" NOT NULL DEFAULT 'PENDENTE',
  "justificativa" TEXT,
  "criadoPorId" TEXT,
  "revisadoPorId" TEXT,
  "revisadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenciaPreco_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoPesquisa" (
  "id" TEXT NOT NULL,
  "pesquisaId" TEXT NOT NULL,
  "versao" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "arquivoXlsxUrl" TEXT,
  "arquivoPdfUrl" TEXT,
  "emitidoPorId" TEXT,
  "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentoPesquisa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessaoBuscaOnline" (
  "id" TEXT NOT NULL,
  "pesquisaId" TEXT NOT NULL,
  "itemPesquisaId" TEXT NOT NULL,
  "termo" TEXT NOT NULL,
  "fontes" JSONB NOT NULL,
  "resultados" JSONB,
  "erros" JSONB,
  "status" "StatusSessaoBusca" NOT NULL DEFAULT 'PENDENTE',
  "criadoPorId" TEXT,
  "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluidoEm" TIMESTAMP(3),
  CONSTRAINT "SessaoBuscaOnline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EvidenciaPreco_chaveDedupe_key" ON "EvidenciaPreco"("chaveDedupe");
CREATE INDEX IF NOT EXISTS "EvidenciaPreco_itemPesquisaId_status_idx" ON "EvidenciaPreco"("itemPesquisaId", "status");
CREATE INDEX IF NOT EXISTS "EvidenciaPreco_itemPesquisaId_origemChave_idx" ON "EvidenciaPreco"("itemPesquisaId", "origemChave");
CREATE INDEX IF NOT EXISTS "EvidenciaPreco_cotacaoId_idx" ON "EvidenciaPreco"("cotacaoId");
CREATE INDEX IF NOT EXISTS "EvidenciaPreco_cotacaoDiretaId_idx" ON "EvidenciaPreco"("cotacaoDiretaId");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoPesquisa_pesquisaId_versao_key" ON "DocumentoPesquisa"("pesquisaId", "versao");
CREATE INDEX IF NOT EXISTS "DocumentoPesquisa_pesquisaId_emitidoEm_idx" ON "DocumentoPesquisa"("pesquisaId", "emitidoEm");
CREATE INDEX IF NOT EXISTS "SessaoBuscaOnline_pesquisaId_iniciadoEm_idx" ON "SessaoBuscaOnline"("pesquisaId", "iniciadoEm");
CREATE INDEX IF NOT EXISTS "SessaoBuscaOnline_itemPesquisaId_iniciadoEm_idx" ON "SessaoBuscaOnline"("itemPesquisaId", "iniciadoEm");
CREATE INDEX IF NOT EXISTS "SessaoBuscaOnline_status_idx" ON "SessaoBuscaOnline"("status");
CREATE INDEX IF NOT EXISTS "ItemPesquisa_excecaoAprovadaPorId_idx" ON "ItemPesquisa"("excecaoAprovadaPorId");

DO $$ BEGIN
  ALTER TABLE "Pesquisa" ADD CONSTRAINT "Pesquisa_aprovadaPorId_fkey" FOREIGN KEY ("aprovadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ItemPesquisa" ADD CONSTRAINT "ItemPesquisa_excecaoAprovadaPorId_fkey" FOREIGN KEY ("excecaoAprovadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EvidenciaPreco" ADD CONSTRAINT "EvidenciaPreco_itemPesquisaId_fkey" FOREIGN KEY ("itemPesquisaId") REFERENCES "ItemPesquisa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "EvidenciaPreco" ADD CONSTRAINT "EvidenciaPreco_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "EvidenciaPreco" ADD CONSTRAINT "EvidenciaPreco_cotacaoDiretaId_fkey" FOREIGN KEY ("cotacaoDiretaId") REFERENCES "CotacaoDireta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "EvidenciaPreco" ADD CONSTRAINT "EvidenciaPreco_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "EvidenciaPreco" ADD CONSTRAINT "EvidenciaPreco_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoPesquisa" ADD CONSTRAINT "DocumentoPesquisa_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "Pesquisa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "DocumentoPesquisa" ADD CONSTRAINT "DocumentoPesquisa_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SessaoBuscaOnline" ADD CONSTRAINT "SessaoBuscaOnline_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "Pesquisa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "SessaoBuscaOnline" ADD CONSTRAINT "SessaoBuscaOnline_itemPesquisaId_fkey" FOREIGN KEY ("itemPesquisaId") REFERENCES "ItemPesquisa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "SessaoBuscaOnline" ADD CONSTRAINT "SessaoBuscaOnline_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
