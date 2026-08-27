import type { ReactNode } from "react";
import { criarClienteAdmin } from "@/lib/supabase/admin";

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
    <main className="mx-auto max-w-xl px-6 py-10">
      <a href="/contas" className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pras contas
      </a>

      {conta ? (
        <>
          <h1 className="mt-2 text-xl font-semibold">{conta.page_name}</h1>
          <p className="mt-1 text-sm text-neutral-400">@{conta.instagram_username}</p>

          <nav className="mt-6 flex gap-2 border-b border-neutral-800 pb-3">
            <a
              href={`/contas/${conta.id}/palavras-chave`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              Palavras-chave
            </a>
            <a
              href={`/contas/${conta.id}/gemini`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              Gemini
            </a>
          </nav>

          <div className="mt-6">{children}</div>
        </>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">Conta não encontrada.</p>
      )}
    </main>
  );
}
