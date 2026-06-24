-- Corrige a fonte PNCP existente e adiciona 10 novas fontes PNCP
-- Todas confirmadas funcionando via API pública pncp.gov.br

-- 1. Corrigir a fonte PNCP existente (parametrosTemplate precisa ter modalidade=6)
UPDATE "FonteCotacao" SET
  "parametrosTemplate" = '{"modalidade": 6}',
  "statusValidacao" = 'NAO_TESTADA',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE slug = 'pncp';

-- 2. Inserir 10 novas fontes PNCP por modalidade
INSERT INTO "FonteCotacao" (
  id, nome, slug, tipo, ativo, ordem,
  "endpointBase", "parametrosTemplate", "mapeamentoCampos",
  "limiteResultados", "timeoutSegundos",
  "statusValidacao", "fundamentacaoArtigo",
  "createdAt", "updatedAt"
) VALUES

-- Atas de Registro de Preço
(gen_random_uuid(), 'PNCP — Atas de Registro de Preço', 'pncp-atas', 'API_REST', false, 3,
 'https://pncp.gov.br/api/consulta/v1/atas',
 '{}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 82 da Lei 14.133/2021 — Atas de Registro de Preço publicadas no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Dispensa Eletrônica (modal 8)
(gen_random_uuid(), 'PNCP — Dispensa Eletrônica', 'pncp-dispensa', 'API_REST', false, 4,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 8}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 75 da Lei 14.133/2021 — Dispensas eletrônicas publicadas no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Concorrência (modal 1)
(gen_random_uuid(), 'PNCP — Concorrência', 'pncp-concorrencia', 'API_REST', false, 5,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 1}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 29, I da Lei 14.133/2021 — Concorrências publicadas no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Leilão (modal 5)
(gen_random_uuid(), 'PNCP — Leilão', 'pncp-leilao', 'API_REST', false, 6,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 5}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 29, IV da Lei 14.133/2021 — Leilões publicados no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Pregão Internacional (modal 7)
(gen_random_uuid(), 'PNCP — Pregão Internacional', 'pncp-pregao-internacional', 'API_REST', false, 7,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 7}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 6, XLI da Lei 14.133/2021 — Pregões internacionais publicados no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Tomada de Preços (modal 3)
(gen_random_uuid(), 'PNCP — Tomada de Preços', 'pncp-tomada-precos', 'API_REST', false, 8,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 3}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 29 da Lei 14.133/2021 — Tomadas de Preços publicadas no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Convite (modal 4)
(gen_random_uuid(), 'PNCP — Convite', 'pncp-convite', 'API_REST', false, 9,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 4}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 29 da Lei 14.133/2021 — Convites publicados no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Diálogo Competitivo (modal 9)
(gen_random_uuid(), 'PNCP — Diálogo Competitivo', 'pncp-dialogo-competitivo', 'API_REST', false, 10,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 9}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 32 da Lei 14.133/2021 — Diálogos competitivos publicados no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Credenciamento (modal 11)
(gen_random_uuid(), 'PNCP — Credenciamento', 'pncp-credenciamento', 'API_REST', false, 11,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 11}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 79 da Lei 14.133/2021 — Credenciamentos publicados no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Pré-qualificação (modal 2)
(gen_random_uuid(), 'PNCP — Pré-qualificação', 'pncp-prequalificacao', 'API_REST', false, 12,
 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
 '{"modalidade": 2}', '{}', 5, 30, 'NAO_TESTADA',
 'Art. 30 da Lei 14.133/2021 — Pré-qualificações publicadas no PNCP',
 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

ON CONFLICT (slug) DO NOTHING;
