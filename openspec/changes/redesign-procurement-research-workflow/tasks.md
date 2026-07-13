## 1. Preparação, segurança e contrato de acesso

- [x] 1.1 Documentar a matriz de permissões para criar, editar, coletar, revisar, aprovar, emitir, excluir e consultar dossiês.
- [x] 1.2 Criar política central de autorização de pesquisas e aplicar a regra de leitura exclusiva para `VISUALIZADOR` na API.
- [x] 1.3 Corrigir permissões dos endpoints atuais de pesquisa, itens, cotação direta e fornecedores para que o frontend não seja a única barreira.
- [x] 1.4 Proteger os endpoints de diagnóstico por ambiente e papel administrativo, removendo mutações públicas.
- [x] 1.5 Limitar o endpoint de compartilhamento público a uma projeção segura, sem tokens, dados internos, erros técnicos ou dados brutos desnecessários.
- [x] 1.6 Adicionar testes de autorização para cada ação e regressões de acesso de `VISUALIZADOR`.

## 2. Modelo de dados e migração segura

- [x] 2.1 Definir os novos enums de estado da pesquisa, tipo de origem de evidência e status de revisão.
- [x] 2.2 Estender `Pesquisa` com metadados do dossiê, metodologia congelada, meta de cobertura, limite de outlier e dados de aprovação.
- [x] 2.3 Criar a entidade `EvidenciaPreco` com preço, origem, chave de origem distinta, datas, referência, comprovante, dados brutos, status e justificativas.
- [x] 2.4 Criar a entidade `DocumentoPesquisa` para versões emitidas, snapshots e URLs dos arquivos gerados.
- [x] 2.5 Criar índices para busca por item normalizado, evidências por item/status/origem e documentos por pesquisa/versão.
- [x] 2.6 Criar migration que mapeie estados antigos para o ciclo de dossiê sem apagar pesquisas existentes.
- [x] 2.7 Criar rotina idempotente de backfill de evidências a partir de `Cotacao` e de cotações diretas respondidas.
- [x] 2.8 Validar a migration em uma cópia de dados de desenvolvimento e documentar rollback sem migration destrutiva.

## 3. Cadastro de dossiê e itens sem planilha obrigatória

- [x] 3.1 Atualizar a criação de pesquisa para aceitar modo de entrada `MANUAL` ou `PLANILHA` e iniciar sempre em `RASCUNHO`.
- [x] 3.2 Criar endpoint para inclusão individual de item com validação de nome, descrição, quantidade, unidade e especificação.
- [x] 3.3 Criar endpoints para edição, remoção e reordenação de item, bloqueando alterações durante coleta ativa.
- [x] 3.4 Registrar auditoria para criação, edição, remoção e reordenação de itens.
- [x] 3.5 Adaptar a prévia de planilha para produzir operações por linha: adicionar, atualizar ou ignorar.
- [x] 3.6 Substituir a confirmação destrutiva de itens por aplicação explícita das operações revisadas.
- [x] 3.7 Manter o endpoint legado de confirmação temporariamente, com aviso de depreciação e testes de compatibilidade.

## 4. Catálogo e busca assistida de itens

- [x] 4.1 Criar serviço de consulta ao catálogo local por texto normalizado, relevância, frequência de uso e recência.
- [x] 4.2 Expor endpoint de autocomplete com mínimo de caracteres, limite de resultados e dados de última referência.
- [x] 4.3 Incluir sugestões de histórico local quando não houver correspondência direta no catálogo.
- [x] 4.4 Criar modelo/registro de sessão de busca online para armazenar termo, fontes consultadas, horários e falhas.
- [x] 4.5 Criar endpoint/worker para buscar preços atualizados sob demanda em adapters de fonte habilitados.
- [x] 4.6 Persistir resultados online como tentativas de cotação e evidências individuais com proveniência.
- [x] 4.7 Aplicar timeout, retry, limite de concorrência e cache curto à busca online para não consultar uma fonte a cada tecla.
- [x] 4.8 Adicionar testes para relevância local, ausência de sugestão, indisponibilidade de fonte e isolamento de resultados por pesquisa.

## 5. Evidências, cobertura e cálculo de referência

- [x] 5.1 Criar endpoints para listar, criar, editar, validar e descartar evidências de preço de um item.
- [x] 5.2 Exigir origem, data e referência ou comprovante ao cadastrar evidência manual válida.
- [x] 5.3 Vincular respostas de cotação direta a evidências, preservando fornecedor, solicitação e anexo de resposta.
- [x] 5.4 Implementar regra de chave de origem distinta para fontes públicas, fornecedores, tabelas e entradas manuais.
- [x] 5.5 Alterar o cálculo para contar cobertura por origem distinta, e não pelo total bruto de preços retornados.
- [x] 5.6 Aplicar método, meta de cobertura e limite de outlier congelados no dossiê ao recalcular um item.
- [x] 5.7 Registrar evidências consideradas, descartadas e motivo de descarte no resultado do cálculo.
- [x] 5.8 Implementar justificativa obrigatória para item abaixo da meta e auditoria de aprovação da exceção.
- [x] 5.9 Adicionar testes de cálculo com múltiplos preços da mesma fonte, fornecedor direto, outlier e cobertura incompleta.

## 6. Ciclo de revisão, aprovação e emissão

- [x] 6.1 Implementar transições validadas entre `RASCUNHO`, `COLETANDO`, `EM_REVISAO`, `APROVADA`, `EMITIDA` e `ERRO`.
- [x] 6.2 Criar endpoint para encerrar coleta e abrir a revisão com resumo de pendências por item.
- [x] 6.3 Criar endpoint de aprovação que valide cobertura, justificativas e permissões antes de alterar o estado.
- [x] 6.4 Reabrir automaticamente uma pesquisa emitida para revisão quando item, evidência ou metodologia forem modificados.
- [x] 6.5 Registrar toda transição de estado com usuário, horário e motivo na auditoria.

## 7. Documentos rastreáveis e versionados

- [x] 7.1 Definir o contrato do snapshot de emissão contendo dados do processo, metodologia, itens, evidências, cálculos e justificativas.
- [x] 7.2 Adaptar a geração XLSX para receber snapshot versionado em vez de ler configuração global corrente.
- [x] 7.3 Criar o quadro comparativo de evidências com origem, data, referência, status e preço de referência por item.
- [x] 7.4 Criar o relatório metodológico com cobertura, exceções, parâmetros congelados e identificador da versão emitida.
- [x] 7.5 Implementar emissão de `DocumentoPesquisa`, armazenamento dos arquivos e download por versão.
- [x] 7.6 Decidir e implementar PDF nesta mudança somente se o template institucional for aprovado; manter XLSX como entrega obrigatória.
- [x] 7.7 Testar que versões anteriores permanecem idênticas após mudança na configuração global ou reabertura do dossiê.

## 8. Frontend: assistente de pesquisa online

- [x] 8.1 Refatorar a tela de pesquisa atual em componentes de domínio antes de adicionar o novo fluxo.
- [x] 8.2 Criar assistente de nova pesquisa com dados do dossiê e escolha entre cadastro manual e planilha.
- [x] 8.3 Criar editor manual de itens com quantidade, unidade e especificação editável.
- [x] 8.4 Criar componente de autocomplete com debounce, estados de carregamento, sugestões locais e ação de busca online.
- [x] 8.5 Criar tela de resultados atualizados que diferencie histórico interno, resultados de fonte e falhas por fonte.
- [x] 8.6 Criar quadro de evidências por item, incluindo cadastro manual, anexos, validação, descarte e justificativa.
- [x] 8.7 Exibir indicador de cobertura com contagem de origens distintas e itens pendentes de revisão.
- [x] 8.8 Criar etapas de revisão, aprovação e emissão com prévia do documento e mensagens de bloqueio acionáveis.
- [x] 8.9 Atualizar navegação, badges de status e telas de resultado para suportar o novo ciclo de vida e versões emitidas.
- [x] 8.10 Adicionar tratamento visual de permissões para ocultar ações não autorizadas sem substituir a validação da API.

## 9. Qualidade, operação e transição

- [x] 9.1 Criar testes de integração da jornada manual: criar dossiê, sugerir item, adicionar item, coletar, revisar, aprovar e emitir.
- [x] 9.2 Criar testes de regressão da jornada por planilha e da cotação direta existente.
- [x] 9.3 Adicionar telemetria de duração da busca, taxa de sucesso por fonte, cobertura média e motivos de exceção.
- [x] 9.4 Validar limites de upload, acesso a anexos e retenção de dados brutos de evidências.
- [x] 9.5 Revisar configuração de produção para usar migrations versionadas e seed não destrutivo antes da publicação.
- [x] 9.6 Preparar dados de demonstração com itens manuais, sugestões, evidências de três origens e exceção justificada.
- [x] 9.7 Executar build, lint, testes unitários, testes de integração e teste manual de emissão antes do rollout.
- [x] 9.8 **CANCELADA por decisão do responsável em 12/07/2026:** a publicação por feature flag/grupo piloto e o monitoramento externo não serão executados nesta mudança.

## 10. Detalhamento institucional, deduplicação e usabilidade

- [x] 10.1 Modelar configuração institucional da Prefeitura de Cataguases/MG, incluindo CNPJ, nome oficial, município, UF, brasão, secretarias, setores e responsáveis.
- [x] 10.2 Separar contratos de dados institucionais, pesquisa, item, órgão consultado, fornecedor e evidência no schema e nos DTOs.
- [x] 10.3 Implementar subcampos detalhados do processo, item, especificação, entrega, garantia, anexos e fundamentação, com regras de obrigatoriedade por etapa.
- [x] 10.4 Implementar abas progressivas de dados gerais, processo, itens, PNCP, evidências, análise, justificativas, revisão, relatórios e histórico.
- [x] 10.5 Criar componente reutilizável de ajuda contextual com `?`, hover, foco, clique, teclado, acessibilidade e textos administráveis.
- [x] 10.6 Implementar validação de CNPJ, órgão, fornecedor, contratação, item, unidade, preço unitário e referência oficial do PNCP.
- [x] 10.7 Implementar chave idempotente de deduplicação por contratação/item, fornecedor, origem, unidade e preço, com possíveis duplicidades para revisão.
- [x] 10.8 Ajustar o fluxo PNCP para preservar candidatos brutos, diferenciar homologado/estimado, rejeitar lote/global e selecionar três valores somente após validação.
- [x] 10.9 Configurar `MENOR_PRECO` como preset institucional da Prefeitura, mantendo média e mediana como alternativas autorizadas.
- [x] 10.10 Criar administração de campos, presets, mensagens, justificativas, fontes, janelas de busca e templates de relatório.
- [x] 10.11 Criar relatórios completos de comparação, metodologia, fontes, exceções, duplicidades, auditoria e histórico.
- [x] 10.12 Criar caixa de sugestões e painel administrativo de triagem, prioridade, responsável, status e histórico.
- [x] 10.13 Adicionar testes de CNPJ incorreto, referência PNCP incorreta, duplicidade, reprocessamento idempotente, edição histórica, acessibilidade das dicas e templates versionados.

## 11. Abrangência PNCP e evidências independentes

- [x] 11.1 Definir tipos e contrato HTTP para abrangência `NACIONAL`, `UF`, `MUNICIPIO` e `ORGAO`, período e filtros correspondentes.
- [x] 11.2 Persistir na sessão de busca os parâmetros de abrangência e período efetivamente utilizados.
- [x] 11.3 Aplicar filtros de UF, município e CNPJ no adaptador PNCP sem aplicar silenciosamente a localização importada do XLS.
- [x] 11.4 Criar testes da busca nacional, por UF, município e órgão/CNPJ, incluindo parâmetros inválidos.
- [x] 11.5 Introduzir chave de independência da evidência por contratação/item/fornecedor ou referência verificável, preservando a chave de origem tecnológica.
- [x] 11.6 Criar migration e backfill idempotente da chave de independência para evidências existentes.
- [x] 11.7 Alterar cobertura e cálculo para considerar somente evidências válidas, selecionadas, independentes e restantes após descartes metodológicos.
- [x] 11.8 Adicionar testes com três contratações PNCP, valores iguais de fornecedores independentes, duplicidade e outlier que reduz a cobertura.

## 12. Workspace frontend orientado ao item

- [x] 12.1 Criar `PesquisaWorkspace` com etapas Itens, Buscar e revisar, Calcular e Exportar.
- [x] 12.2 Criar `ItemNavigator` com situação por item e seleção automática do primeiro pendente.
- [x] 12.3 Criar `SearchScopePanel` para abrangência, período, UF, município e CNPJ condicional.
- [x] 12.4 Estender as queries React Query para enviar o contrato de busca e exibir falhas e parâmetros efetivos.
- [x] 12.5 Criar `PncpCandidateTable` com órgão, contratação, fornecedor, unidade, preço, alertas e ação de seleção.
- [x] 12.6 Criar `CoverageSummary` e `ReferenceCalculation` com meta, método, preço calculado e próxima ação.
- [x] 12.7 Integrar cadastro manual e importação XLS não destrutiva ao workspace sem aplicar localização como filtro implícito.
- [x] 12.8 Substituir na jornada principal os botões `Processar` e `Reprocessar` e reduzir a página de detalhes a um contêiner dos componentes de domínio.
- [x] 12.9 Adicionar testes responsivos, de acessibilidade, seleção de evidências e avanço entre itens.

## 13. Saída simplificada e transição do legado

- [x] 13.1 Ajustar XLSX para destacar evidências selecionadas, identidade independente, abrangência e parâmetros da busca.
- [x] 13.2 Manter endpoints legados somente durante a transição, sem expô-los como jornada principal.
- [x] 13.3 Executar testes unitários, integração, type-check e build do frontend e backend para o novo fluxo.
- [x] 13.4 Validar com casos reais de caneta, unidade incompatível, duplicidade, três preços iguais e cobertura excepcional.
