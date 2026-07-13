## ADDED Requirements

### Requirement: Gerar prévia do dossiê

O sistema SHALL permitir que o usuário autorizado visualize uma prévia do quadro comparativo e do relatório metodológico antes da emissão. A prévia MUST identificar itens, evidências válidas, evidências descartadas, método de cálculo e pendências de cobertura.

#### Scenario: Visualizar pesquisa pronta para revisão

- **WHEN** o usuário abrir a etapa de revisão de uma pesquisa
- **THEN** o sistema SHALL exibir a cobertura, o preço de referência e a metodologia aplicados a cada item

### Requirement: Emitir versão congelada do documento

O sistema SHALL criar uma versão de documento ao emitir uma pesquisa aprovada. A versão MUST armazenar snapshot do dossiê, data, usuário emissor e arquivos gerados, e NÃO DEVE ser alterada por mudanças posteriores na pesquisa ou na configuração global.

#### Scenario: Emitir pesquisa aprovada

- **WHEN** um usuário autorizado emitir uma pesquisa aprovada sem pendências
- **THEN** o sistema SHALL gerar os arquivos configurados, persistir o snapshot e mudar a pesquisa para `EMITIDA`

#### Scenario: Alterar pesquisa emitida

- **WHEN** um usuário autorizado editar item, evidência ou metodologia de uma pesquisa emitida
- **THEN** o sistema SHALL reabrir a pesquisa para revisão e preservar o documento emitido anterior como versão histórica

### Requirement: Exportar quadro comparativo e relatório

O sistema SHALL disponibilizar a versão emitida para download em XLSX e o relatório metodológico no formato configurado pelo órgão. Os arquivos MUST identificar a versão do documento e a data de emissão.

#### Scenario: Baixar documento emitido

- **WHEN** um usuário com permissão de leitura solicitar uma versão emitida
- **THEN** o sistema SHALL entregar os arquivos associados ao snapshot daquela versão

### Requirement: Gerar relatórios completos e configuráveis

O sistema SHALL gerar planilha de banco de preços, quadro comparativo, relatório metodológico, relatório de fontes, relatório de exceções, relatório de duplicidades, relatório por item e histórico de versões. Administradores SHALL poder editar templates, títulos, textos institucionais e campos permitidos sem alterar documentos já emitidos.

#### Scenario: Emitir relatório com três preços

- **WHEN** uma pesquisa aprovada for emitida
- **THEN** o relatório SHALL apresentar as evidências independentes válidas e selecionadas, suas referências oficiais, órgão, fornecedor, CNPJ, data, unidade, método, preço de referência, cálculo total, descartes e justificativas

#### Scenario: Alterar template após emissão

- **WHEN** um administrador alterar um template de relatório
- **THEN** o sistema SHALL aplicar a alteração somente a novas emissões e preservar o snapshot e os arquivos das versões anteriores
