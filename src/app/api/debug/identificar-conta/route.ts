import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — recebe um ID de conta do Instagram (?id=...) e pergunta pra
// Meta o @usuário e nome dono desse ID, usando o token de alguma conta ativa nossa (instagram_basic
// permite ler o perfil básico de QUALQUER conta profissional/criador, não só as nossas). Serve pra
// descobrir de quem é o ID "17841410315452202" que está aparecendo nos eventos de webhook, já que
// não é o ID da Empório Único (achado em 27/08/2026). Seguro apagar depois de resolver.
export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

export async function GET(request: NextRequest) {
  const idParaIdentificar = request.nextUrl.searchParams.get("id");

  if (!idParaIdentificar) {
    return NextResponse.json(
      { erro: "Passa o ID pra identificar, tipo ?id=17841410315452202" },
      { status: 400 }
    );
  }

  const admin = criarClienteAdmin();
  const { data: conta, error } = await admin
    .from("chatbot_accounts")
    .select("access_token")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error || !conta) {
    return NextResponse.json(
      { erro: "Nenhuma conta ativa encontrada pra emprestar o token." },
      { status: 404 }
    );
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${idParaIdentificar}?fields=username,name,ig_id&access_token=${encodeURIComponent(
      conta.access_token
    )}`,
    { cache: "no-store" }
  );

  const dados = await resposta.json().catch(() => null);

  return NextResponse.json({
    idConsultado: idParaIdentificar,
    statusHttp: resposta.status,
    respostaDaMeta: dados,
  });
}
