import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Pausa/reativa uma conta inteira no chatbot — usado quando um cliente não paga ou algo assim.
// "Pausada" reaproveita a coluna `active` que já existia desde o começo do projeto: o webhook
// (src/app/api/webhook/instagram/route.ts) já só responde contas com `active = true`, então
// pausar por aqui já é suficiente pra deixar o bot em silêncio total nessa conta — nenhuma
// mudança precisou ser feita no webhook por causa disso.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const accountId = formData.get("account_id")?.toString();
  const ativar = formData.get("ativar")?.toString() === "1";

  if (!accountId) {
    return NextResponse.redirect(new URL("/contas", request.url));
  }

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("chatbot_accounts")
    .update({ active: ativar, updated_at: new Date().toISOString() })
    .eq("id", accountId);

  if (error) {
    console.error("Falha ao pausar/reativar conta:", error);
    return NextResponse.redirect(new URL(`/contas?erro=falha_ao_pausar`, request.url));
  }

  return NextResponse.redirect(new URL("/contas", request.url));
}
