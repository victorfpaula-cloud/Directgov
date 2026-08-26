// Fluxo de conexão de conta via Facebook Login — mesmo padrão de duas etapas que o agendador já
// usa (OAuth → escolher qual Página conectar), só que gerando um cadastro e um token totalmente
// separados dos que o agendador guarda.

const GRAPH_API_VERSION = "v21.0";

// Escopos mínimos: enxergar a lista de Páginas do usuário, ler engajamento básico (exigido
// junto com pages_show_list em apps novos), e as permissões do Instagram — usando os nomes
// "clássicos" (instagram_basic / instagram_manage_messages), que são os aceitos pelo diálogo
// clássico do Facebook (facebook.com/dialog/oauth) usado no fluxo "Login do Facebook para
// Empresas". As versões "instagram_business_*" são da API separada de "Instagram API with
// Instagram Login" (login pelo instagram.com) — o Facebook rejeita elas aqui com "Invalid
// Scopes" porque não é esse o fluxo que estamos usando (corrigido em 26/08/2026).
const ESCOPOS = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_messages",
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
 * Busca a conta do Instagram profissional vinculada a UMA Página específica, usando o token da
 * própria Página (não o token do usuário). Separado em duas chamadas — em vez de pedir o campo
 * aninhado "instagram_business_account" já na listagem de /me/accounts — porque é exatamente o
 * jeito que o agendador faz (conferido no código dele em 26/08/2026) e é o único jeito que
 * comprovadamente mostra TODAS as Páginas certo, sem sumir com nenhuma.
 */
async function buscarContaInstagramDaPagina(
  pageId: string,
  pageAccessToken: string
): Promise<{ id: string; username: string | null } | null> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(
      pageAccessToken
    )}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) return null;

  const dados = await resposta.json();
  const conta = dados?.instagram_business_account as { id: string; username?: string } | undefined;
  if (!conta?.id) return null;

  return { id: conta.id, username: conta.username ?? null };
}

/**
 * Lista as Páginas que o usuário administra e, pra cada uma, busca a conta do Instagram
 * profissional vinculada (só entram na lista as Páginas que TÊM uma conta do Instagram
 * conectada — sem isso não tem como receber Direct).
 *
 * Feito em duas etapas (primeiro TODAS as Páginas, depois o Instagram de cada uma separado) —
 * corrigido em 26/08/2026 porque a versão anterior, que pedia tudo numa chamada só, estava
 * fazendo várias Páginas sumirem da lista sem motivo aparente (só 4 de muitas apareciam). Com
 * "limit=100" também, igual o agendador usa, pra não cortar quem administra muitas Páginas.
 */
export async function listarPaginasComInstagram(
  tokenDeUsuario: string
): Promise<PaginaComInstagram[]> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(
      tokenDeUsuario
    )}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    throw new Error(`Falha ao listar Páginas do usuário (status ${resposta.status}).`);
  }

  const dados = await resposta.json();
  const paginas: any[] = Array.isArray(dados?.data) ? dados.data : [];

  const resultados = await Promise.all(
    paginas.map(async (pagina) => {
      const contaInstagram = await buscarContaInstagramDaPagina(pagina.id, pagina.access_token);
      if (!contaInstagram) return null;

      return {
        page_id: pagina.id as string,
        page_name: pagina.name as string,
        page_access_token: pagina.access_token as string,
        instagram_user_id: contaInstagram.id,
        instagram_username: contaInstagram.username,
      };
    })
  );

  return resultados.filter((item): item is PaginaComInstagram => item !== null);
}
