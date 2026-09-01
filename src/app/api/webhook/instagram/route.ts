import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { assinaturaValida, buscarPerfilDoCliente, enviarMensagemDirect } from "@/lib/metaMessaging";
import { decidirSetor, responderComoSetor } from "@/lib/triagem";

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

  // Últimas mensagens dessa conversa (mesma conta + mesmo cidadão), dentro de uma janela curta —
  // dá continuidade a perguntas de seguimento ("quando vocês podem vir?") sem arrastar assunto de
  // uma conversa antiga e já esquecida que aconteceu dias atrás.
  const DUAS_HORAS_MS = 2 * 60 * 60 * 1000;
  const { data: mensagensAnteriores } = await admin
    .from("directgov_mensagens")
    .select("direcao, texto")
    .eq("conta_id", conta.id)
    .eq("instagram_scoped_id", idDoCliente)
    .gte("created_at", new Date(Date.now() - DUAS_HORAS_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(10);

  const historicoRecente = (mensagensAnteriores ?? [])
    .map((m) => `${m.direcao === "recebida" ? "Cidadão" : "Secretaria"}: ${m.texto}`)
    .join("\n");

  const perfilDoCliente = await buscarPerfilDoCliente(conta.access_token, idDoCliente);

  const { data: mensagemRecebida } = await admin
    .from("directgov_mensagens")
    .insert({
      conta_id: conta.id,
      instagram_scoped_id: idDoCliente,
      direcao: "recebida",
      texto: textoDaMensagem ?? "[mensagem sem texto — áudio, imagem, story etc.]",
      cliente_nome: perfilDoCliente.nome,
      cliente_username: perfilDoCliente.username,
    })
    .select("id")
    .single();

  if (!textoDaMensagem) {
    return;
  }

  const { data: prefeitura } = await admin
    .from("directgov_prefeituras")
    .select("nome, guardrails_texto")
    .eq("id", conta.prefeitura_id)
    .maybeSingle();

  const { data: setores } = await admin
    .from("directgov_setores")
    .select(
      "id, nome, eh_geral, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto"
    )
    .eq("prefeitura_id", conta.prefeitura_id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (!prefeitura || !setores || setores.length === 0) {
    console.warn(`Prefeitura ${conta.prefeitura_id} sem setores ativos — mensagem sem resposta.`);
    return;
  }

  // Chamada 1 — a "secretária" decide qual setor é responsável, vendo só os nomes dos setores.
  const setorEscolhido = await decidirSetor(setores, historicoRecente, textoDaMensagem);

  // Atualiza a mensagem recebida com o setor decidido — assim o relatório de atendimentos
  // consegue mostrar quem procurou cada setor, sem precisar cruzar com a mensagem de resposta.
  if (setorEscolhido && mensagemRecebida) {
    await admin
      .from("directgov_mensagens")
      .update({ setor_id: setorEscolhido.id })
      .eq("id", mensagemRecebida.id);
  }

  // Chamada 2 — o setor escolhido responde usando só a própria base de conhecimento.
  const respostaGerada = setorEscolhido
    ? await responderComoSetor(
        setorEscolhido,
        prefeitura.nome,
        prefeitura.guardrails_texto ?? "",
        historicoRecente,
        textoDaMensagem
      )
    : null;

  const respostaFinal =
    respostaGerada ??
    "Recebemos sua mensagem, mas tivemos um problema técnico pra responder agora. Vamos te retornar em breve.";

  await enviarMensagemDirect(conta.access_token, idDoCliente, respostaFinal);

  await admin.from("directgov_mensagens").insert({
    conta_id: conta.id,
    instagram_scoped_id: idDoCliente,
    direcao: "enviada",
    texto: respostaFinal,
    setor_id: setorEscolhido?.id ?? null,
  });
}
