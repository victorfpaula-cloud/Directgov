import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function GeminiConfigPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; salvo?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: config } = await admin
    .from("chatbot_account_settings")
    .select("tom_de_voz, guardrails, base_conhecimento")
    .eq("account_id", params.id)
    .maybeSingle();

  return (
    <div>
      <h2 className="text-lg font-semibold">Gemini — atendimento por IA</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Usado quando a mensagem do cliente não bate com nenhuma palavra-chave. Deixa em branco pra
        não responder nesses casos.
      </p>

      {searchParams.salvo && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Configuração salva.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <form action="/api/gemini-config" method="POST" className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="account_id" value={params.id} />

        <div>
          <label className="text-xs text-neutral-400">Tom de voz</label>
          <textarea
            name="tom_de_voz"
            rows={3}
            defaultValue={config?.tom_de_voz ?? ""}
            placeholder="Ex: jovem, descontraído, fala como uma conversa entre amigos, sem formalidade"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Guardrails (o que ele NUNCA pode fazer ou falar)
          </label>
          <textarea
            name="guardrails"
            rows={8}
            defaultValue={config?.guardrails ?? ""}
            placeholder="Ex: nunca falar de política, religião, concorrentes; nunca fazer reserva ou anotar pedido direto"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Base de conhecimento (sobre o negócio, cardápio, horários, endereço etc.)
          </label>
          <textarea
            name="base_conhecimento"
            rows={16}
            defaultValue={config?.base_conhecimento ?? ""}
            placeholder="Cola aqui tudo que o Gemini precisa saber pra responder bem"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="mt-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Salvar configuração
        </button>
      </form>
    </div>
  );
}
