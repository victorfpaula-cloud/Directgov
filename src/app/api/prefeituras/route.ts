import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const nome = formData.get("nome")?.toString().trim() ?? "";
  const slug = formData.get("slug")?.toString().trim().toLowerCase() ?? "";

  if (!nome || !slug) {
    return NextResponse.redirect(
      new URL(
        `/prefeituras/nova?erro=${encodeURIComponent("Preenche o nome e o identificador.")}`,
        request.url
      )
    );
  }

  const admin = criarClienteAdmin();
  const { error } = await admin.from("directgov_prefeituras").insert({ nome, slug });

  if (error) {
    console.error("Falha ao criar prefeitura:", error);
    const mensagem =
      error.code === "23505" ? "Já existe uma prefeitura com esse identificador." : error.message;
    return NextResponse.redirect(
      new URL(`/prefeituras/nova?erro=${encodeURIComponent(mensagem)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL("/prefeituras?criada=1", request.url));
}
