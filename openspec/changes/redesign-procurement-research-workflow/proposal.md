## Why

O fluxo atual trata a planilha como ponto de partida obrigatório da pesquisa, enquanto o trabalho cotidiano do setor de compras normalmente começa com a identificação de um item e a montagem gradual de evidências de preço. Isso limita o uso online do sistema, dificulta a obtenção de cotações atualizadas e não organiza a revisão necessária antes da emissão do documento do processo.

Esta mudança reposiciona a pesquisa como um dossiê de preços: o servidor pode cadastrar itens manualmente, receber sugestões atualizadas, combinar fontes e fornecedores e emitir documentos rastreáveis para o processo de compra.

## What Changes

- Adicionar um assistente de criação de pesquisa que permita iniciar por cadastro manual ou importação de planilha, sem tornar a planilha obrigatória.
- Adicionar catálogo e busca assistida de itens, com sugestões do histórico interno e consulta atualizada às fontes públicas quando solicitada pelo usuário.
- Registrar, por item, evidências individuais de preço com origem, data, referência, comprovante, situação de validação e justificativa.
- Adicionar uma revisão de cobertura por item, com meta configurável de evidências independentes, válidas e selecionadas, e justificativa obrigatória quando a meta não for alcançada.
- Permitir que a busca PNCP tenha abrangência explícita nacional, por UF, por município ou por órgão/CNPJ, além de período configurável.
- Reorganizar a experiência principal como uma mesa de trabalho por item, com fila de pendências, candidatos PNCP, seleção de evidências, cobertura e cálculo na mesma jornada.
- Separar método de entrada do item, método de obtenção do preço e método de cálculo da referência.
- Gerar um dossiê de pesquisa composto por quadro comparativo, relatório metodológico e arquivos de apoio, com versão congelada ao emitir o documento.
- **BREAKING**: o fluxo de confirmação de itens deixará de substituir automaticamente todos os itens da pesquisa; operações de criação, edição e remoção passarão a ser explícitas para preservar evidências e rastreabilidade.
- **BREAKING**: resultados distintos do PNCP deixarão de ser agrupados como uma única origem para cobertura; cada contratação/item/fornecedor independente poderá contar, desde que revisada e selecionada.
- **BREAKING**: as ações legadas `Processar`, `Reprocessar` e `Concluída` deixarão de ser a jornada principal do frontend.

## Capabilities

### New Capabilities

- `procurement-research-workflow`: criação, estados e revisão de um dossiê de pesquisa de preços.
- `item-catalog-search`: sugestões de itens do catálogo/histórico e busca atualizada em fontes online.
- `price-evidence-review`: coleta, validação, cobertura e justificativa das evidências de preço por item.
- `procurement-document-generation`: geração versionada do quadro comparativo e relatório de pesquisa.

### Modified Capabilities

- Nenhuma. Não há especificações principais existentes neste repositório.

## Impact

- API de pesquisas e schema Prisma: novos estados, entidades de evidência/sessão de coleta, endpoints de itens e de catálogo.
- Motor de cotação e fila BullMQ: execução sob demanda da busca atualizada e persistência de proveniência por resultado.
- Adaptador PNCP: filtros explícitos de abrangência e período, preservação da identidade independente da contratação/item/fornecedor e retorno de candidatos para revisão humana.
- Frontend Next.js: substituição do fluxo centrado em abas e processamento por um workspace orientado ao item, mantendo React Query, formulários e componentes existentes.
- Geração de XLSX/PDF: novos modelos de documento e snapshot imutável da metodologia aplicada.
- Auditoria, permissões, armazenamento de anexos e testes de integração precisarão ser ampliados.

O escopo também inclui uma experiência institucional completa para a Prefeitura Municipal de Cataguases/MG, com subcampos detalhados, abas orientadas por etapa, ajuda contextual, configurações editáveis, relatórios configuráveis e canal interno de sugestões. A solução deverá separar dados da Prefeitura, da pesquisa, do item, da contratação consultada, do fornecedor e da evidência, evitando CNPJ incorreto, referência PNCP incorreta e duplicidade de preços.
