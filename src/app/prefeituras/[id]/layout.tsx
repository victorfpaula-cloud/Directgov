import type { ReactNode } from "react";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PrefeituraLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const admin = criarClienteAdmin();
  const { data: prefeitura } = await admin
    .from("directgov_prefeituras")
    .select("id, nome, slug")
    .eq("id", params.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <a href="/prefeituras" className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pras prefeituras
      </a>

      {prefeitura ? (
        <>
          <div className="mt-4">
            <h1 className="text-2xl font-semibold">{prefeitura.nome}</h1>
            <p className="mt-1 text-sm text-neutral-400">/{prefeitura.slug}</p>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2 border-b border-neutral-800 pb-3">
            <a
              href={`/prefeituras/${prefeitura.id}`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Setores
            </a>
            <a
              href={`/prefeituras/${prefeitura.id}/conta`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Conta do Instagram
            </a>
            <a
              href={`/prefeituras/${prefeitura.id}/guardrails`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Guardrails
            </a>
          </nav>

          <div className="mt-6">{children}</div>
        </>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">Prefeitura não encontrada.</p>
      )}
    </main>
  );
}
