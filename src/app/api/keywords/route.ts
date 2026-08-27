import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const accountId = formData.get("account_id")?.toString();
  const palavraChave = formData.get("palavra_chave")?.toString().trim() ?? "";
  const pausaTexto = formData.get("pausa_entre_mensagens_ms")?.toString().trim();

  if (!accountId) {
    return NextResponse.redirect(new URL(`/contas`, request.url));
  }

  if (!palavraChave) {
    return NextResponse.redirect(
      new URL(
        `/contas/${accountId}/palavras-chave?erro=${encodeURIComponent(
          "Precisa preencher pelo menos uma palavra-chave."
        )}`,
        request.url
      )
    );
  }

  const mensagens: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const texto = formData.get(`mensagem_${i}`)?.toString().trim();
    if (texto) mensagens.push(texto);
  }

  const pausaEntreMensagensMs = pausaTexto ? Number(pausaTexto) : 0;

  const admin = criarClienteAdmin();
  const { error } = await admin.from("chatbot_keywords").insert({
    account_id: accountId,
    palavra_chave: palavraChave,
    mensagens,
    pausa_entre_mensagens_ms: Number.isFinite(pausaEntreMensagensMs) ? pausaEntreMensagensMs : 0,
    ativo: true,
  });

  if (error) {
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
