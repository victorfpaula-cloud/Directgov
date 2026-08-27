import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const accountId = formData.get("account_id")?.toString();
  const variacoesTexto = formData.get("variacoes")?.toString() ?? "";

  if (!accountId || !variacoesTexto.trim()) {
    return NextResponse.redirect(new URL(`/contas`, request.url));
  }

  const variacoes = variacoesTexto
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  const mensagens: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const texto = formData.get(`mensagem_${i}`)?.toString().trim();
    if (texto) mensagens.push(texto);
  }

  const admin = criarClienteAdmin();
  await admin.from("chatbot_keywords").insert({
    account_id: accountId,
    variacoes,
    mensagens,
  });

  return NextResponse.redirect(new URL(`/contas/${accountId}/palavras-chave`, request.url));
}
