import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { PaginaComInstagram } from "@/lib/facebookOAuth";
import ConectarForm from "./ConectarForm";

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

      <ConectarForm idPendente={idPendente} paginas={paginas} />

      <a href="/contas" className="mt-6 inline-block text-sm text-neutral-500 hover:underline">
        Cancelar e voltar
      </a>
    </main>
  );
}
