import { describe, expect, it } from 'vitest';
import { cnpjValido, normalizarCnpj } from './cnpj.js';

describe('validação de CNPJ', () => {
  it('normaliza máscara e valida dígitos verificadores', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita CNPJ repetido ou com dígito incorreto', () => {
    expect(cnpjValido('00.000.000/0000-00')).toBe(false);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
  });
});
