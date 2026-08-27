import crypto from "node:crypto";

// Escreve linhas na planilha do Google usando uma Service Account (credencial de robô, separada
// do seu login pessoal). Se as variáveis de ambiente ainda não estiverem configuradas, essa
// função simplesmente não escreve na planilha (devolve false) e AVISA no log — mas nunca lança
// erro, porque a reserva já foi salva no banco antes de chegar aqui (ver src/lib/reservas.ts) e
// não pode se perder só porque a planilha ainda não foi conectada.

const ESCOPO = "https://www.googleapis.com/auth/spreadsheets";

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function obterTokenDeAcesso(): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const chavePrivadaBruta = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !chavePrivadaBruta) return null;

  // Na Vercel, quebras de linha dentro de uma variável de ambiente às vezes chegam como "\n"
  // literal (dois caracteres) em vez de quebra de linha de verdade — sem isso a chave PEM não é
  // reconhecida.
  const chavePrivada = chavePrivadaBruta.replace(/\\n/g, "\n");

  const agora = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: email,
      scope: ESCOPO,
      aud: "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    })
  );

  const assinador = crypto.createSign("RSA-SHA256");
  assinador.update(`${header}.${claims}`);
  assinador.end();
  const assinatura = base64Url(assinador.sign(chavePrivada));

  const jwt = `${header}.${claims}.${assinatura}`;

  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => "");
    console.error(`Falha ao obter token de acesso do Google (status ${resposta.status}):`, corpoErro);
    return null;
  }

  const dados = await resposta.json();
  return typeof dados?.access_token === "string" ? dados.access_token : null;
}

/**
 * Adiciona uma linha no final da planilha indicada. Devolve `true` se escreveu com sucesso,
 * `false` se não (credencial ausente, planilha sem permissão pra Service Account, etc.) — quem
 * chama essa função decide o que fazer com esse `false` (no nosso caso, só loga e segue, porque
 * a reserva já está salva no banco de qualquer jeito).
 */
export async function adicionarLinhaNaPlanilha(
  idDaPlanilha: string,
  valores: string[]
): Promise<boolean> {
  const token = await obterTokenDeAcesso();
  if (!token) {
    console.warn(
      "Credencial do Google Sheets não configurada (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) — reserva não foi escrita na planilha, mas está salva no banco."
    );
    return false;
  }

  const resposta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${idDaPlanilha}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [valores] }),
      cache: "no-store",
    }
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => "");
    console.error(`Falha ao escrever na planilha (status ${resposta.status}):`, corpoErro);
    return false;
  }

  return true;
}
