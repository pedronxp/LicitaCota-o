import { logger } from '../utils/logger.js';

export function registrarMetrica(
  nome: string,
  valor: number,
  dimensoes: Record<string, string | number | boolean | null> = {},
): void {
  logger.info('METRICA', { nome, valor, dimensoes });
}
