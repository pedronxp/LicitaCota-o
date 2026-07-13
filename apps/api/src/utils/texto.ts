/**
 * Utilitários de normalização de texto, reutilizados pela leitura de planilha,
 * pelo motor de cotação e pelo catálogo de itens.
 */

/** Remove acentos e marcas diacríticas. */
export function removerAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza para comparação/chave: minúsculas, sem acento, sem pontuação
 * excessiva e com espaços colapsados.
 */
export function normalizarChave(texto: string): string {
  return removerAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compara dois títulos de coluna de forma tolerante. */
export function tituloEquivalente(a: string, b: string): boolean {
  return normalizarChave(a) === normalizarChave(b);
}
