import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { assinaturaValida, enviarMensagemDirect } from "@/lib/metaMessaging";

export async function GET(request: NextRequest) {
  const modo = request.nextUrl.searchParams.get("hub.mode");
  const tokenRecebido = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const tokenEsperado = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (modo === "subscribe" && tokenEsperado && tokenRecebido === tokenEsperado && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Verificação falhou.", { status: 403 });
}

export async function POST(request: NextRequest) {
  const corpoBruto = await request.text();
  const assinatura = request.headers.get("x-hub-signature-256");

  if (!assinaturaValida(corpoBruto, assinatura)) {
    return new NextResponse("Assinatura inválida.", { status: 403 });
  }

  let payload: any;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
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
        console.error("Erro processando evento de mensagem do Direct:", erro);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function processarEventoDeMensagem(admin: ReturnType<typeof criarClienteAdmin>, evento: any) {
  const mensagem = evento?.message;

  if (mensagem?.is_echo) {
    return;
  }

  if (!mensagem) {
    return;
  }

  const idDaMensagem: string | undefined = mensagem?.mid;
  const idDoCliente: string | undefined = evento?.sender?.id;
  const idDaContaRecebendo: string | undefined = evento?.recipient?.id;
  const textoDaMensagem: string | undefined = mensagem.text;

  if (!idDaMensagem || !idDoCliente || !idDaContaRecebendo) {
    return;
  }

  const { error: erroAoRegistrar } = await admin
    .from("directgov_processed_messages")
    .insert({ message_id: idDaMensagem });

  if (erroAoRegistrar) {
    if ((erroAoRegistrar as any).code === "23505") return;
    throw erroAoRegistrar;
  }

  const { data: conta, error: erroAoBuscarConta } = await admin
    .from("directgov_contas")
    .select("id, prefeitura_id, access_token")
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

  await admin.from("directgov_mensagens").insert({
    conta_id: conta.id,
    instagram_scoped_id: idDoCliente,
    direcao: "recebida",
    texto: textoDaMensagem ?? "[mensagem sem texto — áudio, imagem, story etc.]",
  });

  if (!textoDaMensagem) {
    return;
  }

  // TODO: aqui entra a arquitetura de roteador + especialistas descrita no CLAUDE.md do projeto
  // (triagem decide o setor certo da prefeitura, depois o setor responde usando só a própria
  // base de conhecimento). Por enquanto, enquanto essa etapa não é construída, o bot só confirma
  // o recebimento — igual à Etapa 2 do Chatbot Direct, que também começou com uma resposta fixa
  // de teste antes de ligar a IA de verdade.
  const respostaDeTeste =
    "Recebemos sua mensagem! Em breve nossa secretaria virtual vai te direcionar pro setor certo.";

  await enviarMensagemDirect(conta.access_token, idDoCliente, respostaDeTeste);

  await admin.from("directgov_mensagens").insert({
    conta_id: conta.id,
    instagram_scoped_id: idDoCliente,
    direcao: "enviada",
    texto: respostaDeTeste,
  });
}
