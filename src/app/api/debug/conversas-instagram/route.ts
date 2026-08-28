import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

const GRAPH_API_VERSION = "v21.0";

/**
 * Diagnóstico pontual (28/08/2026): chama a Conversations API da Meta diretamente
 * (GET /{page_id}/conversations) pra ver se ela devolve TAMBÉM as conversas que estão na pasta
 * "Pedidos" do Instagram — que o webhook normal (o "aviso automático" que a Meta empurra pra
 * gente) não está entregando.
 *
 * É só uma rota de LEITURA — não processa nada, não manda mensagem, não muda nenhum estado. Serve
 * só pra confirmar com dado real (em vez de achismo) se essa API consegue enxergar conversas que
 * hoje estão se perdendo, como base pra decidir se compensa construir uma busca periódica usando
 * ela como complemento do webhook.
 *
 * Uso: abrir no navegador
 *   /api/debug/conversas-instagram?instagram_username=_sejaunico
 * (troca pelo @ da conta que você quer conferir, sem o @).
 */
export async function GET(request: NextRequest) {
  const instagramUsername = request.nextUrl.searchParams.get("instagram_username");

  if (!instagramUsername) {
    return NextResponse.json(
      { erro: "Passa ?instagram_username=nome_da_conta na URL (sem @). Ex: ?instagram_username=_sejaunico" },
      { status: 400 }
    );
  }

  const admin = criarClienteAdmin();
  const { data: conta, error: erroAoBuscarConta } = await admin
    .from("chatbot_accounts")
    .select("id, page_id, page_name, instagram_username, access_token")
    .eq("instagram_username", instagramUsername)
    .maybeSingle();

  if (erroAoBuscarConta) {
    return NextResponse.json(
      { erro: "Falha ao buscar a conta no nosso banco.", detalhe: erroAoBuscarConta.message },
      { status: 500 }
    );
  }

  if (!conta) {
    return NextResponse.json(
      { erro: `Nenhuma conta conectada com o Instagram @${instagramUsername}.` },
      { status: 404 }
    );
  }

  // Pedido enxuto de propósito: a Meta devolveu erro genérico ("reduza a quantidade de dados")
  // quando pedíamos participants+updated_time+snippet+message_count+unread_count com limit=50 de
  // uma vez. Reduzido pro mínimo (só snippet + updated_time, limit menor) pra conseguir um
  // resultado — dá pra pedir mais campos depois, com calma, assim que confirmarmos que o básico
  // funciona.
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${conta.page_id}/conversations?platform=instagram&fields=snippet,updated_time&limit=10&access_token=${encodeURIComponent(
      conta.access_token
    )}`,
    { cache: "no-store" }
  );

  const dados = await resposta.json();

  if (!resposta.ok) {
    // A própria mensagem de erro da Meta já costuma dizer o motivo exato (permissão faltando,
    // parâmetro errado, etc.) — devolve ela inteira pra não ter que adivinhar.
    return NextResponse.json(
      { erro: "A Meta recusou o pedido.", status_http: resposta.status, detalhe_da_meta: dados },
      { status: 502 }
    );
  }

  return NextResponse.json({
    conta: conta.page_name,
    instagram: `@${conta.instagram_username}`,
    total_de_conversas_encontradas: Array.isArray(dados?.data) ? dados.data.length : 0,
    conversas: dados?.data ?? [],
  });
}
