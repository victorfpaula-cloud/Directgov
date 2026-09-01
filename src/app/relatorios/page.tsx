import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BotaoImprimir } from "./BotaoImprimir";

export const dynamic = "force-dynamic";

type DadosDoRelatorio = {
  totalRecebidas: number;
  totalRespondidas: number;
  cidadaosUnicos: number;
  porSetor: { nome: string; quantidade: number }[];
};

function mesAtualISO(): string {
  const agora = new Date();
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
}

function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, mesNumero] = mes.split("-").map((v) => parseInt(v, 10));
  const inicio = new Date(Date.UTC(ano, mesNumero - 1, 1));
  const fim = new Date(Date.UTC(ano, mesNumero, 1));
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

function nomeDoMes(mes: string): string {
  const [ano, mesNumero] = mes.split("-").map((v) => parseInt(v, 10));
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mesNumero - 1, 1))
  );
}

async function buscarDadosDoRelatorio(
  admin: ReturnType<typeof criarClienteAdmin>,
  prefeituraId: string,
  mes: string
): Promise<DadosDoRelatorio> {
  const { inicio, fim } = limitesDoMes(mes);

  const { data: contas } = await admin
    .from("directgov_contas")
    .select("id")
    .eq("prefeitura_id", prefeituraId);

  const contaIds = (contas ?? []).map((c) => c.id);

  if (contaIds.length === 0) {
    return { totalRecebidas: 0, totalRespondidas: 0, cidadaosUnicos: 0, porSetor: [] };
  }

  const { data: mensagens } = await admin
    .from("directgov_mensagens")
    .select("direcao, instagram_scoped_id, setor_id")
    .in("conta_id", contaIds)
    .gte("created_at", inicio)
    .lt("created_at", fim);

  const recebidas = (mensagens ?? []).filter((m) => m.direcao === "recebida");
  const respondidas = (mensagens ?? []).filter((m) => m.direcao === "enviada");
  const cidadaosUnicos = new Set(recebidas.map((m) => m.instagram_scoped_id)).size;

  const contagemPorSetor = new Map<string, number>();
  for (const m of respondidas) {
    if (!m.setor_id) continue;
    contagemPorSetor.set(m.setor_id, (contagemPorSetor.get(m.setor_id) ?? 0) + 1);
  }

  const setorIds = Array.from(contagemPorSetor.keys());
  const { data: setores } =
    setorIds.length > 0
      ? await admin.from("directgov_setores").select("id, nome").in("id", setorIds)
      : { data: [] as { id: string; nome: string }[] };

  const porSetor = (setores ?? [])
    .map((s) => ({ nome: s.nome, quantidade: contagemPorSetor.get(s.id) ?? 0 }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return {
    totalRecebidas: recebidas.length,
    totalRespondidas: respondidas.length,
    cidadaosUnicos,
    porSetor,
  };
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { prefeitura_id?: string; mes?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: prefeituras } = await admin
    .from("directgov_prefeituras")
    .select("id, nome")
    .order("nome", { ascending: true });

  const prefeituraId = searchParams.prefeitura_id;
  const mes = searchParams.mes ?? mesAtualISO();

  const prefeituraEscolhida = (prefeituras ?? []).find((p) => p.id === prefeituraId) ?? null;

  const dados = prefeituraEscolhida
    ? await buscarDadosDoRelatorio(admin, prefeituraEscolhida.id, mes)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 print:text-black">
      <a
        href="/prefeituras"
        className="text-sm text-neutral-400 hover:text-neutral-300 print:hidden"
      >
        &larr; Voltar pras prefeituras
      </a>

      <h1 className="mt-4 text-2xl font-semibold print:text-black">Relatório de atendimentos</h1>
      <p className="mt-1 text-sm text-neutral-400 print:hidden">
        Uso interno — escolhe a prefeitura e o mês, e exporta em PDF pra enviar mensalmente.
      </p>

      <form method="GET" className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="text-xs text-neutral-400">Prefeitura</label>
          <select
            name="prefeitura_id"
            defaultValue={prefeituraId ?? ""}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          >
            <option value="">Escolha uma prefeitura</option>
            {(prefeituras ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-neutral-400">Mês</label>
          <input
            type="month"
            name="mes"
            defaultValue={mes}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Filtrar
        </button>

        {dados && <BotaoImprimir />}
      </form>

      {!prefeituraEscolhida && (
        <p className="mt-8 text-sm text-neutral-500 print:hidden">
          Escolhe uma prefeitura acima pra ver o relatório.
        </p>
      )}

      {prefeituraEscolhida && dados && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold capitalize print:text-black">
            {prefeituraEscolhida.nome} — {nomeDoMes(mes)}
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 print:border-neutral-300 print:bg-white">
              <p className="text-xs text-neutral-400 print:text-neutral-600">Mensagens recebidas</p>
              <p className="mt-1 text-2xl font-semibold print:text-black">{dados.totalRecebidas}</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 print:border-neutral-300 print:bg-white">
              <p className="text-xs text-neutral-400 print:text-neutral-600">Mensagens respondidas</p>
              <p className="mt-1 text-2xl font-semibold print:text-black">{dados.totalRespondidas}</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 print:border-neutral-300 print:bg-white">
              <p className="text-xs text-neutral-400 print:text-neutral-600">Cidadãos únicos atendidos</p>
              <p className="mt-1 text-2xl font-semibold print:text-black">{dados.cidadaosUnicos}</p>
            </div>
          </div>

          <h3 className="mt-8 text-sm font-semibold text-neutral-300 print:text-black">
            Mensagens respondidas por setor
          </h3>

          {dados.porSetor.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 print:text-neutral-600">
              Nenhuma mensagem respondida nesse mês.
            </p>
          ) : (
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-400 print:border-neutral-300 print:text-neutral-600">
                  <th className="py-2">Setor</th>
                  <th className="py-2 text-right">Mensagens respondidas</th>
                </tr>
              </thead>
              <tbody>
                {dados.porSetor.map((linha) => (
                  <tr
                    key={linha.nome}
                    className="border-b border-neutral-800 print:border-neutral-200"
                  >
                    <td className="py-2 print:text-black">{linha.nome}</td>
                    <td className="py-2 text-right print:text-black">{linha.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}
