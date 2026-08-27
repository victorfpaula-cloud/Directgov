import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — mostra todas as contas salvas em chatbot_accounts com seus
// IDs numéricos do Instagram, pra comparar com o sender.id que chega nos webhooks (achado em
// 26/08/2026: os eventos vêm com is_echo:true e sender.id="17841410315452202" mesmo quando a
// mensagem foi mandada de uma conta pessoal PARA a Empório Único — precisa confirmar se esse ID
// bate com o instagram_user_id salvo pra Empório Único ou não). Seguro apagar esse arquivo depois
// de resolver: não expõe token nenhum na resposta.
export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

export async function GET() {
  const admin = criarClienteAdmin();

  const { data: contas, error } = await admin
    .from("chatbot_accounts")
    .select("id, page_id, page_name, instagram_user_id, instagram_username, active, created_at")
    .order("created_at", { ascending: false });

  if (error || !contas || contas.length === 0) {
    return NextResponse.json(
      { erro: "Nenhuma conta encontrada em chatbot_accounts. Conecta uma conta primeiro." },
      { status: 404 }
    );
  }

  const contaMaisRecenteAtiva = contas.find((c) => c.active) ?? contas[0];

  const { data: contaComToken } = await admin
    .from("chatbot_accounts")
    .select("access_token")
    .eq("id", contaMaisRecenteAtiva.id)
    .maybeSingle();

  const resposta = contaComToken
    ? await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${contaMaisRecenteAtiva.page_id}/subscribed_apps?access_token=${encodeURIComponent(
          contaComToken.access_token
        )}`,
        { cache: "no-store" }
      )
    : null;

  const dados = resposta ? await resposta.json().catch(() => null) : null;

  return NextResponse.json({
    todasAsContasSalvas: contas.map((c) => ({
      pageName: c.page_name,
      pageId: c.page_id,
      instagramUserId: c.instagram_user_id,
      instagramUsername: c.instagram_username,
      ativa: c.active,
      criadaEm: c.created_at,
    })),
    contaUsadaPraCheckarInscricao: contaMaisRecenteAtiva.page_name,
    idDoNossoApp: "1458016982775252 (Chatbot Direct)",
    statusHttpDaInscricao: resposta?.status ?? null,
    respostaDaMetaSobreInscricao: dados,
  });
}
