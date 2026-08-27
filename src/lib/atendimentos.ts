import { criarClienteAdmin } from "@/lib/supabase/admin";
import { buscarPerfilDoCliente } from "@/lib/metaMessaging";

export type TipoRespostaAtendimento = "reserva" | "palavra_chave" | "gemini" | "sem_resposta";
export type StatusAtendimento = "respondido" | "erro" | "sem_resposta";

/**
 * Grava uma linha no histórico de atendimentos (tela "Atendimentos" de cada conta) descrevendo o
 * que aconteceu com UMA mensagem recebida no Direct: quem mandou, o que o bot decidiu fazer, e se
 * deu certo ou deu erro. Chamada depois que o webhook já tentou responder (ou já decidiu não
 * responder) — nunca antes, pra não atrasar a resposta ao cliente.
 *
 * De propósito, essa função NUNCA lança erro pra fora: registrar o histórico é um "extra", não
 * pode derrubar nem atrasar o processamento de verdade da mensagem se alguma coisa der errado
 * aqui (por exemplo, a tabela ainda não existir porque a migração de SQL não foi rodada ainda).
 */
export async function registrarAtendimento(
  admin: ReturnType<typeof criarClienteAdmin>,
  dados: {
    contaId: string;
    tokenDaConta: string;
    idDoCliente: string;
    mensagemRecebida: string;
    tipoResposta: TipoRespostaAtendimento;
    respostaEnviada: string | null;
    status: StatusAtendimento;
    erroDetalhe: string | null;
  }
): Promise<void> {
  try {
    const perfil = await buscarPerfilDoCliente(dados.tokenDaConta, dados.idDoCliente);

    const { error } = await admin.from("chatbot_atendimentos").insert({
      account_id: dados.contaId,
      instagram_scoped_id: dados.idDoCliente,
      cliente_nome: perfil.nome,
      cliente_username: perfil.username,
      mensagem_recebida: dados.mensagemRecebida,
      tipo_resposta: dados.tipoResposta,
      resposta_enviada: dados.respostaEnviada,
      status: dados.status,
      erro_detalhe: dados.erroDetalhe,
    });

    if (error) {
      console.error("Falha ao registrar atendimento (não afeta a resposta já enviada ao cliente):", error);
    }
  } catch (erro) {
    console.error("Falha ao registrar atendimento (não afeta a resposta já enviada ao cliente):", erro);
  }
}
