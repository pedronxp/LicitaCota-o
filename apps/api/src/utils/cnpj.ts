export function normalizarCnpj(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}

export function cnpjValido(valor: string): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
  const digito = (base: string, pesos: number[]) => {
    const soma = base
      .split('')
      .reduce((total, numero, indice) => total + Number(numero) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = digito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digito(
    `${cnpj.slice(0, 12)}${primeiro}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return cnpj.endsWith(`${primeiro}${segundo}`);
}
