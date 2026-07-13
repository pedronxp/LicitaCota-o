/** Cliente HTTP com timeout, orçamento total e tentativas limitadas. */

export interface RespostaHttp {
  ok: boolean;
  status: number;
  corpoTexto: string;
  corpoJson: unknown;
  latenciaMs: number;
}

export interface OpcoesHttp {
  metodo?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  pausaMs?: number;
  maxTempoTotalMs?: number;
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroRecuperavel(e: unknown): boolean {
  const erro = e as Error & { code?: string; cause?: { code?: string } };
  const codigo = erro?.code ?? erro?.cause?.code;
  return (
    erro?.name === 'AbortError' ||
    erro?.name === 'TimeoutError' ||
    erro instanceof TypeError ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(codigo ?? '')
  );
}

export async function requisitar(url: string, opcoes: OpcoesHttp = {}): Promise<RespostaHttp> {
  const metodo = opcoes.metodo ?? 'GET';
  const headers = opcoes.headers ?? {};
  const timeoutMs = Math.max(500, opcoes.timeoutMs ?? 15_000);
  const retries = Math.max(0, Math.min(opcoes.retries ?? 2, 3));
  const pausaMs = Math.max(0, opcoes.pausaMs ?? 500);
  const maxTempoTotalMs = Math.max(
    timeoutMs,
    opcoes.maxTempoTotalMs ?? timeoutMs * (retries + 1) + pausaMs * retries,
  );
  const inicioTotal = Date.now();
  let ultimoErro: unknown;

  for (let tentativa = 0; tentativa <= retries; tentativa++) {
    const restante = maxTempoTotalMs - (Date.now() - inicioTotal);
    if (restante <= 0) break;

    const controller = new AbortController();
    const timeoutEfetivo = Math.min(timeoutMs, restante);
    const timer = setTimeout(() => controller.abort(), timeoutEfetivo);
    const inicio = Date.now();
    try {
      const resp = await fetch(url, {
        method: metodo,
        headers: {
          Accept: 'application/json, text/html, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; LicitaPrecoBot/1.0; +https://licitapreco.gov.br)',
          ...headers,
        },
        signal: controller.signal,
      });
      const latenciaMs = Date.now() - inicio;
      const corpoTexto = await resp.text();
      let corpoJson: unknown = null;
      try {
        corpoJson = corpoTexto ? JSON.parse(corpoTexto) : null;
      } catch {
        corpoJson = null;
      }

      const temporario = [408, 425, 429, 500, 502, 503, 504].includes(resp.status);
      if (temporario && tentativa < retries) {
        ultimoErro = new Error(`HTTP ${resp.status}`);
        const espera = Math.min(
          pausaMs * (tentativa + 1),
          Math.max(0, maxTempoTotalMs - (Date.now() - inicioTotal)),
        );
        if (espera > 0) await dormir(espera);
        continue;
      }
      return { ok: resp.ok, status: resp.status, corpoTexto, corpoJson, latenciaMs };
    } catch (e) {
      ultimoErro = e;
      if (tentativa < retries && erroRecuperavel(e)) {
        const espera = Math.min(
          pausaMs * (tentativa + 1),
          Math.max(0, maxTempoTotalMs - (Date.now() - inicioTotal)),
        );
        if (espera > 0) await dormir(espera);
        continue;
      }
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  const timeout =
    (ultimoErro as Error | undefined)?.name === 'AbortError' ||
    (ultimoErro as Error | undefined)?.name === 'TimeoutError' ||
    Date.now() - inicioTotal >= maxTempoTotalMs;
  const mensagem = timeout
    ? `Tempo de resposta excedido (limite total de ${maxTempoTotalMs}ms)`
    : ultimoErro instanceof Error
      ? ultimoErro.message
      : 'Erro de rede desconhecido';
  throw new Error(mensagem);
}

/** Substitui placeholders {chave} em um template de string. */
export function aplicarPlaceholders(template: string, valores: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, chave: string) => valores[chave] ?? '');
}

export function montarQueryString(params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) sp.append(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}
