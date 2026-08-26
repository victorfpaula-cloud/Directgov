import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — pergunta direto pra Meta quais Aplicativos estão inscritos
// pra receber mensagem da Página conectada. Serve pra confirmar (ou descartar) a suspeita de
// que outro app, diferente do Chatbot Direct, esteja entregando os eventos de webhook — o que
// explicaria por que nenhum valor de App Secret bate (26/08/2026). Seguro apagar esse arquivo
// depois de resolver: não expõe token nenhum na resposta.
export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

export async function GET() {
  const admin = criarClienteAdmin();

  const { data: conta, error } = await admin
    .from("chatbot_accounts")
    .select("page_id, page_name, access_token")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !conta) {
    return NextResponse.json(
      { erro: "Nenhuma conta ativa encontrada em chatbot_accounts. Conecta uma conta primeiro." },
      { status: 404 }
    );
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${conta.page_id}/subscribed_apps?access_token=${encodeURIComponent(
      conta.access_token
    )}`,
    { cache: "no-store" }
  );

  const dados = await resposta.json().catch(() => null);

  return NextResponse.json({
    pagina: conta.page_name,
    pageId: conta.page_id,
    idDoNossoApp: "1458016982775252 (Chatbot Direct)",
    statusHttp: resposta.status,
    respostaDaMeta: dados,
  });
}
