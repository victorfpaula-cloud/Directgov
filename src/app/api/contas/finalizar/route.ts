import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { PaginaComInstagram } from "@/lib/facebookOAuth";

const GRAPH_API_VERSION = "v21.0";

// Sem isso, a Página nunca avisa o Facebook que quer mandar eventos (mensagens de Direct) pro
// nosso app — mesmo com o webhook configurado certinho no painel do Meta, sem essa "inscrição"
// por Página nenhuma mensagem chega no nosso endpoint. Faltava essa chamada (26/08/2026, achado
// ao testar a primeira conta de ponta a ponta e a resposta automática não chegar).
async function inscreverPaginaNoWebhook(pageId: string, pageAccessToken: string): Promise<boolean> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(
      pageAccessToken
    )}`,
    { method: "POST", cache: "no-store" }
  );

  return resposta.ok;
}

// Recebe a escolha de qual Página/conta do Instagram conectar (formulário de /contas/conectar),
// grava a conta de verdade em chatbot_accounts, inscreve a Página no webhook do app, e apaga a
// conexão pendente (já não serve mais).
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const idPendente = formData.get("pendente")?.toString();
  const pageIdEscolhido = formData.get("page_id")?.toString();

  if (!idPendente || !pageIdEscolhido) {
    return NextResponse.redirect(new URL("/contas?erro=escolha_invalida", request.url));
  }

  const admin = criarClienteAdmin();

  const { data: pendente, error: erroAoBuscar } = await admin
    .from("chatbot_pending_connections")
    .select("pages")
    .eq("id", idPendente)
    .maybeSingle();

  if (erroAoBuscar || !pendente) {
    return NextResponse.redirect(new URL("/contas?erro=conexao_expirada", request.url));
  }

  const paginas = pendente.pages as PaginaComInstagram[];
  const paginaEscolhida = paginas.find((p) => p.page_id === pageIdEscolhido);

  if (!paginaEscolhida) {
    return NextResponse.redirect(new URL("/contas?erro=pagina_nao_encontrada", request.url));
  }

  const { error: erroAoSalvarConta } = await admin.from("chatbot_accounts").upsert(
    {
      instagram_user_id: paginaEscolhida.instagram_user_id,
      page_id: paginaEscolhida.page_id,
      page_name: paginaEscolhida.page_name,
      instagram_username: paginaEscolhida.instagram_username,
      access_token: paginaEscolhida.page_access_token,
      active: true,
    },
    { onConflict: "instagram_user_id" }
  );

  // A conexão pendente só serve uma vez, dá pra apagar mesmo se o passo seguinte falhar.
  await admin.from("chatbot_pending_connections").delete().eq("id", idPendente);

  if (erroAoSalvarConta) {
    return NextResponse.redirect(new URL("/contas?erro=falha_ao_salvar_conta", request.url));
  }

  const inscricaoOk = await inscreverPaginaNoWebhook(
    paginaEscolhida.page_id,
    paginaEscolhida.page_access_token
  );

  if (!inscricaoOk) {
    // A conta já foi salva — só a inscrição no webhook falhou. Avisa mas não desfaz a conexão.
    return NextResponse.redirect(
      new URL("/contas?conectada=1&aviso=falha_ao_inscrever_webhook", request.url)
    );
  }

  return NextResponse.redirect(new URL("/contas?conectada=1", request.url));
}
