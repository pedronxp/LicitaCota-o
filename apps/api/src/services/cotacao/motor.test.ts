import { describe, expect, it } from 'vitest';
import { calcularPrecoReferencia, descartarOutliers, media, mediana } from './calculo.js';
import { extrairPreco, parsearPreco, resolverLista } from './extrator.js';
import {
  expandirAbreviacoes,
  gerarCascata,
  limpar,
  montarItemNormalizado,
  normalizarDescricao,
} from './normalizacao.service.js';
import { normalizarChave, removerAcentos, tituloEquivalente } from '../../utils/texto.js';
import { contratacaoDentroEscopo, matcherTermos } from './pncp.adapter.js';

describe('normalização adaptativa', () => {
  it('remove acentos e normaliza chaves', () => {
    expect(removerAcentos('Cotação, ação e crochê')).toBe('Cotacao, acao e croche');
    expect(normalizarChave('  Agulha Nº 18 — MÃO  ')).toBe('agulha n 18 mao');
    expect(tituloEquivalente('Descrição', 'DESCRICAO')).toBe(true);
  });

  it('expande unidades e gera buscas progressivamente menores', () => {
    expect(expandirAbreviacoes('acetona 500 ml cx')).toBe('acetona 500 mililitros caixa');
    expect(gerarCascata('agulha de croche caixa 50 unidades')).toEqual([
      'agulha de croche caixa 50 unidades',
      'agulha croche caixa 50 unidades',
      'agulha croche caixa',
      'agulha croche',
      'agulha 50',
    ]);
    expect(gerarCascata('pendrive sandisk 16gb')).toContain('pendrive 16gb');
  });

  it('aplica dicionário e não duplica nome quando nome e descrição são iguais', () => {
    const item = montarItemNormalizado(
      {
        nome: 'Papel A4 75g',
        descricao: 'Papel A4 75g',
        quantidade: 10,
        unidadeMedida: 'Resma',
      },
      [{ termo: 'papel a4', sinonimos: ['papel sulfite'], expansoes: ['resma', '500 folhas'] }],
    );
    expect(item.descricaoNormalizada).toBe('papel a4 75g resma 500 folhas');
    expect(item.cascata[0]).not.toContain('papel a4 75g papel a4 75g');
  });

  it('limpa pontuação sem perder números de especificação', () => {
    expect(limpar('Agulha de crochê 3,5mm; caixa c/ 50')).toBe('agulha de croche 3,5mm caixa c 50');
    expect(normalizarDescricao('Caneta esferográfica azul', []).cascata).toContain(
      'caneta esferografica azul',
    );
  });

  it('exige o núcleo do produto e tolera plural e especificação separada', () => {
    expect(matcherTermos(['pendrive 16gb'], 'PENDRIVE USB 16 GB')).toBe(true);
    expect(matcherTermos(['pendrive 16gb'], 'TABLET COM MEMÓRIA INTERNA EMMC 16GB')).toBe(false);
    expect(matcherTermos(['pendrive 16gb'], 'PENDRIVE USB 32 GB')).toBe(false);
    expect(
      matcherTermos(
        ['pendrive 16gb'],
        `SISTEMA COM RESOLUÇÃO DE 16 BITS ${'componente '.repeat(40)} gravação em pendrive e HD externo com memória em GB`,
      ),
    ).toBe(false);
    expect(
      matcherTermos(['barbante 4 fios 1kg'], 'KIT LOCALIZADOR DE FIOS PARA CABOS 4X4 1 KG'),
    ).toBe(false);
    expect(matcherTermos(['barbante 4 fios 1kg'], 'BARBANTE 8 FIOS 1 KG')).toBe(false);
    expect(
      matcherTermos(
        ['acetona removedor esmaltes 500ml'],
        'Removedor de esmalte à base de acetona, 500 ml',
      ),
    ).toBe(true);
  });
});

describe('abrangência PNCP', () => {
  const contratacao = {
    orgaoEntidade: { cnpj: '12345678000190', razaoSocial: 'Órgão A' },
    unidadeOrgao: { municipioNome: 'Cataguases', ufSigla: 'MG' },
    anoCompra: 2026,
    sequencialCompra: 1,
  };
  const periodo = { dataInicial: '2025-07-01', dataFinal: '2026-07-01' };

  it('aceita nacional e filtra UF e município', () => {
    expect(contratacaoDentroEscopo(contratacao, { abrangencia: 'NACIONAL', ...periodo })).toBe(
      true,
    );
    expect(contratacaoDentroEscopo(contratacao, { abrangencia: 'UF', uf: 'MG', ...periodo })).toBe(
      true,
    );
    expect(contratacaoDentroEscopo(contratacao, { abrangencia: 'UF', uf: 'SP', ...periodo })).toBe(
      false,
    );
    expect(
      contratacaoDentroEscopo(contratacao, {
        abrangencia: 'MUNICIPIO',
        uf: 'MG',
        municipio: 'cataguases',
        ...periodo,
      }),
    ).toBe(true);
  });

  it('filtra órgão por CNPJ normalizado', () => {
    expect(
      contratacaoDentroEscopo(contratacao, {
        abrangencia: 'ORGAO',
        orgaoCnpj: '12.345.678/0001-90',
        ...periodo,
      }),
    ).toBe(true);
    expect(
      contratacaoDentroEscopo(contratacao, {
        abrangencia: 'ORGAO',
        orgaoCnpj: '00000000000000',
        ...periodo,
      }),
    ).toBe(false);
  });
});

describe('extração e cálculo de preços', () => {
  it('interpreta números brasileiros, americanos e valores numéricos', () => {
    expect(parsearPreco('R$ 1.234,56')).toBe(1234.56);
    expect(parsearPreco('31.96')).toBe(31.96);
    expect(parsearPreco(0.81)).toBe(0.81);
    expect(parsearPreco('0')).toBeNull();
  });

  it('resolve respostas em array ou propriedade data', () => {
    expect(resolverLista({ data: [{ valor: 'R$ 9,90' }] }, 'data')).toHaveLength(1);
    expect(extrairPreco({ valorUnitarioHomologado: '9,90' }, ['valorUnitarioHomologado'])).toBe(
      9.9,
    );
  });

  it('calcula usando as três cotações individuais', () => {
    const resultado = calcularPrecoReferencia([31.96, 0.81, 1.37], {
      metodo: 'MEDIA',
      limiteOutlierPercentual: 3000,
      minFontes: 3,
    });
    expect(resultado.fontesComPreco).toBe(3);
    expect(resultado.completa).toBe(true);
    expect(resultado.precoReferencia).toBe(11.38);
    expect(media([1, 2, 3])).toBe(2);
    expect(mediana([3, 1, 2])).toBe(2);
  });

  it('remove outliers sem zerar a amostra', () => {
    expect(descartarOutliers([10, 11, 1000], 30)).toEqual({
      mantidos: [10, 11],
      descartados: [1000],
    });
  });
});
