import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { PaginaComInstagram } from "@/lib/facebookOAuth";

// Recebe a escolha de qual Página/conta do Instagram conectar (formulário de /contas/conectar),
// grava a conta de verdade em chatbot_accounts e apaga a conexão pendente (já não serve mais).
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const idPendente = formData.get("pendente")?.toString();
  const pageIdEscolhido = formData.get("page_id")?.toString();

  if (!idPendente || !pageIdEscolhido) {
    return NextResponse.redirect(new URL("/contas?erro=escolha_invalida", request.url));
  }

  const admin = criarClienteAdmin();

  const { data: pendente, error: erroAoBuscar } = await admin
    .from("chatbot_pending_connections")
    .select("pages")
    .eq("id", idPendente)
    .maybeSingle();

  if (erroAoBuscar || !pendente) {
    return NextResponse.redirect(new URL("/contas?erro=conexao_expirada", request.url));
  }

  const paginas = pendente.pages as PaginaComInstagram[];
  const paginaEscolhida = paginas.find((p) => p.page_id === pageIdEscolhido);

  if (!paginaEscolhida) {
    return NextResponse.redirect(new URL("/contas?erro=pagina_nao_encontrada", request.url));
  }

  const { error: erroAoSalvarConta } = await admin.from("chatbot_accounts").upsert(
    {
      instagram_user_id: paginaEscolhida.instagram_user_id,
      page_id: paginaEscolhida.page_id,
      page_name: paginaEscolhida.page_name,
      instagram_username: paginaEscolhida.instagram_username,
      access_token: paginaEscolhida.page_access_token,
      active: true,
    },
    { onConflict: "instagram_user_id" }
  );

  // A conexão pendente só serve uma vez, dá pra apagar mesmo se o passo seguinte falhar.
  await admin.from("chatbot_pending_connections").delete().eq("id", idPendente);

  if (erroAoSalvarConta) {
    return NextResponse.redirect(new URL("/contas?erro=falha_ao_salvar_conta", request.url));
  }

  return NextResponse.redirect(new URL("/contas?conectada=1", request.url));
}
