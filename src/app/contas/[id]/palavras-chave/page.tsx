import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PalavrasChavePage({
  params,
}: {
  params: { id: string };
}) {
  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("chatbot_accounts")
    .select("id, page_name, instagram_username")
    .eq("id", params.id)
    .maybeSingle();

  if (!conta) {
    return (
      <main className="mx-auto max-w-xl px-6 py-10">
        <p className="text-sm text-neutral-400">Conta não encontrada.</p>
        <a href="/contas" className="text-sm text-neutral-300 underline">
          Voltar
        </a>
      </main>
    );
  }

  const { data: palavrasChave } = await admin
    .from("chatbot_keywords")
    .select("id, variacoes, mensagens, ativa, created_at")
    .eq("account_id", conta.id)
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <a href="/contas" className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pras contas
      </a>
      <h1 className="mt-2 text-xl font-semibold">Palavras-chave — {conta.page_name}</h1>
      <p className="mt-1 text-sm text-neutral-400">@{conta.instagram_username}</p>

      <div className="mt-6 flex flex-col gap-3">
        {(palavrasChave ?? []).map((pc) => (
          <div
            key={pc.id}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {((pc.variacoes as string[]) ?? []).join(", ")}
              </div>
              <form action={`/api/keywords/${pc.id}/excluir`} method="POST">
                <button type="submit" className="text-xs text-red-400 hover:text-red-300">
                  Excluir
                </button>
              </form>
            </div>
            <ol className="mt-2 flex flex-col gap-1 text-xs text-neutral-400">
              {((pc.mensagens as string[]) ?? []).map((m, i) => (
                <li key={i}>
                  {i + 1}. {m}
                </li>
              ))}
            </ol>
          </div>
        ))}

        {(palavrasChave ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhuma palavra-chave cadastrada ainda.
          </p>
        )}
      </div>

      <h2 className="mt-10 text-sm font-semibold text-neutral-300">+ Nova palavra-chave</h2>

      <form action="/api/keywords" method="POST" className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="account_id" value={conta.id} />

        <div>
          <label className="text-xs text-neutral-400">
            Palavra-chave (pode colocar variações separadas por vírgula, ex: preço, valor, quanto
            custa)
          </label>
          <input
            type="text"
            name="variacoes"
            required
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Mensagens da sequência (na ordem — deixa em branco a que não for usar)
          </label>
          <div className="mt-1 flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <textarea
                key={n}
                name={`mensagem_${n}`}
                placeholder={`Mensagem ${n}`}
                rows={2}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Salvar palavra-chave
        </button>
      </form>
    </main>
  );
}
