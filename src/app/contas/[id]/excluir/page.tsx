import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ExcluirContaPage({ params }: { params: { id: string } }) {
  const admin = criarClienteAdmin();
  const { data: conta } = await admin
    .from("chatbot_accounts")
    .select("id, page_name, instagram_username")
    .eq("id", params.id)
    .maybeSingle();

  if (!conta) {
    return (
      <main className="mx-auto max-w-lg px-6 py-10">
        <p className="text-sm text-neutral-400">Conta não encontrada.</p>
        <a href="/contas" className="mt-4 inline-block text-sm text-neutral-400 hover:text-neutral-300">
          &larr; Voltar pras contas
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <a href="/contas" className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pras contas
      </a>

      <div className="mt-4 rounded-2xl border border-red-950 bg-neutral-950 p-6 shadow-lg shadow-black/40">
        <h1 className="text-lg font-semibold text-red-300">Excluir conta</h1>

        <p className="mt-3 text-sm text-neutral-300">
          Você está prestes a excluir <strong className="text-neutral-100">{conta.page_name}</strong>
          {conta.instagram_username ? (
            <span className="text-neutral-400"> (@{conta.instagram_username})</span>
          ) : null}{" "}
          do sistema.
        </p>

        <div className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-300">
          <p>Isso apaga permanentemente, pra essa conta:</p>
          <ul className="mt-2 list-disc pl-5">
            <li>Todas as palavras-chave, configuração do Gemini e da Reserva</li>
            <li>O histórico de atendimentos</li>
            <li>O histórico de reservas confirmadas guardado no nosso banco</li>
          </ul>
          <p className="mt-2 text-red-200">
            As reservas já feitas continuam salvas na planilha do Google normalmente — isso apaga
            só a cópia que fica no nosso sistema, não a planilha.
          </p>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Não tem volta. Se é só pra parar de cobrar ou dar uma pausa, use o botão "Pausar" na tela
          de contas em vez desse — ele deixa o bot em silêncio sem apagar nada, e dá pra reativar
          depois a qualquer momento.
        </p>

        <form action="/api/contas/excluir" method="POST" className="mt-6 flex gap-3">
          <input type="hidden" name="account_id" value={conta.id} />
          <a
            href="/contas"
            className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-center text-sm font-medium text-neutral-300 hover:bg-neutral-800"
          >
            Cancelar
          </a>
          <button
            type="submit"
            className="flex-1 rounded-lg border border-red-800 bg-red-950 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-900"
          >
            Sim, excluir permanentemente
          </button>
        </form>
      </div>
    </main>
  );
}
