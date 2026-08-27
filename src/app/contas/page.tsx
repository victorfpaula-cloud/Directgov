import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MENSAGENS_DE_ERRO: Record<string, string> = {
  parametros_faltando: "O Facebook não devolveu os dados esperados. Tenta conectar de novo.",
  state_invalido: "Essa tentativa de login expirou ou já foi usada. Tenta conectar de novo.",
  sem_paginas_com_instagram:
    "Nenhuma das suas Páginas do Facebook tem uma conta do Instagram profissional vinculada.",
  falha_na_conexao: "Deu um erro conectando com o Facebook. Tenta de novo em instantes.",
  escolha_invalida: "Não veio nenhuma conta selecionada.",
  conexao_expirada: "Essa conexão expirou. Começa de novo clicando em Adicionar conta.",
  pagina_nao_encontrada: "Essa conta não estava mais na lista. Tenta conectar de novo.",
  falha_ao_salvar_conta: "Deu um erro salvando a conta. Tenta de novo em instantes.",
};

export default async function ContasPage({
  searchParams,
}: {
  searchParams: { erro?: string; conectada?: string; aviso?: string; detalhe?: string };
}) {
  const admin = criarClienteAdmin();
  const { data: contas } = await admin
    .from("chatbot_accounts")
    .select("id, page_name, instagram_username, active")
    .order("created_at", { ascending: true });

  const mensagemDeErro = searchParams.erro ? MENSAGENS_DE_ERRO[searchParams.erro] : null;
  const avisoFalhaWebhook = searchParams.aviso === "falha_ao_inscrever_webhook";

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-xl font-semibold">Contas conectadas</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Atendimento automático de Instagram Direct — suas contas conectadas.
      </p>

      {searchParams.conectada && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Conta conectada com sucesso.
        </div>
      )}

      {mensagemDeErro && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {mensagemDeErro}
        </div>
      )}

      {avisoFalhaWebhook && (
        <div className="mt-4 rounded-lg border border-yellow-900 bg-yellow-950 px-4 py-2 text-sm text-yellow-300">
          <p>
            A conta foi conectada, mas não conseguimos inscrever ela pra receber mensagens (o
            Facebook recusou o pedido). Tenta conectar essa mesma conta de novo em instantes.
          </p>
          {searchParams.detalhe && (
            <p className="mt-2 rounded-md bg-yellow-900/40 px-2 py-1 font-mono text-xs text-yellow-200">
              Motivo do Facebook: {searchParams.detalhe}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(contas ?? []).map((conta) => (
          <div
            key={conta.id}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{conta.page_name}</div>
                <div className="text-xs text-neutral-400">@{conta.instagram_username}</div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  conta.active
                    ? "border border-green-900 bg-green-950 text-green-300"
                    : "border border-neutral-700 bg-neutral-800 text-neutral-400"
                }`}
              >
                {conta.active ? "Ativa" : "Pausada"}
              </span>
            </div>
            <a
              href={`/contas/${conta.id}/palavras-chave`}
              className="mt-2 inline-block text-xs text-neutral-400 underline hover:text-neutral-300"
            >
              Palavras-chave
            </a>
          </div>
        ))}

        {(contas ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhuma conta conectada ainda.
          </p>
        )}
      </div>

      <a
        href="/api/auth/facebook/start"
        className="mt-4 flex items-center justify-center rounded-xl border border-dashed border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-300 hover:border-neutral-500"
      >
        + Adicionar conta
      </a>
    </main>
  );
}
