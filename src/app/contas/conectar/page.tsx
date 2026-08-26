import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { PaginaComInstagram } from "@/lib/facebookOAuth";

export const dynamic = "force-dynamic";

export default async function ConectarContaPage({
  searchParams,
}: {
  searchParams: { pendente?: string };
}) {
  const idPendente = searchParams.pendente;

  if (!idPendente) {
    return (
      <main className="mx-auto max-w-xl px-6 py-10">
        <p className="text-sm text-neutral-400">
          Nenhuma conexão em andamento.{" "}
          <a href="/contas" className="text-neutral-200 underline">
            Voltar
          </a>
        </p>
      </main>
    );
  }

  const admin = criarClienteAdmin();
  const { data: pendente } = await admin
    .from("chatbot_pending_connections")
    .select("pages")
    .eq("id", idPendente)
    .maybeSingle();

  if (!pendente) {
    return (
      <main className="mx-auto max-w-xl px-6 py-10">
        <p className="text-sm text-neutral-400">
          Essa conexão expirou.{" "}
          <a href="/contas" className="text-neutral-200 underline">
            Voltar e tentar de novo
          </a>
        </p>
      </main>
    );
  }

  const paginas = pendente.pages as PaginaComInstagram[];

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-xl font-semibold">Qual conta você quer conectar?</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Encontramos {paginas.length} Página(s) do Facebook com Instagram vinculado.
      </p>

      <form action="/api/contas/finalizar" method="POST" className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="pendente" value={idPendente} />

        {paginas.map((pagina) => (
          <label
            key={pagina.page_id}
            className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 has-[:checked]:border-neutral-400"
          >
            <div>
              <div className="text-sm font-medium">{pagina.page_name}</div>
              <div className="text-xs text-neutral-400">@{pagina.instagram_username}</div>
            </div>
            <input type="radio" name="page_id" value={pagina.page_id} required />
          </label>
        ))}

        <button
          type="submit"
          className="mt-2 rounded-xl bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-950"
        >
          Conectar
        </button>
      </form>
    </main>
  );
}
