import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PalavrasChavePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: palavrasChave } = await admin
    .from("chatbot_keywords")
    .select("id, palavra_chave, mensagens, pausa_entre_mensagens_ms, ativo, created_at")
    .eq("account_id", params.id)
    .order("created_at", { ascending: true });

  return (
    <div>
      <h2 className="text-lg font-semibold">Palavras-chave</h2>

      {searchParams.erro && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {(palavrasChave ?? []).map((pc) => (
          <div
            key={pc.id}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{pc.palavra_chave}</div>
              <form action={`/api/keywords/${pc.id}/excluir`} method="POST">
                <button type="submit" className="text-xs text-red-400 hover:text-red-300">
                  Excluir
                </button>
              </form>
            </div>
            {pc.pausa_entre_mensagens_ms ? (
              <p className="mt-1 text-xs text-neutral-500">
                Pausa entre mensagens: {pc.pausa_entre_mensagens_ms}ms
              </p>
            ) : null}
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

      <h3 className="mt-8 text-sm font-semibold text-neutral-300">+ Nova palavra-chave</h3>

      <form action="/api/keywords" method="POST" className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="account_id" value={params.id} />

        <div>
          <label className="text-xs text-neutral-400">
            Palavra-chave (pode colocar variações separadas por vírgula, ex: preço, valor, quanto
            custa)
          </label>
          <input
            type="text"
            name="palavra_chave"
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

        <div>
          <label className="text-xs text-neutral-400">
            Pausa entre as mensagens, em milissegundos (opcional — deixa em branco pra mandar tudo
            de uma vez, sem pausa)
          </label>
          <input
            type="number"
            name="pausa_entre_mensagens_ms"
            min={0}
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="mt-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Salvar palavra-chave
        </button>
      </form>
    </div>
  );
}
