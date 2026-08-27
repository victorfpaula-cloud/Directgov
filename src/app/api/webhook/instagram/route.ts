import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { assinaturaValida, enviarMensagemDirect } from "@/lib/metaMessaging";
import { gerarRespostaComGemini } from "@/lib/gemini";
import { processarMensagemDeReserva } from "@/lib/reservas";
import { registrarAtendimento } from "@/lib/atendimentos";

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
  const mensagemOriginal = evento?.message;
  const postback = evento?.postback;

  if (mensagemOriginal?.is_echo) {
    return;
  }

  if (!mensagemOriginal && !postback) {
    return;
  }

  // Toque num botão do novo formato (Button Template, usado no fluxo de reserva) chega como um
  // evento "postback", NÃO como "message" — é um formato totalmente diferente da Meta. Normaliza
  // aqui pro mesmo formato que o resto do código já entende (`quick_reply.payload`), então nada
  // mais precisa saber se foi um toque de botão ou uma resposta digitada.
  const mensagem: { text?: string; quick_reply?: { payload: string } } = postback
    ? { quick_reply: { payload: postback.payload } }
    : mensagemOriginal;

  const idDaMensagem: string | undefined = postback
    ? postback.mid ?? `postback_${evento?.sender?.id}_${evento?.timestamp}_${postback.payload}`
    : mensagemOriginal?.mid;
  const idDoCliente: string | undefined = evento?.sender?.id;
  const idDaContaRecebendo: string | undefined = evento?.recipient?.id;
  const textoDaMensagem: string | undefined = mensagem.text;

  if (!idDaMensagem || !idDoCliente || !idDaContaRecebendo) {
    return;
  }

  const { error: erroAoRegistrar } = await admin
    .from("chatbot_processed_messages")
    .insert({ message_id: idDaMensagem });

  if (erroAoRegistrar) {
    if ((erroAoRegistrar as any).code === "23505") return;
    throw erroAoRegistrar;
  }

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

  // Descrição amigável do que o cliente mandou, pra aparecer no histórico de atendimentos — toque
  // num botão (postback) não tem texto de verdade, então usa o título do botão nesse caso.
  const descricaoDaMensagemRecebida = postback
    ? `[botão] ${postback.title ?? postback.payload}`
    : textoDaMensagem ?? "[mensagem sem texto — áudio, imagem, story etc.]";

  let tipoResposta: "reserva" | "palavra_chave" | "gemini" | "sem_resposta" = "sem_resposta";
  let respostaResumo: string | null = null;
  let erroOcorrido: unknown = null;

  try {
    // Etapa 6 — fluxo de reserva: checa ANTES de palavra-chave/Gemini, porque enquanto alguém está
    // no meio de uma reserva (respondendo data/período/pessoas/WhatsApp/confirmação), toda mensagem
    // nova dessa pessoa precisa ser tratada como resposta da pergunta atual — nunca cair no
    // atendimento normal por engano. Se `processarMensagemDeReserva` devolver `true`, já cuidou de
    // tudo (mandou a próxima pergunta, ou terminou o fluxo).
    const tratadoPeloFluxoDeReserva = await processarMensagemDeReserva(admin, conta, idDoCliente, mensagem);

    if (tratadoPeloFluxoDeReserva) {
      tipoResposta = "reserva";
      respostaResumo = "Tratado pelo fluxo de reserva (mensagens configuradas na aba Reserva).";
    } else if (textoDaMensagem) {
      const { data: palavrasChave, error: erroAoBuscarPalavrasChave } = await admin
        .from("chatbot_keywords")
        .select("palavra_chave, mensagens, pausa_entre_mensagens_ms")
        .eq("account_id", conta.id)
        .eq("ativo", true)
        .order("created_at", { ascending: true });

      if (erroAoBuscarPalavrasChave) throw erroAoBuscarPalavrasChave;

      const textoNormalizado = normalizar(textoDaMensagem);

      const palavraChaveCorrespondente = (palavrasChave ?? []).find((pc) => {
        const variacoes = (pc.palavra_chave ?? "")
          .split(",")
          .map((v: string) => normalizar(v.trim()))
          .filter((v: string) => v.length > 0);

        return variacoes.some((variacao: string) => textoNormalizado.includes(variacao));
      });

      if (palavraChaveCorrespondente) {
        const mensagensDaSequencia: string[] = Array.isArray(palavraChaveCorrespondente.mensagens)
          ? palavraChaveCorrespondente.mensagens
          : [];
        const pausaMs = Math.min(palavraChaveCorrespondente.pausa_entre_mensagens_ms ?? 0, 4000);

        for (let i = 0; i < mensagensDaSequencia.length; i++) {
          if (i > 0 && pausaMs > 0) {
            await aguardar(pausaMs);
          }
          await enviarMensagemDirect(conta.access_token, idDoCliente, mensagensDaSequencia[i]);
        }

        tipoResposta = "palavra_chave";
        respostaResumo = mensagensDaSequencia.join(" | ") || null;
      } else {
        // Nenhuma palavra-chave bateu — Etapa 5: cai no fallback do Gemini.
        const respostaGemini = await responderComGemini(admin, conta, idDoCliente, textoDaMensagem);

        if (respostaGemini) {
          tipoResposta = "gemini";
          respostaResumo = respostaGemini;
        } else {
          tipoResposta = "sem_resposta";
        }
      }
    } else {
      tipoResposta = "sem_resposta";
    }
  } catch (erro) {
    erroOcorrido = erro;
  }

  // Registro no histórico de atendimentos (melhor esforço — nunca atrasa nem derruba o
  // processamento da mensagem de verdade, mesmo se der algum problema aqui).
  await registrarAtendimento(admin, {
    contaId: conta.id,
    tokenDaConta: conta.access_token,
    idDoCliente,
    mensagemRecebida: descricaoDaMensagemRecebida,
    tipoResposta,
    respostaEnviada: respostaResumo,
    status: erroOcorrido ? "erro" : tipoResposta === "sem_resposta" ? "sem_resposta" : "respondido",
    erroDetalhe: erroOcorrido ? String((erroOcorrido as any)?.message ?? erroOcorrido) : null,
  });

  if (erroOcorrido) {
    console.error("Erro processando evento de mensagem do Direct:", erroOcorrido);
  }
}

async function responderComGemini(
  admin: ReturnType<typeof criarClienteAdmin>,
  conta: { id: string; access_token: string },
  idDoCliente: string,
  textoDaMensagem: string
): Promise<string | null> {
  const { data: config, error: erroAoBuscarConfig } = await admin
    .from("chatbot_account_settings")
    .select("tom_de_voz, guardrails, base_conhecimento")
    .eq("account_id", conta.id)
    .maybeSingle();

  if (erroAoBuscarConfig) throw erroAoBuscarConfig;

  if (!config) {
    // Conta ainda sem configuração de Gemini cadastrada — fica em silêncio.
    return null;
  }

  const promptDoSistema = [
    config.tom_de_voz ? `Tom de voz a seguir:\n${config.tom_de_voz}` : null,
    config.guardrails ? `Regras que você DEVE seguir sempre:\n${config.guardrails}` : null,
    config.base_conhecimento ? `Informações sobre o negócio:\n${config.base_conhecimento}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!promptDoSistema) {
    return null;
  }

  const respostaGerada = await gerarRespostaComGemini(promptDoSistema, textoDaMensagem);

  if (!respostaGerada) {
    return null;
  }

  await enviarMensagemDirect(conta.access_token, idDoCliente, respostaGerada);

  return respostaGerada;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
