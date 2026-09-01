import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const prefeituraId = formData.get("prefeitura_id")?.toString();
  const nome = formData.get("nome")?.toString().trim() ?? "";

  if (!prefeituraId) {
    return NextResponse.redirect(new URL("/prefeituras", request.url));
  }

  if (!nome) {
    return NextResponse.redirect(
      new URL(
        `/prefeituras/${prefeituraId}/setores/novo?erro=${encodeURIComponent(
          "Precisa preencher o nome do setor."
        )}`,
        request.url
      )
    );
  }

  const admin = criarClienteAdmin();

  // Setores customizados entram no fim da lista de exibição — soma 1 na maior "ordem" já usada
  // nessa prefeitura (começa em 1 se ainda não tiver nenhum setor).
  const { data: maiorOrdem } = await admin
    .from("directgov_setores")
    .select("ordem")
    .eq("prefeitura_id", prefeituraId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("directgov_setores").insert({
    prefeitura_id: prefeituraId,
    nome,
    ordem: (maiorOrdem?.ordem ?? 0) + 1,
  });

  if (error) {
    console.error("Falha ao criar setor:", error);
    return NextResponse.redirect(
      new URL(
        `/prefeituras/${prefeituraId}/setores/novo?erro=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }

  return NextResponse.redirect(new URL(`/prefeituras/${prefeituraId}`, request.url));
}
