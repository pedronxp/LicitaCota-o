# Operação segura do dossiê de preços

## Publicação

Em produção, o comando de inicialização executa `prisma migrate deploy`; `db push --accept-data-loss` não é usado. O seed principal é idempotente e não remove fontes cadastradas pelo órgão.

Antes do rollout, configure `FEATURE_DOSSIE_VERSIONADO=true`. Para piloto restrito, informe os IDs autorizados em `FEATURE_DOSSIE_PILOT_USERS`, separados por vírgula. Em produção a feature permanece desativada por padrão quando a variável não é definida.

## Uploads e acesso

- planilhas: limite de 10 MB e extensão XLSX;
- comprovantes: limite de 10 MB e somente PDF ou imagem;
- arquivos locais são entregues por rota autenticada e conferência de propriedade da pesquisa;
- arquivos no Supabase também são privados e transmitidos pela rota autenticada; novas gravações não usam bucket público;
- nomes físicos são UUIDs gerados pelo servidor e chaves com travessia de diretório são rejeitadas;
- URLs antigas em `/uploads` continuam disponíveis, mas agora exigem autenticação e escopo.

## Retenção de dados brutos

Configure `EVIDENCE_RAW_RETENTION_DAYS` e agende `pnpm --filter @licitapreco/api retencao:evidencias`. O processo remove somente JSON bruto antigo de evidências, cotações e sessões. Valores, origem, datas, referências, decisões de revisão, comprovantes e snapshots emitidos são preservados.

## Rollback

Desative `FEATURE_DOSSIE_VERSIONADO` e mantenha as tabelas e arquivos. Não reverta por exclusão de evidências ou documentos emitidos. A migration de estados não apaga dados e o fluxo legado permanece disponível durante a transição.

## Dados demonstrativos

Defina `DEMO_USER_EMAIL` com um usuário já existente e execute `pnpm --filter @licitapreco/api seed:demo`. O script é idempotente e cria um dossiê manual com um item coberto por três origens, um item com exceção justificada e sugestões no catálogo.
