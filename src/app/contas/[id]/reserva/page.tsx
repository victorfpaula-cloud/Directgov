import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ReservaConfigPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; salvo?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: config } = await admin
    .from("chatbot_account_settings")
    .select(
      "palavra_chave_reserva, reserva_regras_texto, reserva_limite_normal, reserva_limite_maximo, reserva_mensagem_limite_maximo, reserva_cutoff_horario, reserva_pausa_ativa, reserva_pausa_data, reserva_pausa_mensagem, google_sheet_id"
    )
    .eq("account_id", params.id)
    .maybeSingle();

  const cutoffParaInput = config?.reserva_cutoff_horario
    ? config.reserva_cutoff_horario.slice(0, 5)
    : "";

  return (
    <div>
      <h2 className="text-lg font-semibold">Reserva</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Fluxo automático de reserva: só entra em ação quando o cliente manda a palavra-chave
        configurada aqui. Depois disso, o bot pergunta data, período, quantidade de pessoas e
        WhatsApp, mostra as regras e pede confirmação — tudo por conta própria.
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

      <form action="/api/reserva-config" method="POST" className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="account_id" value={params.id} />

        <div>
          <label className="text-xs text-neutral-400">
            Palavra-chave que inicia o fluxo de reserva
          </label>
          <input
            type="text"
            name="palavra_chave_reserva"
            defaultValue={config?.palavra_chave_reserva ?? ""}
            placeholder="Ex: reserva, reservar, quero reservar"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Pode escrever mais de uma variação separada por vírgula.
          </p>
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Regras (mostradas antes do pedido de confirmação)
          </label>
          <textarea
            name="reserva_regras_texto"
            rows={6}
            defaultValue={config?.reserva_regras_texto ?? ""}
            placeholder="Ex: tolerância de 15 minutos, mesa liberada após esse prazo"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-neutral-400">
              Limite normal de pessoas (só informativo)
            </label>
            <input
              type="number"
              min={0}
              name="reserva_limite_normal"
              defaultValue={config?.reserva_limite_normal ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400">
              Limite máximo de pessoas (acima disso, recusa)
            </label>
            <input
              type="number"
              min={0}
              name="reserva_limite_maximo"
              defaultValue={config?.reserva_limite_maximo ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-400">Mensagem quando passa do limite máximo</label>
          <textarea
            name="reserva_mensagem_limite_maximo"
            rows={3}
            defaultValue={config?.reserva_mensagem_limite_maximo ?? ""}
            placeholder="Nossas reservas do dia já estão encerradas porque todas as mesas já foram preenchidas. Nosso atendimento será apenas por ordem de chegada."
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Horário limite pra reservar "Hoje" (depois disso, some a opção "Hoje" — "Amanhã" e
            "Outro dia" continuam disponíveis)
          </label>
          <input
            type="time"
            name="reserva_cutoff_horario"
            defaultValue={cutoffParaInput}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400">ID da planilha do Google Sheets</label>
          <input
            type="text"
            name="google_sheet_id"
            defaultValue={config?.google_sheet_id ?? ""}
            placeholder="Cola aqui só o ID (o trecho entre /d/ e /edit na URL da planilha)"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-lg border border-neutral-800 p-4">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              name="reserva_pausa_ativa"
              defaultChecked={config?.reserva_pausa_ativa ?? false}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-900"
            />
            Pausar reservas temporariamente
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            Enquanto estiver marcado, quem mandar a palavra-chave de reserva recebe a mensagem
            abaixo em vez de começar o fluxo.
          </p>

          <div className="mt-3">
            <label className="text-xs text-neutral-400">Até quando (opcional, só anotação)</label>
            <input
              type="date"
              name="reserva_pausa_data"
              defaultValue={config?.reserva_pausa_data ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-3">
            <label className="text-xs text-neutral-400">Mensagem durante a pausa</label>
            <textarea
              name="reserva_pausa_mensagem"
              rows={3}
              defaultValue={config?.reserva_pausa_mensagem ?? ""}
              placeholder="No momento não estamos aceitando novas reservas por aqui. Assim que reabrirmos, avisamos por aqui."
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            />
          </div>
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
