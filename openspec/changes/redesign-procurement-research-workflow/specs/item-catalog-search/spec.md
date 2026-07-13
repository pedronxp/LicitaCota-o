## ADDED Requirements

### Requirement: Sugerir itens do catálogo local

O sistema SHALL fornecer sugestões de itens por nome ou descrição normalizada a partir do catálogo e do histórico interno. Cada sugestão MUST informar descrição padrão, unidade quando disponível, data e preço de referência mais recentes quando existirem.

#### Scenario: Buscar termo com sugestões locais

- **WHEN** o usuário informar pelo menos três caracteres no campo de item e aguardar o debounce configurado
- **THEN** o sistema SHALL retornar uma lista limitada de sugestões locais ordenada por relevância e uso recente

#### Scenario: Termo sem sugestão local

- **WHEN** não houver item local compatível com o termo pesquisado
- **THEN** o sistema SHALL informar que não há sugestão interna e manter o cadastro manual disponível

### Requirement: Consultar preços atualizados sob demanda

O sistema SHALL permitir que o usuário solicite busca atualizada para um item em fontes online habilitadas. A resposta MUST identificar fonte, horário de consulta, preço, referência e resultado de cada fonte consultada.

#### Scenario: Solicitar atualização online

- **WHEN** o usuário selecionar “Buscar preços atualizados” para um item válido
- **THEN** o sistema SHALL iniciar a consulta das fontes habilitadas e exibir progresso e resultados por fonte

#### Scenario: Fonte indisponível durante busca

- **WHEN** uma fonte habilitada exceder timeout ou retornar erro
- **THEN** o sistema SHALL registrar a falha da fonte sem descartar resultados válidos das demais fontes

### Requirement: Configurar abrangência e período da busca PNCP

O sistema SHALL exigir uma abrangência explícita para cada busca PNCP entre `NACIONAL`, `UF`, `MUNICIPIO` e `ORGAO`. A sessão de busca MUST registrar abrangência, UF, município, CNPJ do órgão quando aplicável, data inicial e data final efetivamente consultadas.

#### Scenario: Buscar em abrangência nacional

- **WHEN** o usuário escolher abrangência nacional e solicitar a pesquisa de um item
- **THEN** o sistema SHALL consultar contratações nacionais no período informado sem restringir órgão, município ou UF

#### Scenario: Buscar por unidade federativa

- **WHEN** o usuário escolher abrangência por UF e informar `MG`
- **THEN** o sistema SHALL manter somente contratações de unidades localizadas em Minas Gerais

#### Scenario: Buscar por município

- **WHEN** o usuário escolher abrangência municipal e informar `Cataguases` e `MG`
- **THEN** o sistema SHALL manter somente contratações vinculadas ao município e à UF informados

#### Scenario: Buscar por órgão específico

- **WHEN** o usuário escolher abrangência por órgão e informar um CNPJ válido
- **THEN** o sistema SHALL consultar ou manter somente contratações do órgão identificado pelo CNPJ

#### Scenario: Importar item por planilha

- **WHEN** nome, descrição, unidade, cidade ou UF vierem de uma planilha
- **THEN** o sistema SHALL usar nome, descrição e especificação como base do item, mas MUST exigir confirmação explícita antes de aplicar cidade ou UF como abrangência da busca

### Requirement: Preservar decisão do usuário sobre a sugestão

O sistema SHALL preencher campos editáveis a partir de uma sugestão selecionada, mas NÃO DEVE substituir a descrição, quantidade, unidade ou especificação já confirmada pelo usuário sem ação explícita.

#### Scenario: Selecionar sugestão e ajustar especificação

- **WHEN** o usuário selecionar uma sugestão de catálogo e editar a especificação do item
- **THEN** o sistema SHALL salvar a especificação editada no item e manter vínculo de auditoria com a sugestão original
