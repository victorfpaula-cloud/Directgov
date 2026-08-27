import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const accountId = formData.get("account_id")?.toString();
  const tomDeVoz = formData.get("tom_de_voz")?.toString() ?? "";
  const guardrails = formData.get("guardrails")?.toString() ?? "";
  const baseConhecimento = formData.get("base_conhecimento")?.toString() ?? "";

  if (!accountId) {
    return NextResponse.redirect(new URL(`/contas`, request.url));
  }

  const admin = criarClienteAdmin();
  const { error } = await admin.from("chatbot_account_settings").upsert(
    {
      account_id: accountId,
      tom_de_voz: tomDeVoz,
      guardrails,
      base_conhecimento: baseConhecimento,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" }
  );

  if (error) {
    console.error("Falha ao salvar configuração do Gemini:", error);
    return NextResponse.redirect(
      new URL(
        `/contas/${accountId}/gemini?erro=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }

  return NextResponse.redirect(new URL(`/contas/${accountId}/gemini?salvo=1`, request.url));
}
