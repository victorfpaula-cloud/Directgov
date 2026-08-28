import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Exclui uma conta permanentemente. As tabelas relacionadas (chatbot_account_settings,
// chatbot_keywords, chatbot_conversations, chatbot_reservations, chatbot_atendimentos,
// chatbot_processed_messages) têm `on delete cascade` pro account_id, então apagar a linha em
// chatbot_accounts já limpa tudo sozinho — não precisa apagar tabela por tabela aqui.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const accountId = formData.get("account_id")?.toString();

  if (!accountId) {
    return NextResponse.redirect(new URL("/contas", request.url));
  }

  const admin = criarClienteAdmin();
  const { error } = await admin.from("chatbot_accounts").delete().eq("id", accountId);

  if (error) {
    console.error("Falha ao excluir conta:", error);
    return NextResponse.redirect(new URL(`/contas?erro=falha_ao_excluir`, request.url));
  }

  return NextResponse.redirect(new URL("/contas?excluida=1", request.url));
}
