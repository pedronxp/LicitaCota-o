# Matriz de permissões

Esta é a política inicial do dossiê de pesquisa de preços. Todas as regras são
aplicadas na API; ocultar botões no frontend é apenas uma melhoria de experiência.

| Ação | ADMIN | OPERADOR | VISUALIZADOR |
|---|:---:|:---:|:---:|
| Consultar dossiê | Sim | Próprios | Próprios |
| Criar dossiê | Sim | Sim | Não |
| Editar itens e evidências | Sim | Próprios | Não |
| Executar coleta | Sim | Próprios | Não |
| Revisar cobertura | Sim | Próprios | Não |
| Aprovar dossiê | Sim | Não | Não |
| Emitir documento | Sim | Não | Não |
| Excluir pesquisa | Sim | Não | Não |

Fornecedores podem ser consultados e gerenciados por `ADMIN` e `OPERADOR`.
Diagnósticos internos exigem `ADMIN`; operações de reset ficam desativadas em
produção. Aprovação e emissão permanecem restritas ao administrador até a
definição de um papel institucional específico de aprovador.
