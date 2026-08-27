import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const accountId = formData.get("account_id")?.toString();

  if (!accountId) {
    return NextResponse.redirect(new URL(`/contas`, request.url));
  }

  const palavraChaveReserva = formData.get("palavra_chave_reserva")?.toString() ?? "";
  const reservaRegrasTexto = formData.get("reserva_regras_texto")?.toString() ?? "";
  const reservaMensagemLimiteMaximo =
    formData.get("reserva_mensagem_limite_maximo")?.toString() ?? "";
  const reservaCutoffHorario = formData.get("reserva_cutoff_horario")?.toString() ?? "";
  const reservaPausaAtiva = formData.get("reserva_pausa_ativa") === "on";
  const reservaPausaData = formData.get("reserva_pausa_data")?.toString() ?? "";
  const reservaPausaMensagem = formData.get("reserva_pausa_mensagem")?.toString() ?? "";
  const googleSheetId = formData.get("google_sheet_id")?.toString() ?? "";

  const reservaMsgInicial = formData.get("reserva_msg_inicial")?.toString() ?? "";
  const reservaMsgPerguntaData = formData.get("reserva_msg_pergunta_data")?.toString() ?? "";
  const reservaMsgPerguntaPeriodo = formData.get("reserva_msg_pergunta_periodo")?.toString() ?? "";
  const reservaMsgPerguntaPessoas = formData.get("reserva_msg_pergunta_pessoas")?.toString() ?? "";
  const reservaMsgPerguntaWhatsapp = formData.get("reserva_msg_pergunta_whatsapp")?.toString() ?? "";
  const reservaMsgConfirmada = formData.get("reserva_msg_confirmada")?.toString() ?? "";
  const reservaMsgRecusada = formData.get("reserva_msg_recusada")?.toString() ?? "";

  const limiteNormalBruto = formData.get("reserva_limite_normal")?.toString().trim();
  const limiteMaximoBruto = formData.get("reserva_limite_maximo")?.toString().trim();

  const reservaLimiteNormal =
    limiteNormalBruto && !Number.isNaN(Number(limiteNormalBruto)) ? Number(limiteNormalBruto) : null;
  const reservaLimiteMaximo =
    limiteMaximoBruto && !Number.isNaN(Number(limiteMaximoBruto)) ? Number(limiteMaximoBruto) : null;

  const admin = criarClienteAdmin();
  const { error } = await admin.from("chatbot_account_settings").upsert(
    {
      account_id: accountId,
      palavra_chave_reserva: palavraChaveReserva || null,
      reserva_regras_texto: reservaRegrasTexto || null,
      reserva_limite_normal: reservaLimiteNormal,
      reserva_limite_maximo: reservaLimiteMaximo,
      reserva_mensagem_limite_maximo: reservaMensagemLimiteMaximo || null,
      reserva_cutoff_horario: reservaCutoffHorario || null,
      reserva_pausa_ativa: reservaPausaAtiva,
      reserva_pausa_data: reservaPausaData || null,
      reserva_pausa_mensagem: reservaPausaMensagem || null,
      google_sheet_id: googleSheetId || null,
      reserva_msg_inicial: reservaMsgInicial || null,
      reserva_msg_pergunta_data: reservaMsgPerguntaData || null,
      reserva_msg_pergunta_periodo: reservaMsgPerguntaPeriodo || null,
      reserva_msg_pergunta_pessoas: reservaMsgPerguntaPessoas || null,
      reserva_msg_pergunta_whatsapp: reservaMsgPerguntaWhatsapp || null,
      reserva_msg_confirmada: reservaMsgConfirmada || null,
      reserva_msg_recusada: reservaMsgRecusada || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" }
  );

  if (error) {
    console.error("Falha ao salvar configuração de reserva:", error);
    return NextResponse.redirect(
      new URL(`/contas/${accountId}/reserva?erro=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(`/contas/${accountId}/reserva?salvo=1`, request.url));
}
