# Migration de abrangência PNCP e evidências independentes

## Validação

Validada em 12/07/2026 sobre a cópia de schema `migration_validation_20260712`: as oito migrations anteriores foram tratadas como baseline e `20260712220000_abrangencia_pncp_evidencia_independente` foi aplicada com sucesso; `prisma migrate status` confirmou o schema atualizado.

1. Restaurar uma cópia sanitizada do banco de desenvolvimento.
2. Executar `pnpm --filter @licitapreco/api prisma:deploy`.
3. Confirmar que toda `EvidenciaPreco` possui `independenciaChave` não vazia.
4. Executar `pnpm --filter @licitapreco/api backfill:evidencias` duas vezes e confirmar idempotência.
5. Validar pesquisas antigas, buscas novas e emissão de XLSX.

## Rollback operacional

- Desativar o workspace novo pela configuração de rollout e voltar a exibir o fluxo legado.
- Não remover as colunas novas nem as chaves preenchidas.
- A API antiga pode ignorar os campos adicionais sem perda de dados.
- Uma reversão destrutiva do enum, das colunas ou do índice não faz parte do rollback.
