import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = criarClienteAdmin();

  const { data: palavraChave } = await admin
    .from("chatbot_keywords")
    .select("account_id")
    .eq("id", params.id)
    .maybeSingle();

  await admin.from("chatbot_keywords").delete().eq("id", params.id);

  const destino = palavraChave?.account_id
    ? `/contas/${palavraChave.account_id}/palavras-chave`
    : "/contas";

  return NextResponse.redirect(new URL(destino, request.url));
}

