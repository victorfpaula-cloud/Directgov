import type { ReactNode } from "react";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import AbasDaConta from "./AbasDaConta";

export const dynamic = "force-dynamic";

export default async function ContaLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const admin = criarClienteAdmin();
  const { data: conta } = await admin
    .from("chatbot_accounts")
    .select("id, page_name, instagram_username")
    .eq("id", params.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/contas" className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pras contas
      </a>

      {conta ? (
        <>
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-lg shadow-black/40">
            <h1 className="text-xl font-semibold">{conta.page_name}</h1>
            <p className="mt-1 text-sm text-neutral-400">@{conta.instagram_username}</p>

            <AbasDaConta contaId={conta.id} />

            <div className="mt-6">{children}</div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">Conta não encontrada.</p>
      )}
    </main>
  );
}
