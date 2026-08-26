// Fluxo de conexão de conta via Facebook Login — mesmo padrão de duas etapas que o agendador já
// usa (OAuth → escolher qual Página conectar), só que gerando um cadastro e um token totalmente
// separados dos que o agendador guarda.

const GRAPH_API_VERSION = "v21.0";

// Escopos mínimos: enxergar a lista de Páginas do usuário, ler engajamento básico (exigido
// junto com pages_show_list em apps novos), e as duas permissões do Instagram já confirmadas
// como "Pronto para teste" no painel do app (ver plano-chatbot-direct.md).
const ESCOPOS = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_business_basic",
  "instagram_business_manage_messages",
].join(",");

function urlBaseDoApp(): string {
  // Domínio fixo do projeto na Vercel (não muda entre deploys, diferente da URL com hash).
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://chatbot-direct.vercel.app";
}

export function urlDeCallback(): string {
  return `${urlBaseDoApp()}/api/auth/facebook/callback`;
}

export function montarUrlDeAutorizacao(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: urlDeCallback(),
    state,
    scope: ESCOPOS,
    response_type: "code",
  });

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function trocarCodigoPorToken(codigo: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: urlDeCallback(),
    code: codigo,
  });

  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    throw new Error(`Falha ao trocar o código pelo token (status ${resposta.status}).`);
  }

  const dados = await resposta.json();
  return dados.access_token as string;
}

export async function trocarPorTokenDeLongaDuracao(tokenCurto: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    fb_exchange_token: tokenCurto,
  });

  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    throw new Error(`Falha ao gerar token de longa duração (status ${resposta.status}).`);
  }

  const dados = await resposta.json();
  return dados.access_token as string;
}

export type PaginaComInstagram = {
  page_id: string;
  page_name: string;
  page_access_token: string;
  instagram_user_id: string;
  instagram_username: string | null;
};

/**
 * Lista as Páginas que o usuário administra e, pra cada uma, busca a conta do Instagram
 * profissional vinculada (só entram na lista as Páginas que TÊM uma conta do Instagram
 * conectada — sem isso não tem como receber Direct).
 */
export async function listarPaginasComInstagram(
  tokenDeUsuario: string
): Promise<PaginaComInstagram[]> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(
      tokenDeUsuario
    )}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    throw new Error(`Falha ao listar Páginas do usuário (status ${resposta.status}).`);
  }

  const dados = await resposta.json();
  const paginas: any[] = Array.isArray(dados?.data) ? dados.data : [];

  return paginas
    .filter((pagina) => pagina.instagram_business_account?.id)
    .map((pagina) => ({
      page_id: pagina.id,
      page_name: pagina.name,
      page_access_token: pagina.access_token,
      instagram_user_id: pagina.instagram_business_account.id,
      instagram_username: pagina.instagram_business_account.username ?? null,
    }));
}
