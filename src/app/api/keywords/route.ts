import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const accountId = formData.get("account_id")?.toString();
  const variacoesTexto = formData.get("variacoes")?.toString() ?? "";

  if (!accountId) {
    return NextResponse.redirect(new URL(`/contas`, request.url));
  }

  if (!variacoesTexto.trim()) {
    return NextResponse.redirect(
      new URL(
        `/contas/${accountId}/palavras-chave?erro=${encodeURIComponent(
          "Precisa preencher pelo menos uma palavra-chave."
        )}`,
        request.url
      )
    );
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
  const { error } = await admin.from("chatbot_keywords").insert({
    account_id: accountId,
    variacoes,
    mensagens,
  });

  if (error) {
    // Captura o motivo de verdade, em vez da tela só "sumir" sem explicar nada (achado em
    // 27/08/2026 — a primeira versão não checava esse erro).
    console.error("Falha ao salvar palavra-chave:", error);
    return NextResponse.redirect(
      new URL(
        `/contas/${accountId}/palavras-chave?erro=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }

  return NextResponse.redirect(new URL(`/contas/${accountId}/palavras-chave`, request.url));
}
