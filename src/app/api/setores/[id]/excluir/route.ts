import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Não deixa excluir o setor "Geral" (eh_geral = true) — ele é o fallback obrigatório de toda
// prefeitura (o índice único parcial do schema já garante que só existe um por prefeitura).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const prefeituraId = formData.get("prefeitura_id")?.toString();

  const admin = criarClienteAdmin();

  const { data: setor } = await admin
    .from("directgov_setores")
    .select("eh_geral")
    .eq("id", params.id)
    .maybeSingle();

  const destinoLista = prefeituraId ? `/prefeituras/${prefeituraId}` : "/prefeituras";
  const destinoSetor = prefeituraId
    ? `/prefeituras/${prefeituraId}/setores/${params.id}`
    : "/prefeituras";

  if (setor?.eh_geral) {
    return NextResponse.redirect(
      new URL(
        `${destinoSetor}?erro=${encodeURIComponent("O setor Geral não pode ser excluído.")}`,
        request.url
      )
    );
  }

  const { error } = await admin.from("directgov_setores").delete().eq("id", params.id);

  if (error) {
    console.error("Falha ao excluir setor:", error);
    return NextResponse.redirect(
      new URL(`${destinoSetor}?erro=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(destinoLista, request.url));
}
