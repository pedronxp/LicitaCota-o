import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const dias = env.EVIDENCE_RAW_RETENTION_DAYS;
  if (!Number.isFinite(dias) || dias < 1)
    throw new Error('EVIDENCE_RAW_RETENTION_DAYS deve ser um número positivo.');
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const [evidencias, cotacoes, sessoes] = await prisma.$transaction([
    prisma.evidenciaPreco.updateMany({
      where: { dataColeta: { lt: limite }, dadosBrutos: { not: Prisma.DbNull } },
      data: { dadosBrutos: Prisma.DbNull },
    }),
    prisma.cotacao.updateMany({
      where: { dataConsulta: { lt: limite }, dadosBrutos: { not: Prisma.DbNull } },
      data: { dadosBrutos: Prisma.DbNull },
    }),
    prisma.sessaoBuscaOnline.updateMany({
      where: { iniciadoEm: { lt: limite } },
      data: { resultados: Prisma.DbNull, erros: Prisma.DbNull },
    }),
  ]);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      limite: limite.toISOString(),
      evidencias: evidencias.count,
      cotacoes: cotacoes.count,
      sessoes: sessoes.count,
    }),
  );
}

main().finally(() => prisma.$disconnect());
