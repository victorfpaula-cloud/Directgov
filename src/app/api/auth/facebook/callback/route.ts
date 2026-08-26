import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  listarPaginasComInstagram,
  trocarCodigoPorToken,
  trocarPorTokenDeLongaDuracao,
} from "@/lib/facebookOAuth";

// Pra onde o Facebook manda o usuário de volta depois do login. Confere o "state" (contra CSRF),
// troca o código pelo token, busca as Páginas com Instagram vinculado, guarda tudo numa
// "conexão pendente" e manda o Victor pra tela de escolher qual conectar.
export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const erroDoFacebook = request.nextUrl.searchParams.get("error");

  if (erroDoFacebook) {
    return NextResponse.redirect(
      new URL(`/contas?erro=${encodeURIComponent(erroDoFacebook)}`, request.url)
    );
  }

  if (!codigo || !state) {
    return NextResponse.redirect(new URL("/contas?erro=parametros_faltando", request.url));
  }

  const admin = criarClienteAdmin();

  // O state só pode ser usado uma vez — apaga assim que confere que existe.
  const { data: stateSalvo, error: erroAoBuscarState } = await admin
    .from("chatbot_oauth_states")
    .delete()
    .eq("state", state)
    .select()
    .maybeSingle();

  if (erroAoBuscarState || !stateSalvo) {
    return NextResponse.redirect(new URL("/contas?erro=state_invalido", request.url));
  }

  try {
    const tokenCurto = await trocarCodigoPorToken(codigo);
    const tokenDeUsuario = await trocarPorTokenDeLongaDuracao(tokenCurto);
    const paginas = await listarPaginasComInstagram(tokenDeUsuario);

    if (paginas.length === 0) {
      return NextResponse.redirect(new URL("/contas?erro=sem_paginas_com_instagram", request.url));
    }

    const { data: pendente, error: erroAoSalvarPendente } = await admin
      .from("chatbot_pending_connections")
      .insert({ fb_user_token: tokenDeUsuario, pages: paginas })
      .select("id")
      .single();

    if (erroAoSalvarPendente || !pendente) {
      throw erroAoSalvarPendente ?? new Error("Falha ao salvar conexão pendente.");
    }

    return NextResponse.redirect(
      new URL(`/contas/conectar?pendente=${pendente.id}`, request.url)
    );
  } catch (erro) {
    console.error("Erro no callback do Facebook:", erro);
    return NextResponse.redirect(new URL("/contas?erro=falha_na_conexao", request.url));
  }
}
