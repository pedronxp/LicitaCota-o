## ADDED Requirements

### Requirement: Registrar evidência individual de preço

O sistema SHALL registrar cada preço utilizável como evidência individual vinculada a um item. A evidência MUST conter tipo de origem, chave de origem distinta, valor, data de referência ou coleta, referência e situação de validação.

#### Scenario: Persistir resultado de fonte pública

- **WHEN** uma fonte online retornar um resultado de preço para um item
- **THEN** o sistema SHALL criar uma evidência com fonte, referência externa, horário de consulta e dados de proveniência disponíveis

#### Scenario: Registrar evidência manual

- **WHEN** o usuário informar manualmente um preço para um item
- **THEN** o sistema SHALL exigir origem, data e referência ou comprovante antes de permitir marcar a evidência como válida

### Requirement: Avaliar cobertura por evidência independente selecionada

O sistema SHALL calcular a cobertura de cada item pelo número de evidências válidas, selecionadas e com identidades independentes. A meta mínima SHALL ser configurável no dossiê a partir do padrão do sistema e SHALL ser avaliada depois da exclusão de duplicidades, incompatibilidades e outliers descartados.

#### Scenario: PNCP retorna três contratações independentes

- **WHEN** o PNCP retornar três registros válidos com identidades distintas de contratação, item e fornecedor/resultado e o usuário selecionar os três
- **THEN** o sistema SHALL contar três evidências para a meta, mesmo que todas tenham sido obtidas pelo portal PNCP

#### Scenario: Mesmo registro PNCP repetido

- **WHEN** o mesmo órgão, contratação, item e fornecedor/resultado aparecer mais de uma vez
- **THEN** o sistema SHALL contar o conjunto duplicado como uma única evidência independente

#### Scenario: Fornecedores independentes apresentam o mesmo valor

- **WHEN** três evidências independentes válidas apresentarem valores numericamente iguais
- **THEN** o sistema SHALL contar as três evidências para cobertura

#### Scenario: Meta de cobertura alcançada

- **WHEN** um item possuir a quantidade configurada de origens distintas válidas
- **THEN** o sistema SHALL marcar o item como coberto e liberar a revisão do cálculo

#### Scenario: Outlier reduz conjunto final abaixo da meta

- **WHEN** uma evidência selecionada for excluída do cálculo como outlier e restarem menos evidências independentes que a meta
- **THEN** o sistema SHALL marcar o item como abaixo da meta e exigir nova evidência ou justificativa

### Requirement: Revisar evidência e exceção de cobertura

O sistema SHALL permitir que usuário autorizado valide ou descarte evidências com justificativa. Quando a meta de cobertura não for alcançada, o sistema MUST exigir uma justificativa de exceção antes da aprovação do item.

#### Scenario: Descartar preço atípico

- **WHEN** o revisor descartar uma evidência por valor atípico ou incompatibilidade de especificação
- **THEN** o sistema SHALL exigir justificativa, preservar a evidência e excluí-la do cálculo de referência

#### Scenario: Aprovar item com cobertura incompleta

- **WHEN** o revisor aprovar um item abaixo da meta configurada
- **THEN** o sistema SHALL exigir justificativa de exceção e registrar usuário, data e motivo na auditoria

### Requirement: Calcular referência a partir de evidências válidas

O sistema SHALL calcular o preço de referência exclusivamente a partir de evidências válidas, selecionadas e independentes, usando o método congelado no dossiê. O sistema MUST registrar as evidências consideradas e descartadas no resultado do cálculo.

#### Scenario: Recalcular após revisão

- **WHEN** uma evidência for validada, descartada ou alterada
- **THEN** o sistema SHALL recalcular o preço de referência e atualizar o resumo de cobertura do item
