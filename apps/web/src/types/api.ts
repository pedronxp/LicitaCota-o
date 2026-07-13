export type Role = 'ADMIN' | 'OPERADOR' | 'VISUALIZADOR';
export type StatusPesquisa =
  | 'AGUARDANDO'
  | 'PROCESSANDO'
  | 'CONCLUIDA'
  | 'RASCUNHO'
  | 'COLETANDO'
  | 'EM_REVISAO'
  | 'APROVADA'
  | 'EMITIDA'
  | 'ERRO';
export type ModoEntradaPesquisa = 'MANUAL' | 'PLANILHA';
export type TipoOrigemEvidencia =
  | 'FONTE_PUBLICA'
  | 'FORNECEDOR'
  | 'TABELA_REFERENCIA'
  | 'HISTORICO_INTERNO'
  | 'MANUAL';
export type StatusEvidencia = 'PENDENTE' | 'VALIDA' | 'DESCARTADA' | 'INVALIDA';
export type StatusItem = 'PENDENTE' | 'COTADO' | 'SEM_RESULTADO' | 'ERRO';
export type TipoFonte = 'API_REST' | 'SCRAPING' | 'TABELA_REFERENCIA';
export type StatusValidacaoFonte = 'VALIDA' | 'INVALIDA' | 'NAO_TESTADA';
export type MetodoCalculo = 'MEDIA' | 'MEDIANA' | 'MENOR_PRECO';
export type TipoNotificacao = 'PESQUISA_CONCLUIDA' | 'FONTE_FALHOU' | 'VARIACAO_PRECO' | 'SISTEMA';
export type StatusCotacaoDireta =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'RESPONDIDA'
  | 'RECUSADA'
  | 'CANCELADA'
  | 'VENCIDA';
export type AbrangenciaBuscaPncp = 'NACIONAL' | 'UF' | 'MUNICIPIO' | 'ORGAO';

export interface EscopoBuscaPncp {
  abrangencia: AbrangenciaBuscaPncp;
  dataInicial: string;
  dataFinal: string;
  uf?: string;
  municipio?: string;
  orgaoCnpj?: string;
}

export interface ResultadoBuscaOnline {
  id: string;
  status: string;
  escopoPncp: EscopoBuscaPncp;
  evidenciasCriadas: number;
  resultados: Array<{
    fonteId: string;
    slug: string;
    nome: string;
    consultadoEm: string;
    cache: boolean;
    preco: number | null;
    referencia: string | null;
    quantidade: number;
    erro: string | null;
  }>;
}

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  cargo: string | null;
  setor: string | null;
  municipio: string | null;
  uf: string | null;
  role: Role;
  ativo: boolean;
  prefNotifEmail: boolean;
  prefNotifInApp: boolean;
  createdAt: string;
}

export interface Pesquisa {
  id: string;
  titulo: string;
  descricao: string | null;
  status: StatusPesquisa;
  modoEntrada: ModoEntradaPesquisa;
  numeroProcesso: string | null;
  orgaoSetor: string | null;
  secretariaSolicitante: string | null;
  unidadeAdministrativa: string | null;
  responsavelPesquisa: string | null;
  responsavelRevisao: string | null;
  responsavelAprovacao: string | null;
  exercicioFinanceiro: number | null;
  modalidade: string | null;
  prazoDesejado: string | null;
  dotacaoOrcamentaria: string | null;
  observacoesGerais: string | null;
  dadosProcesso: Record<string, unknown> | null;
  metodoCalculoSnapshot: MetodoCalculo | null;
  metaOrigensMinima: number;
  limiteOutlierSnapshot: number | null;
  fontesSnapshot: unknown;
  aprovadaPorId: string | null;
  aprovadaEm: string | null;
  emitidaEm: string | null;
  versaoAtual: number;
  userId: string;
  totalItens: number;
  itensComCotacao: number;
  itensSemCotacao: number;
  itensComErro: number;
  resumoCobertura: string | null;
  arquivoEntradaUrl: string | null;
  arquivoSaidaUrl: string | null;
  compartilhada: boolean;
  linkCompartilhamento: string | null;
  municipio: string | null;
  uf: string | null;
  fundamentacaoLegal: string | null;
  valorTotalEstimado: string | null;
  erroProcessamento: string | null;
  jobId: string | null;
  concluidaEm: string | null;
  createdAt: string;
  updatedAt: string;
  itens?: ItemPesquisa[];
  user?: { nome: string; email: string };
}

export interface ItemPesquisa {
  id: string;
  pesquisaId: string;
  sequencia: number;
  nome: string;
  descricao: string;
  especificacao: string | null;
  marcaModelo: string | null;
  localEntrega: string | null;
  prazoEntregaDias: number | null;
  garantia: string | null;
  caracteristicasObrigatorias: string | null;
  caracteristicasDesejaveis: string | null;
  anexos: unknown;
  descricaoNormalizada: string | null;
  quantidade: string;
  unidadeMedida: string | null;
  cidade: string | null;
  uf: string | null;
  camposExtras: Record<string, unknown> | null;
  precoReferencia: string | null;
  precoTotal: string | null;
  statusItem: StatusItem;
  observacao: string | null;
  resultadoCalculo?: {
    metodo: string;
    metaOrigens: number;
    origensDistintas: number;
    evidenciasIndependentes?: number;
    completa: boolean;
  } | null;
  justificativaCobertura?: string | null;
  excecaoAprovadaEm?: string | null;
  cotacoes?: Cotacao[];
  cotacoesDiretas?: CotacaoDireta[];
  evidencias?: EvidenciaPreco[];
}

export interface EvidenciaPreco {
  id: string;
  itemPesquisaId: string;
  tipoOrigem: TipoOrigemEvidencia;
  origemChave: string;
  independenciaChave: string;
  fonte: string | null;
  cotacaoId: string | null;
  cotacaoDiretaId: string | null;
  chaveDedupe: string | null;
  possivelDuplicidade: boolean;
  orgaoCnpj: string | null;
  orgaoNome: string | null;
  pncpAno: number | null;
  pncpSequencial: number | null;
  pncpNumeroItem: number | null;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  tipoPreco: string | null;
  unidadeOriginal: string | null;
  descricaoOriginal: string | null;
  preco: string;
  dataReferencia: string | null;
  dataColeta: string;
  referencia: string | null;
  comprovanteUrl: string | null;
  status: StatusEvidencia;
  justificativa: string | null;
  revisadoPorId: string | null;
  revisadoEm: string | null;
}

export interface DocumentoPesquisa {
  id: string;
  pesquisaId: string;
  versao: number;
  arquivoXlsxUrl: string | null;
  arquivoPdfUrl: string | null;
  emitidoPorId: string | null;
  emitidoEm: string;
  emitidoPor?: { id: string; nome: string } | null;
}

export interface PreviaDocumentoPesquisa {
  snapshot: {
    schemaVersion: string;
    documento: {
      versao: number;
      emitidoEm: string;
      emissor: { id: string; nome: string };
      formatos: { xlsx: boolean; pdf: boolean; motivoPdf: string };
    };
    processo: {
      pesquisaId: string;
      titulo: string;
      numeroProcesso: string | null;
      orgaoSetor: string | null;
      responsavelPesquisa: string | null;
    };
    metodologia: {
      metodoCalculo: MetodoCalculo;
      metaOrigensMinima: number;
      limiteOutlierPercentual: number | null;
    };
    resumo: { totalItens: number; valorTotalEstimado: number | null; cobertura: string | null };
    itens: Array<{
      id: string;
      sequencia: number;
      descricao: string;
      precoReferencia: number | null;
      justificativaCobertura: string | null;
      resultadoCalculo: { origensDistintas?: number; completa?: boolean } | null;
      evidencias: EvidenciaPreco[];
    }>;
  };
  podeEmitir: boolean;
  recursoEmissaoHabilitado: boolean;
  bloqueios: {
    featureFlag: string | null;
    status: string | null;
    evidenciasPendentes: number;
    itensSemDecisao: Array<{ itemId: string; sequencia: number; descricao: string }>;
  };
}

export interface Cotacao {
  id: string;
  itemPesquisaId: string;
  fonte: string;
  preco: string | null;
  referencia: string | null;
  fundamentacaoArtigo: string | null;
  dataConsulta: string;
  erro: string | null;
  editadaManualmente: boolean;
  dadosBrutos?: unknown;
}

export interface CotacaoDireta {
  id: string;
  itemPesquisaId: string;
  fornecedorId: string;
  preco: string | null;
  status: StatusCotacaoDireta;
  justificativa: string;
  outlier: boolean;
  dataSolicitacao: string;
  dataEnvio: string | null;
  dataResposta: string | null;
  validadeAte: string | null;
  observacao: string | null;
  anexoSolicitacaoUrl: string | null;
  anexoRespostaUrl: string | null;
  fornecedor?: Fornecedor;
}

export interface FonteCotacao {
  id: string;
  nome: string;
  slug: string;
  tipo: TipoFonte;
  ativo: boolean;
  ordem: number;
  endpointBase: string | null;
  fundamentacaoArtigo: string | null;
  limiteResultados: number;
  timeoutMs: number;
  pausaMs: number;
  retries: number;
  statusValidacao: StatusValidacaoFonte;
  ultimoTesteEm: string | null;
  ultimoTesteResultado: unknown;
  createdAt: string;
}

export interface Fornecedor {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  contatoNome: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  origem: 'MANUAL' | 'PNCP';
  referenciaOrigem: string | null;
  ativo: boolean;
  createdAt: string;
}

export interface Notificacao {
  id: string;
  userId: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  lida: boolean;
  link: string | null;
  createdAt: string;
}

export interface ConfiguracaoSistema {
  id: string;
  nomeOrgao: string | null;
  cnpjOrgao: string | null;
  municipio: string | null;
  uf: string | null;
  brasaoUrl: string | null;
  responsavelTecnico: string | null;
  metodoCalculo: MetodoCalculo;
  limiteOutlierPercentual: number;
  minFontesCompleta: number;
  itemAmostraTeste: string;
  textosFundamentacao: unknown;
  smtpConfig: unknown;
  canalSuporte: unknown;
  secretarias: string[] | null;
  setores: string[] | null;
  textosAjuda: Record<string, string> | null;
  camposConfig: Record<string, unknown> | null;
  templatesRelatorio: Record<string, unknown> | null;
  janelaBuscaDias: number;
  updatedAt: string;
}

export interface SugestaoMelhoria {
  id: string;
  tipo: 'SUGESTAO' | 'ERRO' | 'DIFICULDADE' | 'NOVA_FUNCIONALIDADE';
  titulo: string;
  descricao: string;
  tela: string | null;
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  status: 'RECEBIDA' | 'EM_ANALISE' | 'PLANEJADA' | 'EM_DESENVOLVIMENTO' | 'CONCLUIDA' | 'RECUSADA';
  anexoUrl: string | null;
  comentarioInterno: string | null;
  createdAt: string;
  updatedAt: string;
  autor?: { id: string; nome: string } | null;
  responsavel?: { id: string; nome: string } | null;
}

export interface LogAuditoria {
  id: string;
  userId: string | null;
  acao: string;
  entidade: string | null;
  entidadeId: string | null;
  detalhe: unknown;
  ip: string | null;
  createdAt: string;
  user?: { nome: string; email: string } | null;
}

export interface ProgressoPesquisa {
  pesquisaId: string;
  status: StatusPesquisa;
  totalItens: number;
  processados: number;
  itensComCotacao: number;
  itensSemCotacao: number;
  itensComErro: number;
  itemAtual?: { sequencia: number; nome: string; statusItem: StatusItem } | null;
  tempoEstimadoSegundos?: number | null;
  resumoCobertura?: string | null;
}

export interface ItemPlanilhaEntrada {
  sequencia: number;
  nome: string;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  cidade?: string;
  uf?: string;
  camposExtras: Record<string, string | number | null>;
}

export interface ResultadoLeitura {
  colunas: Array<{ campo: string; tituloOriginal: string; indice: number }>;
  itens: ItemPlanilhaEntrada[];
  colunasExtras: string[];
  linhaCabecalho: number;
  operacoes?: Array<{
    acao: 'ADICIONAR' | 'ATUALIZAR' | 'IGNORAR';
    itemId?: string;
    item: ItemPlanilhaEntrada;
  }>;
}

export interface TesteResultado {
  ok: boolean;
  latenciaMs: number;
  amostraPreco: number | null;
  amostraReferencia: string | null;
  mensagem: string;
}

export interface PaginatedResponse<T> {
  total: number;
  pagina: number;
  limite: number;
  data: T[];
}
