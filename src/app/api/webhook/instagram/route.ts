import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { assinaturaValida, enviarMensagemDirect } from "@/lib/metaMessaging";

// Endpoint único que a Meta chama pra: (1) validar o webhook na hora de configurar (GET) e
// (2) empurrar cada mensagem nova de Direct em tempo real (POST). Rota separada de qualquer
// coisa do agendador — nenhum código aqui toca no motor de publicação de Stories.

// ============================================================================
// GET — handshake de verificação da Meta (roda uma vez, quando a Callback URL é configurada
// no painel do app, e sempre que a Meta decide reconfirmar o webhook).
// ============================================================================
export async function GET(request: NextRequest) {
  const modo = request.nextUrl.searchParams.get("hub.mode");
  const tokenRecebido = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const tokenEsperado = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (modo === "subscribe" && tokenEsperado && tokenRecebido === tokenEsperado && challenge) {
    // A Meta espera o valor de hub.challenge de volta, em texto puro, sem aspas nem JSON.
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Verificação falhou.", { status: 403 });
}

// ============================================================================
// POST — evento de mensagem chegando de verdade.
// ============================================================================
export async function POST(request: NextRequest) {
  const corpoBruto = await request.text();
  const assinatura = request.headers.get("x-hub-signature-256");

  // Confirma que a chamada realmente veio da Meta (calculado em cima do App Secret certo, do
  // app Chatbot Direct — 1458016982775252). Resolvido em 27/08/2026: o mistério não era o App
  // Secret, era a entrega em si (faltava a assinatura de webhook no nível do aplicativo pro
  // objeto "instagram", separada da inscrição por Página).
  if (!assinaturaValida(corpoBruto, assinatura)) {
    return new NextResponse("Assinatura inválida.", { status: 403 });
  }

  let payload: any;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    // Corpo não é um JSON válido — não há o que processar, mas ainda respondemos 200 pra
    // Meta não ficar retentando um payload que nunca vai parsear.
    return NextResponse.json({ ok: true });
  }

  const admin = criarClienteAdmin();

  const entradas: any[] = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entrada of entradas) {
    const eventosDeMensagem: any[] = Array.isArray(entrada?.messaging) ? entrada.messaging : [];

    for (const evento of eventosDeMensagem) {
      try {
        await processarEventoDeMensagem(admin, evento);
      } catch (erro) {
        // Um erro processando UM evento não pode derrubar os outros nem fazer a Meta reenviar
        // o lote inteiro — só loga (aparece nos logs da Vercel) e segue pro próximo.
        console.error("Erro processando evento de mensagem do Direct:", erro);
      }
    }
  }

  // A Meta espera uma resposta 200 rápida — já processamos tudo de forma síncrona acima
  // (volume baixo, ~30 mensagens/dia no total, sem necessidade de fila separada por enquanto).
  return NextResponse.json({ ok: true });
}

async function processarEventoDeMensagem(admin: ReturnType<typeof criarClienteAdmin>, evento: any) {
  const mensagem = evento?.message;

  // Ignora eco (mensagens que o próprio app/Página mandou, que a Meta manda de volta pro
  // webhook) — sem essa checagem o sistema entraria em loop respondendo a si mesmo.
  if (!mensagem || mensagem.is_echo) {
    return;
  }

  const idDaMensagem: string | undefined = mensagem.mid;
  const idDoCliente: string | undefined = evento?.sender?.id;
  const idDaContaRecebendo: string | undefined = evento?.recipient?.id;

  if (!idDaMensagem || !idDoCliente || !idDaContaRecebendo) {
    return;
  }

  // Idempotência: a Meta pode reenviar o mesmo evento em caso de timeout/retry. Tenta inserir
  // primeiro — se já existe (violação da chave primária), já foi processada, então para aqui.
  const { error: erroAoRegistrar } = await admin
    .from("chatbot_processed_messages")
    .insert({ message_id: idDaMensagem });

  if (erroAoRegistrar) {
    // Código 23505 = unique/primary key violation no Postgres → mensagem repetida, ignora.
    if ((erroAoRegistrar as any).code === "23505") return;
    throw erroAoRegistrar;
  }

  // Encontra qual conta nossa (chatbot_accounts) é essa.
  const { data: conta, error: erroAoBuscarConta } = await admin
    .from("chatbot_accounts")
    .select("id, access_token")
    .eq("instagram_user_id", idDaContaRecebendo)
    .eq("active", true)
    .maybeSingle();

  if (erroAoBuscarConta) throw erroAoBuscarConta;

  if (!conta) {
    console.warn(
      `Mensagem recebida pra uma conta ainda não conectada no sistema (instagram_user_id=${idDaContaRecebendo}).`
    );
    return;
  }

  // Resposta fixa de teste (Etapa 2) — só pra provar que o caminho completo funciona rápido e
  // direito. As etapas seguintes substituem isso pelo atendimento de verdade (Gemini, palavras-
  // chave, fluxo de reserva).
  await enviarMensagemDirect(
    conta.access_token,
    idDoCliente,
    "Recebi sua mensagem! 👋 (esse é um teste — o atendimento completo entra no ar em breve)"
  );
}
