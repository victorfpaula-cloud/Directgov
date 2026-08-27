import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  buscarPerfilDoCliente,
  enviarMensagemDirect,
  enviarMensagemComBotoes,
} from "@/lib/metaMessaging";
import { adicionarLinhaNaPlanilha } from "@/lib/googleSheets";

// Etapa 6 — fluxo de reserva com estado: a conta responde normal (palavra-chave, Gemini) até
// alguém escrever a palavra-chave configurada em `palavra_chave_reserva`. Daí em diante, cada
// mensagem nova dessa pessoa é tratada como resposta da pergunta atual (nunca cai em
// palavra-chave/Gemini até o fluxo terminar) — o estado de "em que pergunta a pessoa está" fica
// guardado em `chatbot_conversations`, e a reserva confirmada vira uma linha em
// `chatbot_reservations` + uma linha na planilha do Google.

type Admin = ReturnType<typeof criarClienteAdmin>;
type Conta = { id: string; access_token: string };

const RESERVA_DATA_HOJE = "RESERVA_DATA_HOJE";
const RESERVA_DATA_AMANHA = "RESERVA_DATA_AMANHA";
const RESERVA_DATA_OUTRO = "RESERVA_DATA_OUTRO";
const RESERVA_PERIODO_ALMOCO = "RESERVA_PERIODO_ALMOCO";
const RESERVA_PERIODO_JANTAR = "RESERVA_PERIODO_JANTAR";
const RESERVA_CONFIRMAR_SIM = "RESERVA_CONFIRMAR_SIM";
const RESERVA_CONFIRMAR_NAO = "RESERVA_CONFIRMAR_NAO";

/**
 * Ponto de entrada, chamado pelo webhook ANTES da checagem de palavra-chave comum. Devolve
 * `true` quando tratou a mensagem (o webhook para por ali), `false` quando não tem nada a ver
 * com reserva (o webhook segue pro caminho normal de palavra-chave/Gemini).
 */
export async function processarMensagemDeReserva(
  admin: Admin,
  conta: Conta,
  idDoCliente: string,
  mensagem: any
): Promise<boolean> {
  const textoDaMensagem: string | undefined =
    typeof mensagem?.text === "string" ? mensagem.text : undefined;
  const payloadDoBotao: string | undefined = mensagem?.quick_reply?.payload;

  const { data: config, error: erroAoBuscarConfig } = await admin
    .from("chatbot_account_settings")
    .select("palavra_chave_reserva, reserva_pausa_ativa, reserva_pausa_mensagem, reserva_cutoff_horario")
    .eq("account_id", conta.id)
    .maybeSingle();

  if (erroAoBuscarConfig) throw erroAoBuscarConfig;

  const palavraChave = config?.palavra_chave_reserva?.trim();
  const bateuPalavraChave =
    !!palavraChave &&
    !!textoDaMensagem &&
    normalizar(textoDaMensagem).includes(normalizar(palavraChave));

  const { data: conversa, error: erroAoBuscarConversa } = await admin
    .from("chatbot_conversations")
    .select("id, etapa_atual, dados_coletados")
    .eq("account_id", conta.id)
    .eq("instagram_scoped_id", idDoCliente)
    .eq("fluxo_atual", "reserva")
    .maybeSingle();

  if (erroAoBuscarConversa) throw erroAoBuscarConversa;

  if (bateuPalavraChave) {
    // Bateu a palavra-chave — começa (ou recomeça do zero, se já tinha uma reserva pela metade;
    // ex: a pessoa desistiu e quer começar de novo).
    if (conversa) {
      await admin.from("chatbot_conversations").delete().eq("id", conversa.id);
    }

    if (config?.reserva_pausa_ativa) {
      const mensagemDePausa =
        config.reserva_pausa_mensagem?.trim() ||
        "No momento não estamos aceitando novas reservas por aqui. Assim que reabrirmos, avisamos por aqui.";
      await enviarMensagemDirect(conta.access_token, idDoCliente, mensagemDePausa);
      return true;
    }

    await iniciarFluxo(admin, conta, idDoCliente, config?.reserva_cutoff_horario ?? null);
    return true;
  }

  if (conversa) {
    await continuarFluxo(admin, conta, idDoCliente, conversa, textoDaMensagem, payloadDoBotao);
    return true;
  }

  return false;
}

async function iniciarFluxo(
  admin: Admin,
  conta: Conta,
  idDoCliente: string,
  cutoff: string | null
) {
  const perfil = await buscarPerfilDoCliente(conta.access_token, idDoCliente);

  await admin.from("chatbot_conversations").insert({
    account_id: conta.id,
    instagram_scoped_id: idDoCliente,
    fluxo_atual: "reserva",
    etapa_atual: "data",
    dados_coletados: { nome: perfil.nome, username: perfil.username },
    atualizado_em: new Date().toISOString(),
  });

  await perguntarData(conta, idDoCliente, cutoff);
}

async function perguntarData(conta: Conta, idDoCliente: string, cutoff: string | null) {
  const agora = agoraEmSaoPaulo();
  const hojeFechado = passouDoCutoff(cutoff, agora.hora, agora.minuto);

  const botoes = hojeFechado
    ? [
        { titulo: "Amanhã", payload: RESERVA_DATA_AMANHA },
        { titulo: "Outro dia", payload: RESERVA_DATA_OUTRO },
      ]
    : [
        { titulo: "Hoje", payload: RESERVA_DATA_HOJE },
        { titulo: "Amanhã", payload: RESERVA_DATA_AMANHA },
        { titulo: "Outro dia", payload: RESERVA_DATA_OUTRO },
      ];

  const opcoesTexto = botoes.map((b) => b.titulo).join(", ");
  const aviso = hojeFechado ? "Nossas reservas de hoje já encerraram, mas posso te ajudar pra outro dia. " : "";

  await enviarMensagemComBotoes(
    conta.access_token,
    idDoCliente,
    `${aviso}Pra qual dia você quer reservar? Toque num botão abaixo ou digite: ${opcoesTexto}.`,
    botoes
  );
}

async function perguntarPeriodo(conta: Conta, idDoCliente: string) {
  await enviarMensagemComBotoes(conta.access_token, idDoCliente, "É pro Almoço ou Jantar?", [
    { titulo: "Almoço", payload: RESERVA_PERIODO_ALMOCO },
    { titulo: "Jantar", payload: RESERVA_PERIODO_JANTAR },
  ]);
}

async function continuarFluxo(
  admin: Admin,
  conta: Conta,
  idDoCliente: string,
  conversa: { id: string; etapa_atual: string; dados_coletados: any },
  textoDaMensagem: string | undefined,
  payloadDoBotao: string | undefined
) {
  const dados = conversa.dados_coletados ?? {};

  switch (conversa.etapa_atual) {
    case "data": {
      const { data: config } = await buscarConfig(admin, conta.id);
      const agora = agoraEmSaoPaulo();
      const hojeFechado = passouDoCutoff(config?.reserva_cutoff_horario ?? null, agora.hora, agora.minuto);

      const escolha = interpretarData(payloadDoBotao, textoDaMensagem, hojeFechado);

      if (escolha === "invalido") {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          hojeFechado
            ? "Não entendi — pode ser Amanhã ou Outro dia?"
            : "Não entendi — pode ser Hoje, Amanhã ou Outro dia?"
        );
        return;
      }

      if (escolha === "outro") {
        await atualizarEtapa(admin, conversa.id, "data_customizada", dados);
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          "Beleza, pra qual data? Pode escrever tipo 15/09."
        );
        return;
      }

      const dataEscolhida = escolha === "hoje" ? agora : somarDias(agora, 1);
      dados.data_reserva = paraISO(dataEscolhida);
      dados.data_reserva_br = formatarDataBR(dataEscolhida);
      await atualizarEtapa(admin, conversa.id, "periodo", dados);
      await perguntarPeriodo(conta, idDoCliente);
      return;
    }

    case "data_customizada": {
      const agora = agoraEmSaoPaulo();
      const dataLivre = textoDaMensagem ? parseDataLivre(textoDaMensagem, agora) : null;

      if (!dataLivre) {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          "Não consegui entender essa data — pode escrever no formato dia/mês, tipo 15/09?"
        );
        return;
      }

      dados.data_reserva = paraISO(dataLivre);
      dados.data_reserva_br = formatarDataBR(dataLivre);
      await atualizarEtapa(admin, conversa.id, "periodo", dados);
      await perguntarPeriodo(conta, idDoCliente);
      return;
    }

    case "periodo": {
      const periodo = interpretarPeriodo(payloadDoBotao, textoDaMensagem);
      if (!periodo) {
        await enviarMensagemDirect(conta.access_token, idDoCliente, "Não entendi — é pro Almoço ou Jantar?");
        return;
      }
      dados.periodo = periodo;
      await atualizarEtapa(admin, conversa.id, "pessoas", dados);
      await enviarMensagemDirect(conta.access_token, idDoCliente, "Pra quantas pessoas é a reserva?");
      return;
    }

    case "pessoas": {
      const quantidade = interpretarQuantidade(textoDaMensagem);
      if (!quantidade) {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          "Não consegui entender — pode me dizer só o número de pessoas?"
        );
        return;
      }

      const { data: config } = await buscarConfig(admin, conta.id);
      const limiteMaximo = config?.reserva_limite_maximo;

      if (typeof limiteMaximo === "number" && quantidade > limiteMaximo) {
        const mensagem =
          config?.reserva_mensagem_limite_maximo?.trim() ||
          "Nossas reservas do dia já estão encerradas porque todas as mesas já foram preenchidas. Nosso atendimento será apenas por ordem de chegada.";
        await enviarMensagemDirect(conta.access_token, idDoCliente, mensagem);
        await encerrarConversa(admin, conversa.id);
        return;
      }

      dados.quantidade_pessoas = quantidade;
      await atualizarEtapa(admin, conversa.id, "whatsapp", dados);
      await enviarMensagemDirect(conta.access_token, idDoCliente, "Qual o melhor WhatsApp pra contato?");
      return;
    }

    case "whatsapp": {
      const whatsapp = textoDaMensagem?.trim();
      const digitos = whatsapp?.replace(/\D/g, "") ?? "";

      if (!whatsapp || digitos.length < 8) {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          "Não consegui entender — pode mandar o número de WhatsApp, com DDD?"
        );
        return;
      }

      dados.whatsapp = whatsapp;
      await atualizarEtapa(admin, conversa.id, "confirmacao", dados);

      const { data: config } = await buscarConfig(admin, conta.id);
      const regras = config?.reserva_regras_texto?.trim();
      const periodoTexto = dados.periodo === "almoco" ? "almoço" : "jantar";

      const textoConfirmacao = [
        regras,
        `Confirmando: ${dados.quantidade_pessoas} pessoa(s), dia ${dados.data_reserva_br}, ${periodoTexto}.`,
        "Posso confirmar?",
      ]
        .filter(Boolean)
        .join("\n\n");

      await enviarMensagemComBotoes(conta.access_token, idDoCliente, textoConfirmacao, [
        { titulo: "Sim, confirmar", payload: RESERVA_CONFIRMAR_SIM },
        { titulo: "Não, fica pra próxima", payload: RESERVA_CONFIRMAR_NAO },
      ]);
      return;
    }

    case "confirmacao": {
      const confirmou = interpretarSimNao(payloadDoBotao, textoDaMensagem);

      if (confirmou === null) {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          'Só pra confirmar: posso registrar a reserva? Responde "sim" ou "não".'
        );
        return;
      }

      if (!confirmou) {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          "Sem problema, fica pra próxima! Se quiser reservar depois, é só chamar de novo."
        );
        await encerrarConversa(admin, conversa.id);
        return;
      }

      await finalizarReserva(admin, conta, idDoCliente, dados);
      await encerrarConversa(admin, conversa.id);
      return;
    }

    default: {
      // Etapa desconhecida (não deveria acontecer) — encerra o fluxo pra não travar a conversa
      // num estado sem saída.
      await encerrarConversa(admin, conversa.id);
      return;
    }
  }
}

async function finalizarReserva(admin: Admin, conta: Conta, idDoCliente: string, dados: any) {
  const { data: config } = await buscarConfig(admin, conta.id);

  const { data: reservaSalva, error: erroAoSalvar } = await admin
    .from("chatbot_reservations")
    .insert({
      account_id: conta.id,
      instagram_scoped_id: idDoCliente,
      cliente_nome: dados.nome ?? null,
      cliente_instagram_username: dados.username ?? null,
      data_reserva: dados.data_reserva ?? null,
      periodo: dados.periodo ?? null,
      quantidade_pessoas: dados.quantidade_pessoas ?? null,
      whatsapp: dados.whatsapp ?? null,
      confirmado_em: new Date().toISOString(),
      sheet_sincronizado: false,
    })
    .select("id")
    .single();

  if (erroAoSalvar) {
    console.error("Falha ao salvar reserva no banco:", erroAoSalvar);
    await enviarMensagemDirect(
      conta.access_token,
      idDoCliente,
      "Deu um probleminha aqui pra registrar sua reserva — pode mandar de novo em alguns minutos? Se persistir, chama a gente direto."
    );
    return;
  }

  // Avisa o cliente ANTES de tentar escrever na planilha — a reserva já está garantida no banco
  // nesse ponto, então uma falha na planilha (rede, permissão) não pode virar um "não deu certo"
  // falso pro cliente.
  await enviarMensagemDirect(
    conta.access_token,
    idDoCliente,
    "Reserva confirmada! Te esperamos por lá. Qualquer mudança, é só chamar por aqui de novo."
  );

  const idDaPlanilha = config?.google_sheet_id;
  if (idDaPlanilha && reservaSalva) {
    const periodoTexto = dados.periodo === "almoco" ? "Almoço" : dados.periodo === "jantar" ? "Jantar" : "";

    const escreveuNaPlanilha = await adicionarLinhaNaPlanilha(idDaPlanilha, [
      dados.nome ?? "",
      dados.username ?? "",
      String(dados.quantidade_pessoas ?? ""),
      dados.whatsapp ?? "",
      dados.data_reserva_br ?? "",
      periodoTexto,
      formatarDataHoraBR(new Date()),
    ]);

    if (escreveuNaPlanilha) {
      await admin
        .from("chatbot_reservations")
        .update({ sheet_sincronizado: true })
        .eq("id", reservaSalva.id);
    }
  }
}

async function buscarConfig(admin: Admin, accountId: string) {
  return admin
    .from("chatbot_account_settings")
    .select(
      "reserva_regras_texto, reserva_mensagem_limite_maximo, reserva_limite_maximo, reserva_cutoff_horario, google_sheet_id"
    )
    .eq("account_id", accountId)
    .maybeSingle();
}

async function atualizarEtapa(admin: Admin, conversaId: string, etapa: string, dados: any) {
  await admin
    .from("chatbot_conversations")
    .update({ etapa_atual: etapa, dados_coletados: dados, atualizado_em: new Date().toISOString() })
    .eq("id", conversaId);
}

async function encerrarConversa(admin: Admin, conversaId: string) {
  await admin.from("chatbot_conversations").delete().eq("id", conversaId);
}

// --- Interpretação de respostas (aceita clique no botão OU texto digitado, sempre) ---

function interpretarData(
  payload: string | undefined,
  texto: string | undefined,
  hojeFechado: boolean
): "hoje" | "amanha" | "outro" | "invalido" {
  if (payload === RESERVA_DATA_HOJE) return hojeFechado ? "invalido" : "hoje";
  if (payload === RESERVA_DATA_AMANHA) return "amanha";
  if (payload === RESERVA_DATA_OUTRO) return "outro";

  const t = texto ? normalizar(texto) : "";
  if (!t) return "invalido";
  if (!hojeFechado && t.includes("hoje")) return "hoje";
  if (t.includes("amanha")) return "amanha";
  if (t.includes("outro")) return "outro";
  return "invalido";
}

function interpretarPeriodo(payload: string | undefined, texto: string | undefined): "almoco" | "jantar" | null {
  if (payload === RESERVA_PERIODO_ALMOCO) return "almoco";
  if (payload === RESERVA_PERIODO_JANTAR) return "jantar";

  const t = texto ? normalizar(texto) : "";
  if (t.includes("almoc")) return "almoco";
  if (t.includes("jant")) return "jantar";
  return null;
}

function interpretarQuantidade(texto: string | undefined): number | null {
  if (!texto) return null;
  const match = texto.match(/\d+/);
  if (!match) return null;
  const numero = parseInt(match[0], 10);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function interpretarSimNao(payload: string | undefined, texto: string | undefined): boolean | null {
  if (payload === RESERVA_CONFIRMAR_SIM) return true;
  if (payload === RESERVA_CONFIRMAR_NAO) return false;

  const t = texto ? normalizar(texto) : "";
  if (!t) return null;
  if (/^(sim|s|confirmo|confirmar|pode|isso|ok)\b/.test(t)) return true;
  if (/^(nao|n|cancela|cancelar)\b/.test(t)) return false;
  return null;
}

// --- Data/hora em São Paulo, sem depender de biblioteca externa ---

type DataSimples = { ano: number; mes: number; dia: number };

function agoraEmSaoPaulo(): DataSimples & { hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const obter = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";

  return {
    ano: parseInt(obter("year"), 10),
    mes: parseInt(obter("month"), 10),
    dia: parseInt(obter("day"), 10),
    hora: parseInt(obter("hour"), 10),
    minuto: parseInt(obter("minute"), 10),
  };
}

function somarDias({ ano, mes, dia }: DataSimples, quantidade: number): DataSimples {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + quantidade);
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, dia: data.getUTCDate() };
}

function paraISO({ ano, mes, dia }: DataSimples): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function formatarDataBR({ ano, mes, dia }: DataSimples): string {
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

function formatarDataHoraBR(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function parseDataLivre(texto: string, hojeSP: DataSimples): DataSimples | null {
  const match = texto.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (!match) return null;

  const dia = parseInt(match[1], 10);
  const mes = parseInt(match[2], 10);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;

  let ano = hojeSP.ano;
  if (match[3]) {
    ano = parseInt(match[3], 10);
    if (match[3].length === 2) ano += 2000;
  } else {
    const candidata = new Date(Date.UTC(ano, mes - 1, dia));
    const hoje = new Date(Date.UTC(hojeSP.ano, hojeSP.mes - 1, hojeSP.dia));
    if (candidata < hoje) ano += 1;
  }

  return { ano, mes, dia };
}

function passouDoCutoff(cutoff: string | null, horaAtual: number, minutoAtual: number): boolean {
  if (!cutoff) return false;
  const [horaCutoff, minutoCutoff] = cutoff.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(horaCutoff)) return false;
  return horaAtual > horaCutoff || (horaAtual === horaCutoff && minutoAtual >= (minutoCutoff || 0));
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
