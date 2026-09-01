import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const prefeituraId = formData.get("prefeitura_id")?.toString();
  const nome = formData.get("nome")?.toString().trim() ?? "";

  if (!prefeituraId) {
    return NextResponse.redirect(new URL("/prefeituras", request.url));
  }

  const destino = `/prefeituras/${prefeituraId}/setores/${params.id}`;

  if (!nome) {
    return NextResponse.redirect(
      new URL(
        `${destino}?erro=${encodeURIComponent("Precisa preencher o nome do setor.")}`,
        request.url
      )
    );
  }

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("directgov_setores")
    .update({
      nome,
      ativo: formData.get("ativo")?.toString() === "1",
      endereco: formData.get("endereco")?.toString().trim() || null,
      telefone: formData.get("telefone")?.toString().trim() || null,
      email: formData.get("email")?.toString().trim() || null,
      horario_atendimento: formData.get("horario_atendimento")?.toString().trim() || null,
      responsavel: formData.get("responsavel")?.toString().trim() || null,
      base_conhecimento_texto: formData.get("base_conhecimento_texto")?.toString() ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    console.error("Falha ao salvar setor:", error);
    return NextResponse.redirect(
      new URL(`${destino}?erro=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(`${destino}?salvo=1`, request.url));
}
