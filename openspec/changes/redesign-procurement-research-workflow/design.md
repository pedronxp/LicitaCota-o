## Context

O LicitaPreço já possui pesquisa, itens, coleta automática no PNCP, cotação direta com fornecedores, cálculo de preço de referência, histórico, catálogo e geração de XLSX. Entretanto, o fluxo de itens começa por upload/colagem e a confirmação substitui toda a lista de itens; a interface de detalhes concentra upload, revisão e processamento em uma página extensa. O catálogo interno é alimentado durante a coleta, mas não existe API nem interface de sugestão para aproveitá-lo.

O público-alvo é o servidor que prepara uma pesquisa de preços para instruir uma compra. Ele precisa iniciar pelo item, pesquisar evidências atualizadas online, completar lacunas com fornecedores, revisar exceções e emitir um documento rastreável. O setor de compras e o responsável técnico precisam conseguir verificar de onde veio cada preço e qual metodologia foi aplicada.

## Goals / Non-Goals

**Goals:**

- Tornar o cadastro manual de itens um fluxo online, assistido e tão viável quanto a importação de planilha.
- Permitir que uma pesquisa combine fontes públicas, histórico, tabela de referência, cotação direta e evidência manual por item.
- Separar claramente entrada do item, obtenção do preço, cálculo da referência e emissão do documento.
- Tratar três evidências independentes, válidas e selecionadas como meta configurável de cobertura, com justificativa de exceção.
- Tornar a abrangência da busca PNCP explícita e reproduzível: nacional, UF, município ou órgão/CNPJ, com período configurável.
- Organizar o frontend como uma mesa de trabalho por item, com uma próxima ação clara e sem depender do fluxo legado de processamento.
- Congelar a metodologia, as evidências consideradas e os arquivos no momento de emissão do dossiê.
- Preservar pesquisas existentes, importação de planilha e cotação direta já disponíveis.

**Non-Goals:**

- Declarar que uma quantidade fixa de cotações atende a qualquer regra jurídica; a regra de cobertura será configurável pelo órgão.
- Construir integrações com todas as fontes ou scraping genérico nesta mudança; a primeira versão consulta apenas adapters já suportados e fontes explicitamente habilitadas.
- Substituir o fluxo de e-mail de fornecedores por portal público de respostas nesta entrega.
- Criar assinatura digital, protocolo externo ou integração com processo eletrônico.

## Decisions

### 1. Pesquisa passa a ser um dossiê com ciclo explícito

`Pesquisa` continuará sendo a raiz do domínio, mas terá estados de negócio: `RASCUNHO`, `COLETANDO`, `EM_REVISAO`, `APROVADA`, `EMITIDA` e `ERRO`. Os estados atuais serão migrados para seus equivalentes sem perder dados. A emissão será permitida apenas após revisão; alterações posteriores reabrem a pesquisa em revisão e invalidam o documento emitido anterior sem apagá-lo.

Alternativa considerada: criar uma entidade `ProcessoCompra` acima de `Pesquisa`. Foi rejeitada para a primeira entrega porque duplicaria telas e migrações sem resolver o problema imediato; o dossiê pode ganhar dados de processo no próprio agregado `Pesquisa` e uma entidade separada pode ser introduzida depois, se necessário.

### 2. Itens terão CRUD explícito e importação não destrutiva

Serão adicionados endpoints para criar, editar, reordenar e remover item de uma pesquisa em rascunho. A importação produzirá uma prévia; ao aplicar, o usuário escolherá adicionar, atualizar ou ignorar linhas. Ela não executará mais `deleteMany` sobre os itens existentes.

Alternativa considerada: manter a confirmação atual e adicionar um formulário manual que reenvia toda a lista. Foi rejeitada porque pode apagar evidências e cotações já coletadas quando um único item é corrigido.

### 3. Autocomplete em duas camadas e busca online com abrangência explícita

O endpoint de catálogo consultará `ItemCatalogo` e histórico local por texto normalizado, retornando descrição padrão, unidade, uso anterior e última referência. A interface fará busca com debounce, a partir de três caracteres.

Uma busca online será uma ação distinta (`Buscar preços atualizados`) ou será disparada apenas após pausa controlada e confirmação de escopo. Ela consultará fontes habilitadas, registrará uma sessão de busca e retornará resultados com origem e horário. Essa separação impede uma chamada externa a cada tecla, reduz limite de requisições e deixa claro para o usuário o que é histórico e o que é dado atualizado.

Antes da consulta PNCP, o usuário escolherá a abrangência `NACIONAL`, `UF`, `MUNICIPIO` ou `ORGAO`, informando os parâmetros correspondentes e o período. A planilha ou o cadastro manual fornecerá o item pesquisado; cidade e UF importadas não serão aplicadas silenciosamente como filtro. A sessão de busca congelará os parâmetros efetivamente utilizados para permitir auditoria e repetição.

Alternativa considerada: consultar PNCP em toda digitação. Foi rejeitada por latência, custo, limites de fonte e resultados instáveis enquanto o texto ainda está incompleto.

### 4. Evidência de preço será a unidade canônica de cálculo e revisão

Será criado `EvidenciaPreco` para representar um preço individual considerado ou descartado. A entidade conterá item, tipo/origem, chave de origem distinta, preço, data de referência, data de coleta, referência externa, comprovante, dados brutos, status, justificativa e usuário responsável. `Cotacao` continuará registrando tentativas automáticas e `CotacaoDireta` continuará sendo a solicitação ao fornecedor; ambas poderão originar uma ou mais evidências.

O cálculo passará a considerar somente evidências válidas e selecionadas. A cobertura contará identidades independentes, e não o portal tecnológico que retornou o preço. Para PNCP, a identidade combinará órgão/CNPJ, ano, sequencial da contratação, número do item e fornecedor/resultado quando disponível. Para cotação direta, usará o fornecedor e a solicitação; para evidência manual ou tabela, usará origem e referência verificável. Valores numericamente iguais poderão contar quando possuírem identidades independentes.

Duplicidades, incompatibilidades de unidade, preços globais, evidências descartadas e outliers excluídos do cálculo não contarão para a cobertura final. Se uma exclusão reduzir o conjunto abaixo da meta, o item voltará a ficar pendente ou exigirá justificativa de exceção.

Alternativa considerada: reutilizar somente `Cotacao` e `CotacaoDireta`. Foi rejeitada porque eles possuem semânticas diferentes e não representam bem preço manual, múltiplos resultados de uma fonte e decisão de revisão.

### 5. Metodologia será configurada no dossiê, com padrão do sistema

Uma pesquisa herdará parâmetros padrão do sistema ao ser criada: método de cálculo, meta mínima de evidências distintas, limite de outlier e fontes habilitadas. Esses valores serão copiados para um snapshot da pesquisa, podendo ser ajustados por usuário autorizado antes da revisão. Cada item poderá excluir uma fonte ou incluir uma evidência manual, mas toda exceção será auditada.

Alternativa considerada: ler sempre a configuração singleton atual. Foi rejeitada porque uma alteração administrativa posterior não pode mudar a metodologia de um documento já emitido.

### 6. Emissão criará documento versionado e imutável

Será criada uma entidade `DocumentoPesquisa` contendo número da versão, snapshot JSON do dossiê, URLs de XLSX/PDF e data/usuário de emissão. A geração usará o snapshot e não a configuração atual. Ao reabrir e alterar uma pesquisa, uma nova versão será emitida; a versão anterior continuará acessível para auditoria.

### 7. Interface será um workspace orientado ao item

O frontend terá quatro etapas operacionais: itens, buscar/revisar, calcular e exportar. A tela principal combinará `ItemNavigator`, `SearchScopePanel`, `PncpCandidateTable`, `EvidenceSelection`, `CoverageSummary` e `ReferenceCalculation`. React Query continuará responsável por cache, invalidação e cancelamento; a página monolítica atual será reduzida a um contêiner de rota. Dados institucionais, histórico e documentos continuarão acessíveis como áreas secundárias, sem competir com a próxima ação operacional.

O usuário será levado ao primeiro item pendente. A ação principal variará entre pesquisar, selecionar evidências, completar cobertura, concluir o item e exportar. `Processar` e `Reprocessar` permanecerão apenas como compatibilidade temporária até a retirada do fluxo legado.

### 8. Acesso será protegido por política de ação

Uma política central definirá quem pode criar, editar, coletar, revisar, aprovar e emitir. `VISUALIZADOR` terá leitura apenas. A API, e não somente o menu do frontend, aplicará essas permissões. Endpoints públicos de compartilhamento receberão projeção explícita de campos seguros.

## Risks / Trade-offs

- [Fontes online lentas ou indisponíveis] → busca assíncrona com timeout, progresso por fonte, cache curto e possibilidade de continuar com evidência manual/direta.
- [Resultados de busca incompatíveis com a especificação] → o usuário escolhe e ajusta a descrição; nenhuma sugestão altera o item automaticamente.
- [Migração de pesquisas existentes] → preservar tabelas atuais, criar evidências a partir de cotações existentes de forma idempotente e manter download legado enquanto não houver versão emitida.
- [Documento perde reprodutibilidade] → salvar snapshot e arquivos por versão; geração posterior de versão anterior usa o snapshot, não a configuração corrente.
- [Aumento de consultas no catálogo] → índice por chave normalizada, mínimo de caracteres, debounce, limite de resultados e cache no cliente.
- [Cobertura interpretada como validação legal automática] → interface e documento usam o termo “meta de cobertura configurada”; exceções exigem justificativa e aprovação humana.
- [Ampliação de escopo] → portal externo de fornecedor, novos scrapers e assinatura digital ficam fora deste change.

### Escopo institucional, deduplicação e experiência orientada

O sistema será configurado para a Prefeitura Municipal de Cataguases/MG, mas os dados institucionais não serão misturados aos dados retornados por fontes externas. O CNPJ do órgão, município, UF, secretarias, setores e responsáveis ficarão em configuração institucional; o CNPJ do fornecedor, órgão contratante consultado e identificadores do PNCP ficarão exclusivamente na evidência correspondente.

As abas serão: Dados gerais, Processo, Itens, Busca PNCP, Outras fontes, Evidências, Análise de preços, Justificativas, Revisão, Relatórios, Histórico e Sugestões. Cada aba terá subcampos obrigatórios, opcionais e condicionais.

Cada candidato do PNCP será persistido com estado de revisão e dados brutos. A chave oficial deverá combinar órgão/CNPJ, ano, sequencial da contratação e número do item, quando disponíveis. CNPJ do fornecedor, tipo de preço, unidade, descrição original, data e referência oficial também serão armazenados. Lotes, valores globais, resultados incompatíveis e referências incompletas não serão convertidos silenciosamente em evidências válidas.

A meta operacional da Prefeitura será de três valores válidos por item e o método padrão será `MENOR_PRECO`, mantendo média e mediana como alternativas configuráveis. A seleção ocorrerá somente após revisão humana.

Todo campo detalhado terá componente de ajuda `?` acionável por hover, foco, clique e teclado, com rótulo, explicação, formato, exemplo e indicação de obrigatoriedade. Administradores poderão editar textos, campos, presets, fontes, regras e templates sem alterar documentos já emitidos.

O canal de sugestões registrará categoria, tela, descrição, prioridade, anexo, autor opcional, status, responsável e histórico, separado dos registros de auditoria das compras.

## Migration Plan

1. Criar as novas tabelas, enums, índices e campos de snapshot com migration reversível quando possível.
2. Mapear estados atuais: `AGUARDANDO` para `RASCUNHO`, `PROCESSANDO` para `COLETANDO`, `CONCLUIDA` para `APROVADA` e `ERRO` para `ERRO`; pesquisas concluídas poderão ser emitidas novamente após revisão.
3. Backfill idempotente de evidências a partir de `Cotacao` e de cotações diretas respondidas, preservando os registros antigos como fonte de auditoria.
4. Publicar os novos endpoints e a interface de assistente mantendo upload e download legados durante a transição.
5. Migrar a geração do documento para snapshots e ativar emissão versionada por feature flag/configuração.
6. Depois de validar pesquisas novas em produção, descontinuar a confirmação destrutiva de itens e tornar o novo fluxo padrão.

Rollback: desligar a emissão versionada e voltar a exibir o fluxo legado, sem remover as novas tabelas nem apagar evidências já persistidas. Migrations destrutivas não serão incluídas nesta mudança.

## Open Questions

- Qual é o modelo de aprovação desejado: um aprovador único, aprovação por papel ou assinatura externa?
- Quais campos do processo são obrigatórios para o documento do órgão (número, secretaria, dotação, responsável, prazo e observação)?
- A primeira versão deve gerar PDF junto com XLSX, ou o PDF fica como etapa seguinte após validar o template do relatório?
- A busca online inicial consultará apenas PNCP e Atas, ou também uma tabela de referência interna habilitada?
