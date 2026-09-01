import { gerarRespostaComGemini } from "./gemini";

export type SetorParaTriagem = {
  id: string;
  nome: string;
  eh_geral: boolean;
};

export type SetorComConhecimento = SetorParaTriagem & {
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  horario_atendimento: string | null;
  responsavel: string | null;
  base_conhecimento_texto: string;
};

/**
 * Chamada 1 (roteador): decide qual setor da prefeitura deve responder a mensagem do cidadão,
 * mostrando pro Gemini só os nomes dos setores (nunca a base de conhecimento de nenhum deles) —
 * pede de volta só o número do setor escolhido, pra não depender de bater string com o nome exato.
 * Se a chamada ao Gemini falhar ou vier algo que não dá pra interpretar, cai no setor "Geral".
 */
export async function decidirSetor<T extends SetorParaTriagem>(
  setores: T[],
  historicoRecente: string,
  mensagemDoCidadao: string
): Promise<T | null> {
  if (setores.length === 0) return null;

  const setorGeral = setores.find((s) => s.eh_geral) ?? setores[0];

  const listaNumerada = setores.map((setor, indice) => `${indice + 1}. ${setor.nome}`).join("\n");

  const promptDoSistema = `Você é a triagem de uma secretaria virtual de prefeitura. Sua única tarefa é ler a mensagem de um cidadão (levando em conta o histórico recente da conversa, se houver) e decidir qual setor abaixo deve responder. Responda SOMENTE com o número do setor escolhido, sem nenhum texto além disso.

Setores disponíveis:
${listaNumerada}

Se a mensagem não bater claramente com nenhum setor específico, escolha o setor "Geral".
${historicoRecente.trim() ? `\nHistórico recente dessa conversa (mais antiga primeiro):\n${historicoRecente}\n` : ""}`;

  const resposta = await gerarRespostaComGemini(promptDoSistema, mensagemDoCidadao);
  if (!resposta) return setorGeral;

  const numeroEncontrado = resposta.match(/\d+/)?.[0];
  const indice = numeroEncontrado ? parseInt(numeroEncontrado, 10) - 1 : -1;

  return setores[indice] ?? setorGeral;
}

/**
 * Chamada 2 (especialista): gera a resposta de verdade, usando só a base de conhecimento e os
 * dados de contato do setor já escolhido pela triagem — nunca vê informação de outro setor.
 */
export async function responderComoSetor(
  setor: SetorComConhecimento,
  nomeDaPrefeitura: string,
  guardrailsDaPrefeitura: string,
  historicoRecente: string,
  mensagemDoCidadao: string
): Promise<string | null> {
  const contato = [
    setor.endereco ? `Endereço: ${setor.endereco}` : null,
    setor.telefone ? `Telefone: ${setor.telefone}` : null,
    setor.email ? `E-mail: ${setor.email}` : null,
    setor.horario_atendimento ? `Horário de atendimento: ${setor.horario_atendimento}` : null,
    setor.responsavel ? `Responsável: ${setor.responsavel}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const promptDoSistema = `Você é o atendimento virtual do setor "${setor.nome}" da ${nomeDaPrefeitura}, respondendo cidadãos pelo Instagram Direct. Responda de forma direta, cordial e objetiva, usando só as informações abaixo. Se a pergunta não puder ser respondida com elas, diga isso com honestidade e, se houver contato do setor, indique pra pessoa procurar o atendimento presencial/telefônico. Se houver histórico recente da conversa, use ele pra entender o contexto (ex: uma pergunta de seguimento tipo "quando vocês podem vir?"), mas responda só a mensagem mais recente do cidadão.
${guardrailsDaPrefeitura.trim() ? `\nRegras que você DEVE seguir sempre, sem exceção:\n${guardrailsDaPrefeitura}\n` : ""}
Base de conhecimento do setor:
${setor.base_conhecimento_texto || "(nenhuma informação cadastrada ainda)"}
${contato ? `\nContato do setor:\n${contato}` : ""}
${historicoRecente.trim() ? `\nHistórico recente dessa conversa (mais antiga primeiro):\n${historicoRecente}\n` : ""}`;

  return gerarRespostaComGemini(promptDoSistema, mensagemDoCidadao);
}
