import crypto from "node:crypto";

const GRAPH_API_VERSION = "v21.0";

/**
 * Confere a assinatura X-Hub-Signature-256 que a Meta manda em todo webhook, calculada em cima
 * do corpo BRUTO (raw) da requisição usando o App Secret como chave HMAC-SHA256. Isso garante
 * que a chamada realmente veio da Meta, e não de qualquer um que descubra a URL do webhook.
 * Comparação em tempo constante (timingSafeEqual) pra não vazar informação por tempo de resposta.
 */
export function assinaturaValida(corpoBruto: string, assinaturaRecebida: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;

  // Log temporário de diagnóstico (26/08/2026) — nenhuma das linhas abaixo expõe o App Secret:
  // a assinatura em si é só um hash (não dá pra voltar pro segredo a partir dela), e o
  // comprimento do segredo não revela o valor. Serve só pra descobrir por que a validação está
  // recusando toda mensagem de verdade da Meta. Remover depois de resolver.
  if (!appSecret) {
    console.error("[webhook diagnóstico] META_APP_SECRET não está definido no ambiente.");
    return false;
  }

  if (!assinaturaRecebida) {
    console.error(
      "[webhook diagnóstico] A requisição não trouxe o header x-hub-signature-256 nenhum."
    );
    return false;
  }

  const esperada =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(corpoBruto, "utf8").digest("hex");

  const bufferEsperado = Buffer.from(esperada, "utf8");
  const bufferRecebido = Buffer.from(assinaturaRecebida, "utf8");

  const bate =
    bufferEsperado.length === bufferRecebido.length &&
    crypto.timingSafeEqual(bufferEsperado, bufferRecebido);

  if (!bate) {
    console.error("[webhook diagnóstico] Assinatura não bateu.", {
      assinaturaRecebida,
      assinaturaEsperada: esperada,
      tamanhoDoAppSecret: appSecret.length,
      tamanhoDoCorpoBruto: corpoBruto.length,
    });
  }

  return bate;
}

/**
 * Envia uma mensagem de texto pro Direct de um cliente, usando o token de acesso da Página
 * conectada (mesmo padrão de conexão via Facebook Login que o agendador já usa). O endpoint
 * oficial é `/me/messages` (a Meta resolve pra Página certa a partir do próprio token) — não
 * `/{page-id}/messages`, confirmado na documentação da Instagram Messaging API.
 */
export async function enviarMensagemDirect(
  tokenDaConta: string,
  igsidDoCliente: string,
  texto: string
): Promise<void> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(
      tokenDaConta
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: igsidDoCliente },
        message: { text: texto },
      }),
      cache: "no-store",
    }
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao enviar mensagem pro Direct (status ${resposta.status}): ${corpoErro}`
    );
  }
}
