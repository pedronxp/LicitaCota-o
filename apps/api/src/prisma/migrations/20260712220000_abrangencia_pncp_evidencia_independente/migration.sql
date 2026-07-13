DO $$ BEGIN
  CREATE TYPE "AbrangenciaBuscaPncp" AS ENUM ('NACIONAL', 'UF', 'MUNICIPIO', 'ORGAO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SessaoBuscaOnline"
  ADD COLUMN IF NOT EXISTS "abrangenciaPncp" "AbrangenciaBuscaPncp" NOT NULL DEFAULT 'NACIONAL',
  ADD COLUMN IF NOT EXISTS "dataInicialPncp" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dataFinalPncp" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ufPncp" TEXT,
  ADD COLUMN IF NOT EXISTS "municipioPncp" TEXT,
  ADD COLUMN IF NOT EXISTS "orgaoCnpjPncp" TEXT;

ALTER TABLE "EvidenciaPreco"
  ADD COLUMN IF NOT EXISTS "independenciaChave" TEXT;

UPDATE "EvidenciaPreco"
SET "independenciaChave" = CASE
  WHEN "orgaoCnpj" IS NOT NULL
    AND "pncpAno" IS NOT NULL
    AND "pncpSequencial" IS NOT NULL
    AND "pncpNumeroItem" IS NOT NULL
    THEN CONCAT(
      'pncp:', REGEXP_REPLACE("orgaoCnpj", '\\D', '', 'g'), ':', "pncpAno", ':',
      "pncpSequencial", ':', "pncpNumeroItem", ':',
      COALESCE(NULLIF(REGEXP_REPLACE(COALESCE("fornecedorCnpj", ''), '\\D', '', 'g'), ''), 'sem-fornecedor')
    )
  WHEN "cotacaoDiretaId" IS NOT NULL THEN CONCAT('direta:', "cotacaoDiretaId")
  WHEN "cotacaoId" IS NOT NULL THEN CONCAT('cotacao:', "cotacaoId")
  ELSE CONCAT("origemChave", ':', COALESCE(NULLIF(LOWER(TRIM("referencia")), ''), "id"))
END
WHERE "independenciaChave" IS NULL OR "independenciaChave" = '';

ALTER TABLE "EvidenciaPreco"
  ALTER COLUMN "independenciaChave" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "EvidenciaPreco_itemPesquisaId_independenciaChave_idx"
  ON "EvidenciaPreco"("itemPesquisaId", "independenciaChave");
