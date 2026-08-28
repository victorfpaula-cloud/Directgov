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
//
// Todas as mensagens fixas do fluxo (saudação inicial e as perguntas de cada etapa, além das
// mensagens de reserva confirmada/recusada) podem ser personalizadas por conta em
// `chatbot_account_settings` (campos `reserva_msg_*`) — se a conta não configurou nada, cai no
// texto padrão de sempre (mesmo comportamento de antes dessa personalização existir).

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
    .select(
      "palavra_chave_reserva, reserva_pausa_ativa, reserva_pausa_mensagem, reserva_cutoff_horario, reserva_msg_inicial, reserva_msg_pergunta_data, reserva_datas_bloqueadas"
    )
    .eq("account_id", conta.id)
    .maybeSingle();

  if (erroAoBuscarConfig) throw erroAoBuscarConfig;

  // O campo "Palavra-chave da Reserva" aceita várias variações separadas por vírgula (ex: "reserva,
  // reservas, reservar") — igual ao campo de palavra-chave normal da aba Palavras-chave. Cada
  // variação é comparada separadamente contra a mensagem; basta UMA bater pra iniciar o fluxo.
  const variacoesDaPalavraChaveDeReserva = (config?.palavra_chave_reserva ?? "")
    .split(",")
    .map((v: string) => normalizar(v.trim()))
    .filter((v: string) => v.length > 0);

  const bateuPalavraChave =
    variacoesDaPalavraChaveDeReserva.length > 0 &&
    !!textoDaMensagem &&
    variacoesDaPalavraChaveDeReserva.some((variacao: string) => normalizar(textoDaMensagem).includes(variacao));

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

    await iniciarFluxo(
      admin,
      conta,
      idDoCliente,
      config?.reserva_cutoff_horario ?? null,
      config?.reserva_msg_inicial ?? null,
      config?.reserva_msg_pergunta_data ?? null,
      config?.reserva_datas_bloqueadas ?? null
    );
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
  cutoff: string | null,
  mensagemInicial: string | null,
  mensagemPerguntaData: string | null,
  datasBloqueadasTexto: string | null
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

  // Saudação inicial — só existe se a conta tiver configurado uma (campo opcional). Sem ela, o
  // fluxo começa direto na pergunta da data, exatamente como sempre funcionou.
  const saudacao = mensagemInicial?.trim();
  if (saudacao) {
    await enviarMensagemDirect(conta.access_token, idDoCliente, saudacao);
  }

  await perguntarData(conta, idDoCliente, cutoff, mensagemPerguntaData, datasBloqueadasTexto);
}

async function perguntarData(
  conta: Conta,
  idDoCliente: string,
  cutoff: string | null,
  mensagemPergunta?: string | null,
  datasBloqueadasTexto?: string | null
) {
  const agora = agoraEmSaoPaulo();
  const hojeFechadoPorHorario = passouDoCutoff(cutoff, agora.hora, agora.minuto);

  // Além do corte por horário, algumas datas específicas podem estar bloqueadas de propósito
  // (ex: feriado, dia fechado) — cadastradas em `reserva_datas_bloqueadas`. Se Hoje ou Amanhã
  // caírem numa data bloqueada, o botão correspondente nem aparece.
  const datasBloqueadas = datasBloqueadasTexto ? parseDatasBloqueadas(datasBloqueadasTexto) : null;
  const hojeBloqueadoPorData = !!datasBloqueadas?.has(paraISO(agora));
  const amanhaBloqueadaPorData = !!datasBloqueadas?.has(paraISO(somarDias(agora, 1)));

  const esconderHoje = hojeFechadoPorHorario || hojeBloqueadoPorData;
  const esconderAmanha = amanhaBloqueadaPorData;

  const botoes = [
    ...(esconderHoje ? [] : [{ titulo: "Hoje", payload: RESERVA_DATA_HOJE }]),
    ...(esconderAmanha ? [] : [{ titulo: "Amanhã", payload: RESERVA_DATA_AMANHA }]),
    { titulo: "Outro dia", payload: RESERVA_DATA_OUTRO },
  ];

  const opcoesTexto = botoes.map((b) => b.titulo).join(", ");
  const aviso = hojeFechadoPorHorario
    ? "Nossas reservas de hoje já encerraram, mas posso te ajudar pra outro dia. "
    : "";

  const perguntaBase =
    mensagemPergunta?.trim() ||
    `Pra qual dia você quer reservar? Toque num botão abaixo ou digite: ${opcoesTexto}.`;

  await enviarMensagemComBotoes(conta.access_token, idDoCliente, `${aviso}${perguntaBase}`, botoes);
}

async function perguntarPeriodo(conta: Conta, idDoCliente: string, mensagemPergunta?: string | null) {
  const texto = mensagemPergunta?.trim() || "É pro Almoço ou Jantar?";

  await enviarMensagemComBotoes(conta.access_token, idDoCliente, texto, [
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
      const dataEscolhidaISO = paraISO(dataEscolhida);

      if (estaBloqueada(dataEscolhidaISO, config?.reserva_datas_bloqueadas)) {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          "Não estamos aceitando reservas nesse dia — pode escolher outra data?"
        );
        // Pergunta de novo, já com os botões atualizados (Hoje/Amanhã somem se também
        // estiverem bloqueados) — assim a pessoa não bate na mesma data de novo sem querer.
        await perguntarData(
          conta,
          idDoCliente,
          config?.reserva_cutoff_horario ?? null,
          config?.reserva_msg_pergunta_data,
          config?.reserva_datas_bloqueadas
        );
        return;
      }

      dados.data_reserva = dataEscolhidaISO;
      dados.data_reserva_br = formatarDataBR(dataEscolhida);
      await atualizarEtapa(admin, conversa.id, "periodo", dados);
      await perguntarPeriodo(conta, idDoCliente, config?.reserva_msg_pergunta_periodo);
      return;
    }

    case "data_customizada": {
      const { data: config } = await buscarConfig(admin, conta.id);
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

      const dataLivreISO = paraISO(dataLivre);

      if (estaBloqueada(dataLivreISO, config?.reserva_datas_bloqueadas)) {
        await enviarMensagemDirect(
          conta.access_token,
          idDoCliente,
          "Não estamos aceitando reservas nesse dia — pode tentar outra data?"
        );
        return;
      }

      dados.data_reserva = dataLivreISO;
      dados.data_reserva_br = formatarDataBR(dataLivre);
      await atualizarEtapa(admin, conversa.id, "periodo", dados);
      await perguntarPeriodo(conta, idDoCliente, config?.reserva_msg_pergunta_periodo);
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

      const { data: config } = await buscarConfig(admin, conta.id);
      const perguntaPessoas = config?.reserva_msg_pergunta_pessoas?.trim() || "Pra quantas pessoas é a reserva?";
      await enviarMensagemDirect(conta.access_token, idDoCliente, perguntaPessoas);
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

      const perguntaWhatsapp = config?.reserva_msg_pergunta_whatsapp?.trim() || "Qual o melhor WhatsApp pra contato?";
      await enviarMensagemDirect(conta.access_token, idDoCliente, perguntaWhatsapp);
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

      // As Regras (texto livre, cadastrado por conta — pode ser bem longo) vão numa mensagem de
      // texto simples, SEPARADA da mensagem com botão. Mensagens com botão têm um limite de
      // caracteres bem mais curto que uma mensagem de texto normal — mandar tudo junto arriscaria
      // estourar esse limite dependendo do tamanho das regras cadastradas.
      if (regras) {
        await enviarMensagemDirect(conta.access_token, idDoCliente, regras);
      }

      await enviarMensagemComBotoes(
        conta.access_token,
        idDoCliente,
        `Confirmando: ${dados.quantidade_pessoas} pessoa(s), dia ${dados.data_reserva_br}, ${periodoTexto}. Posso confirmar?`,
        [
          { titulo: "Sim, confirmar", payload: RESERVA_CONFIRMAR_SIM },
          { titulo: "Não, cancelar", payload: RESERVA_CONFIRMAR_NAO },
        ]
      );
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
        const { data: config } = await buscarConfig(admin, conta.id);
        const mensagemRecusada =
          config?.reserva_msg_recusada?.trim() ||
          "Sem problema, fica pra próxima! Se quiser reservar depois, é só chamar de novo.";
        await enviarMensagemDirect(conta.access_token, idDoCliente, mensagemRecusada);
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
  const mensagemConfirmada =
    config?.reserva_msg_confirmada?.trim() ||
    "Reserva confirmada! Te esperamos por lá. Qualquer mudança, é só chamar por aqui de novo.";
  await enviarMensagemDirect(conta.access_token, idDoCliente, mensagemConfirmada);

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
      "reserva_regras_texto, reserva_mensagem_limite_maximo, reserva_limite_maximo, reserva_cutoff_horario, google_sheet_id, reserva_msg_inicial, reserva_msg_pergunta_data, reserva_msg_pergunta_periodo, reserva_msg_pergunta_pessoas, reserva_msg_pergunta_whatsapp, reserva_msg_confirmada, reserva_msg_recusada, reserva_datas_bloqueadas"
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

// --- Datas bloqueadas (feriados, dias fechados etc.), cadastradas por conta em texto livre ---

/**
 * Confere se uma data (formato ISO "AAAA-MM-DD") está na lista de datas bloqueadas cadastrada
 * pela conta. `datasBloqueadasTexto` vem direto do campo de configuração (texto livre, dias
 * separados por vírgula, aceitando intervalo com um traço entre duas datas) — ver
 * `parseDatasBloqueadas`.
 */
function estaBloqueada(dataISO: string, datasBloqueadasTexto: string | null | undefined): boolean {
  if (!datasBloqueadasTexto?.trim()) return false;
  return parseDatasBloqueadas(datasBloqueadasTexto).has(dataISO);
}

/**
 * Interpreta o texto cadastrado em "Bloquear datas específicas": dias separados por vírgula, no
 * formato dia/mês/ano completo (ex: "25/12/2026, 31/12/2026"), aceitando também um intervalo
 * fechado usando um traço entre duas datas (ex: "24/12/2026-26/12/2026" bloqueia os 3 dias).
 * Trechos que não batem com nenhum desses formatos são ignorados, sem quebrar o resto da lista.
 */
function parseDatasBloqueadas(texto: string): Set<string> {
  const resultado = new Set<string>();
  const partes = texto.split(",").map((p) => p.trim()).filter(Boolean);

  for (const parte of partes) {
    const ladosDoIntervalo = parte.split("-").map((p) => p.trim()).filter(Boolean);

    if (ladosDoIntervalo.length === 2) {
      const inicio = parseDataBRCompleta(ladosDoIntervalo[0]);
      const fim = parseDataBRCompleta(ladosDoIntervalo[1]);
      if (inicio && fim) {
        let cursor = inicio;
        let seguranca = 0;
        while (seguranca < 366) {
          resultado.add(paraISO(cursor));
          if (paraISO(cursor) === paraISO(fim)) break;
          cursor = somarDias(cursor, 1);
          seguranca++;
        }
        continue;
      }
    }

    const unica = parseDataBRCompleta(parte);
    if (unica) resultado.add(paraISO(unica));
  }

  return resultado;
}

/** Data no formato dia/mês/ano COMPLETO (ano com 4 dígitos sempre obrigatório). */
function parseDataBRCompleta(texto: string): DataSimples | null {
  const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const dia = parseInt(match[1], 10);
  const mes = parseInt(match[2], 10);
  const ano = parseInt(match[3], 10);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;

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
    .replace(/\p{Diacritic}/gu, "");
}
