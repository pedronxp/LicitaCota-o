-- Executada após a migration que adiciona os novos valores ao enum. Não remove
-- valores antigos nem registros, permitindo rollback operacional pelo frontend.
UPDATE "Pesquisa"
SET "status" = CASE "status"::text
  WHEN 'AGUARDANDO' THEN 'RASCUNHO'::"StatusPesquisa"
  WHEN 'PROCESSANDO' THEN 'COLETANDO'::"StatusPesquisa"
  WHEN 'CONCLUIDA' THEN 'APROVADA'::"StatusPesquisa"
  ELSE "status"
END
WHERE "status"::text IN ('AGUARDANDO', 'PROCESSANDO', 'CONCLUIDA');

-- Pesquisas migradas continuam com seus itens, cotações, arquivos e histórico.
-- A emissão de uma pesquisa anteriormente concluída criará a primeira versão.
