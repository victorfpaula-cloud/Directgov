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

  if (!appSecret || !assinaturaRecebida) return false;

  const esperada =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(corpoBruto, "utf8").digest("hex");

  const bufferEsperado = Buffer.from(esperada, "utf8");
  const bufferRecebido = Buffer.from(assinaturaRecebida, "utf8");

  return (
    bufferEsperado.length === bufferRecebido.length &&
    crypto.timingSafeEqual(bufferEsperado, bufferRecebido)
  );
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

/**
 * Envia uma mensagem com botões de verdade (Button Template) — usado no fluxo de reserva
 * (Etapa 6) pra oferecer opções tocáveis (Hoje/Amanhã/Outro dia, Almoço/Jantar, Sim/Não). Esse é
 * o mesmo tipo de botão que aparece na captura de tela que o Victor mandou (o bot antigo do
 * SendPulse usava isso): o botão fica DENTRO da mensagem, junto com o texto, e continua visível
 * no histórico depois de tocado — diferente do formato anterior (quick replies), que aparecia só
 * como uma barrinha temporária em cima do teclado e sumia depois de usada.
 *
 * Limites da Meta pra esse formato: até 3 botões por mensagem, título de cada botão com até 20
 * caracteres, texto da mensagem com até ~640 caracteres — por isso o texto que chega aqui deve
 * ser sempre curto (a regra é: textos longos, tipo as Regras cadastradas, vão em mensagens de
 * texto simples separadas, nunca dentro de uma mensagem com botão).
 */
export async function enviarMensagemComBotoes(
  tokenDaConta: string,
  igsidDoCliente: string,
  texto: string,
  botoes: { titulo: string; payload: string }[]
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
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: texto,
              buttons: botoes.map((botao) => ({
                type: "postback",
                title: botao.titulo,
                payload: botao.payload,
              })),
            },
          },
        },
      }),
      cache: "no-store",
    }
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao enviar mensagem com botões pro Direct (status ${resposta.status}): ${corpoErro}`
    );
  }
}

/**
 * Busca nome e @usuário do Instagram de quem mandou a mensagem — usado no fluxo de reserva pra
 * não precisar perguntar o nome (Etapa 6). Se a chamada falhar por qualquer motivo, devolve um
 * nome genérico em vez de derrubar o fluxo inteiro por causa disso.
 */
export async function buscarPerfilDoCliente(
  tokenDaConta: string,
  instagramScopedId: string
): Promise<{ nome: string; username: string | null }> {
  try {
    const resposta = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramScopedId}?fields=name,username&access_token=${encodeURIComponent(
        tokenDaConta
      )}`,
      { cache: "no-store" }
    );

    if (!resposta.ok) return { nome: "Cliente", username: null };

    const dados = await resposta.json();
    return {
      nome: typeof dados?.name === "string" && dados.name ? dados.name : "Cliente",
      username: typeof dados?.username === "string" ? dados.username : null,
    };
  } catch (erro) {
    console.error("Falha ao buscar perfil do cliente no Instagram:", erro);
    return { nome: "Cliente", username: null };
  }
}
