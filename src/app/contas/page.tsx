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

// Cores do círculo de inicial de cada conta — só um jeito de dar uma diferenciada visual entre
// contas, escolhida de forma estável a partir do id (a mesma conta sempre cai na mesma cor).
const CORES_AVATAR = [
  "bg-emerald-950 text-emerald-300",
  "bg-sky-950 text-sky-300",
  "bg-amber-950 text-amber-300",
  "bg-fuchsia-950 text-fuchsia-300",
  "bg-rose-950 text-rose-300",
];

function corAvatar(id: string): string {
  let soma = 0;
  for (const caractere of id) soma += caractere.charCodeAt(0);
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}

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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Contas conectadas</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Atendimento automático de Instagram Direct — suas contas conectadas.
      </p>

      {searchParams.conectada && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Conta conectada com sucesso.
        </div>
      )}

      {mensagemDeErro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
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
            <p className="mt-2 break-words rounded-md bg-yellow-900/40 px-2 py-1 font-mono text-xs text-yellow-200">
              Motivo do Facebook: {searchParams.detalhe}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(contas ?? []).map((conta) => (
          <div
            key={conta.id}
            className={`rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-lg shadow-black/40 transition ${
              conta.active ? "" : "opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold ${corAvatar(
                  conta.id
                )}`}
              >
                {conta.page_name.charAt(0).toUpperCase()}
              </div>
              {!conta.active && (
                <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
                  pausada
                </span>
              )}
            </div>

            <p className="mt-3 flex items-center gap-1.5 font-medium text-neutral-100">
              {conta.active && (
                <span
                  title="Ativa"
                  aria-label="Ativa"
                  className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-500"
                />
              )}
              {conta.page_name}
            </p>
            <p className="text-sm text-neutral-500">@{conta.instagram_username}</p>

            <a
              href={`/contas/${conta.id}/palavras-chave`}
              className="mt-4 inline-block w-full rounded-lg border border-neutral-700 px-3 py-1.5 text-center text-xs font-medium text-neutral-300 hover:bg-neutral-800"
            >
              Configurar atendimento
            </a>
          </div>
        ))}

        <a
          href="/api/auth/facebook/start"
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-700 p-5 text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-300"
        >
          <span className="mb-1 text-2xl leading-none">+</span>
          <span className="text-sm font-medium">Adicionar conta</span>
        </a>
      </div>

      {(contas ?? []).length === 0 && (
        <p className="mt-2 text-sm text-neutral-500">Nenhuma conta conectada ainda.</p>
      )}
    </main>
  );
}
