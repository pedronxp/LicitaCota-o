# Snapshot do documento de pesquisa

Cada emissão cria um `DocumentoPesquisa` imutável. O campo `snapshot` usa o contrato `SnapshotEmissao`, atualmente na versão de schema `1.0`, definido em `apps/api/src/services/documento/snapshot.service.ts`.

O snapshot contém:

- identificação da versão, data e usuário emissor;
- dados do processo e do órgão;
- método de cálculo, meta de origens, limite de outlier e fontes congeladas;
- aprovação que autorizou a emissão;
- resumo financeiro e de cobertura;
- itens, cálculos, justificativas e decisões de exceção;
- todas as evidências, inclusive pendentes, descartadas e inválidas, com origem, preço, datas, referência e comprovante.

A geração de arquivos recebe exclusivamente esse snapshot. Ela não consulta a configuração global, as fontes correntes ou os itens atuais. Portanto, alterações posteriores geram uma nova versão e não modificam documentos anteriores.

## Formatos

O XLSX é obrigatório e contém as abas `Itens`, `Quadro Comparativo` e `Metodologia`.

O PDF foi adiado nesta mudança porque não há template institucional aprovado. Essa decisão fica registrada no próprio snapshot. Quando o template for aprovado, o PDF poderá ser adicionado sem modificar versões anteriores.

## Rollback operacional

A emissão versionada pode ser desativada na interface sem excluir `DocumentoPesquisa`, snapshots ou arquivos existentes. O download legado permanece disponível para pesquisas antigas. Nenhuma migration destrutiva deve remover documentos emitidos.

## Mapeamento de estados legados

A migration `20260712010000_mapear_status_dossie` é separada da criação dos valores do enum para evitar o uso de um valor recém-adicionado antes do commit no PostgreSQL. Ela mapeia `AGUARDANDO` para `RASCUNHO`, `PROCESSANDO` para `COLETANDO` e `CONCLUIDA` para `APROVADA`, sem apagar registros ou arquivos. `ERRO` é preservado.
