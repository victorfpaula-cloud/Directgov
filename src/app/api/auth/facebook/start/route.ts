import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { montarUrlDeAutorizacao } from "@/lib/facebookOAuth";

// Chamado quando Victor clica em "Adicionar conta" em /contas. Gera um "state" aleatório (contra
// CSRF — garante que o retorno do Facebook realmente veio de um login que a gente iniciou),
// guarda ele no banco por um tempo curto, e manda o navegador pro diálogo de login do Facebook.
export async function GET() {
  const state = crypto.randomBytes(24).toString("hex");

  const admin = criarClienteAdmin();
  const { error } = await admin.from("chatbot_oauth_states").insert({ state });

  if (error) {
    return new NextResponse("Não foi possível iniciar a conexão. Tenta de novo em instantes.", {
      status: 500,
    });
  }

  return NextResponse.redirect(montarUrlDeAutorizacao(state));
}
