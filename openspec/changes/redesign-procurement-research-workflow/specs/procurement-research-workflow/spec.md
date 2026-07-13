## ADDED Requirements

### Requirement: Criar dossiê por entrada manual ou importação

O sistema SHALL permitir que um usuário autorizado crie uma pesquisa em estado de rascunho escolhendo cadastro manual de itens ou importação de planilha. A planilha NÃO DEVE ser pré-requisito para iniciar uma pesquisa.

#### Scenario: Criar pesquisa manual sem planilha

- **WHEN** um operador autorizado criar uma pesquisa e selecionar “Cadastro manual”
- **THEN** o sistema SHALL criar o dossiê em `RASCUNHO` e apresentar o editor de itens sem exigir arquivo

#### Scenario: Criar pesquisa por importação

- **WHEN** um operador autorizado criar uma pesquisa e selecionar “Importar planilha”
- **THEN** o sistema SHALL criar o dossiê em `RASCUNHO` e disponibilizar a prévia de importação

### Requirement: Manter itens sem substituição destrutiva

O sistema SHALL permitir criar, editar, reordenar e remover um item enquanto a pesquisa estiver em rascunho ou revisão. A aplicação de uma importação SHALL mostrar a operação proposta por linha e NÃO DEVE remover itens existentes automaticamente.

#### Scenario: Adicionar item manualmente

- **WHEN** o usuário informar nome, descrição, quantidade e unidade válidos e confirmar o item
- **THEN** o sistema SHALL incluir somente esse item no dossiê e registrar a ação na auditoria

#### Scenario: Aplicar importação em pesquisa com itens

- **WHEN** o usuário revisar uma prévia de planilha em uma pesquisa que já contém itens
- **THEN** o sistema SHALL permitir escolher adicionar, atualizar ou ignorar cada linha antes de persistir alterações

### Requirement: Controlar ciclo de vida do dossiê

O sistema SHALL controlar os estados `RASCUNHO`, `COLETANDO`, `EM_REVISAO`, `APROVADA`, `EMITIDA` e `ERRO`. O sistema MUST impedir emissão enquanto houver item sem decisão de cobertura ou justificativa exigida.

#### Scenario: Encerrar coleta para revisão

- **WHEN** a coleta automática e manual de evidências for concluída pelo responsável
- **THEN** o sistema SHALL mover a pesquisa para `EM_REVISAO` e apresentar o resumo de cobertura por item

#### Scenario: Impedir emissão incompleta

- **WHEN** o usuário tentar emitir uma pesquisa que possui item abaixo da meta de cobertura sem justificativa aprovada
- **THEN** o sistema SHALL recusar a emissão e identificar os itens pendentes

### Requirement: Aplicar permissões de ação na API

O sistema SHALL aplicar autorização na API para cada ação do dossiê. Usuários `VISUALIZADOR` MUST ter acesso somente de leitura; somente papéis autorizados poderão editar, coletar, aprovar ou emitir.

#### Scenario: Visualizador tenta alterar pesquisa

- **WHEN** um usuário com papel `VISUALIZADOR` chamar um endpoint de criação, edição, coleta, exclusão ou emissão
- **THEN** o sistema SHALL responder com acesso negado e não alterar dados

### Requirement: Organizar a operação em workspace orientado ao item

O sistema SHALL organizar a jornada principal nas etapas Itens, Buscar e revisar, Calcular e Exportar. O workspace MUST mostrar a fila de itens, o item atual, a abrangência da busca, os candidatos PNCP, a seleção de evidências, a cobertura e a próxima ação sem exigir navegação por múltiplas abas operacionais. Os dados SHALL distinguir configuração institucional da Prefeitura, pesquisa, item, contratação consultada, fornecedor e evidência.

#### Scenario: Preencher identificação institucional

- **WHEN** um usuário autorizado iniciar uma pesquisa
- **THEN** o sistema SHALL preencher Cataguases/MG e os dados institucionais configurados, mantendo CNPJ do órgão separado de CNPJs de fornecedores e órgãos consultados

#### Scenario: Validar campos por etapa

- **WHEN** o usuário tentar avançar para coleta, revisão ou emissão
- **THEN** o sistema SHALL validar campos obrigatórios da etapa, identificar pendências por aba e impedir avanço sem correção ou justificativa autorizada

#### Scenario: Abrir pesquisa com itens pendentes

- **WHEN** o usuário abrir uma pesquisa que possua itens sem cobertura
- **THEN** o sistema SHALL selecionar o primeiro item pendente e apresentar a próxima ação necessária

#### Scenario: Concluir um item

- **WHEN** o usuário concluir um item com cobertura atendida ou exceção justificada
- **THEN** o sistema SHALL avançar para o próximo item pendente e atualizar o progresso geral

### Requirement: Preservar histórico das edições detalhadas

O sistema SHALL permitir edição dos campos autorizados sem apagar o valor anterior, registrando usuário, data, campo, valor anterior, novo valor e motivo quando exigido.

#### Scenario: Alterar especificação de item

- **WHEN** o usuário editar uma especificação já utilizada em uma busca
- **THEN** o sistema SHALL reabrir a revisão quando necessário, preservar evidências e documentos anteriores e registrar a alteração na auditoria
