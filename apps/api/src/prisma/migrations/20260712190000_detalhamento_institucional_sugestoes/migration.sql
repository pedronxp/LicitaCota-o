DO $$ BEGIN
  CREATE TYPE "TipoSugestaoMelhoria" AS ENUM ('SUGESTAO', 'ERRO', 'DIFICULDADE', 'NOVA_FUNCIONALIDADE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PrioridadeSugestao" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "StatusSugestao" AS ENUM ('RECEBIDA', 'EM_ANALISE', 'PLANEJADA', 'EM_DESENVOLVIMENTO', 'CONCLUIDA', 'RECUSADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Pesquisa"
  ADD COLUMN IF NOT EXISTS "secretariaSolicitante" TEXT,
  ADD COLUMN IF NOT EXISTS "unidadeAdministrativa" TEXT,
  ADD COLUMN IF NOT EXISTS "responsavelRevisao" TEXT,
  ADD COLUMN IF NOT EXISTS "responsavelAprovacao" TEXT,
  ADD COLUMN IF NOT EXISTS "exercicioFinanceiro" INTEGER,
  ADD COLUMN IF NOT EXISTS "modalidade" TEXT,
  ADD COLUMN IF NOT EXISTS "prazoDesejado" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dotacaoOrcamentaria" TEXT,
  ADD COLUMN IF NOT EXISTS "observacoesGerais" TEXT,
  ADD COLUMN IF NOT EXISTS "dadosProcesso" JSONB;

ALTER TABLE "ItemPesquisa"
  ADD COLUMN IF NOT EXISTS "marcaModelo" TEXT,
  ADD COLUMN IF NOT EXISTS "localEntrega" TEXT,
  ADD COLUMN IF NOT EXISTS "prazoEntregaDias" INTEGER,
  ADD COLUMN IF NOT EXISTS "garantia" TEXT,
  ADD COLUMN IF NOT EXISTS "caracteristicasObrigatorias" TEXT,
  ADD COLUMN IF NOT EXISTS "caracteristicasDesejaveis" TEXT,
  ADD COLUMN IF NOT EXISTS "anexos" JSONB;

ALTER TABLE "EvidenciaPreco"
  ADD COLUMN IF NOT EXISTS "possivelDuplicidade" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "orgaoCnpj" TEXT,
  ADD COLUMN IF NOT EXISTS "orgaoNome" TEXT,
  ADD COLUMN IF NOT EXISTS "pncpAno" INTEGER,
  ADD COLUMN IF NOT EXISTS "pncpSequencial" INTEGER,
  ADD COLUMN IF NOT EXISTS "pncpNumeroItem" INTEGER,
  ADD COLUMN IF NOT EXISTS "fornecedorCnpj" TEXT,
  ADD COLUMN IF NOT EXISTS "fornecedorNome" TEXT,
  ADD COLUMN IF NOT EXISTS "tipoPreco" TEXT,
  ADD COLUMN IF NOT EXISTS "unidadeOriginal" TEXT,
  ADD COLUMN IF NOT EXISTS "descricaoOriginal" TEXT;

ALTER TABLE "ConfiguracaoSistema"
  ADD COLUMN IF NOT EXISTS "secretarias" JSONB,
  ADD COLUMN IF NOT EXISTS "setores" JSONB,
  ADD COLUMN IF NOT EXISTS "textosAjuda" JSONB,
  ADD COLUMN IF NOT EXISTS "camposConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "templatesRelatorio" JSONB,
  ADD COLUMN IF NOT EXISTS "janelaBuscaDias" INTEGER NOT NULL DEFAULT 365;
ALTER TABLE "ConfiguracaoSistema" ALTER COLUMN "metodoCalculo" SET DEFAULT 'MENOR_PRECO';
ALTER TABLE "ConfiguracaoSistema" ALTER COLUMN "minFontesCompleta" SET DEFAULT 3;
UPDATE "ConfiguracaoSistema"
SET "nomeOrgao" = COALESCE("nomeOrgao", 'Prefeitura Municipal de Cataguases'),
    "municipio" = COALESCE("municipio", 'Cataguases'),
    "uf" = COALESCE("uf", 'MG'),
    "metodoCalculo" = CASE WHEN "metodoCalculo" = 'MEDIA' THEN 'MENOR_PRECO'::"MetodoCalculo" ELSE "metodoCalculo" END,
    "minFontesCompleta" = GREATEST("minFontesCompleta", 3)
WHERE "id" = 'singleton';

CREATE TABLE IF NOT EXISTS "SugestaoMelhoria" (
  "id" TEXT NOT NULL,
  "tipo" "TipoSugestaoMelhoria" NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "tela" TEXT,
  "prioridade" "PrioridadeSugestao" NOT NULL DEFAULT 'MEDIA',
  "status" "StatusSugestao" NOT NULL DEFAULT 'RECEBIDA',
  "anexoUrl" TEXT,
  "autorId" TEXT,
  "responsavelId" TEXT,
  "comentarioInterno" TEXT,
  "historico" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SugestaoMelhoria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SugestaoMelhoria_status_prioridade_idx" ON "SugestaoMelhoria"("status", "prioridade");
CREATE INDEX IF NOT EXISTS "SugestaoMelhoria_autorId_idx" ON "SugestaoMelhoria"("autorId");
CREATE INDEX IF NOT EXISTS "SugestaoMelhoria_responsavelId_idx" ON "SugestaoMelhoria"("responsavelId");
DO $$ BEGIN
  ALTER TABLE "SugestaoMelhoria" ADD CONSTRAINT "SugestaoMelhoria_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SugestaoMelhoria" ADD CONSTRAINT "SugestaoMelhoria_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
