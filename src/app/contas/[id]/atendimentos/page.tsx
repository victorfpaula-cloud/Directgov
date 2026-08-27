import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const LIMITE_DE_LINHAS = 200;

const RESPOSTA_POR_TIPO: Record<string, string> = {
  reserva: "Fluxo de reserva",
  palavra_chave: "Palavra-chave",
  gemini: "Gemini (IA)",
  sem_resposta: "Sem resposta",
};

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function BadgeDeStatus({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    respondido: "border-green-900 bg-green-950 text-green-300",
    erro: "border-red-900 bg-red-950 text-red-300",
    sem_resposta: "border-neutral-700 bg-neutral-900 text-neutral-400",
  };

  const rotulos: Record<string, string> = {
    respondido: "Respondido",
    erro: "Erro",
    sem_resposta: "Sem resposta",
  };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${estilos[status] ?? estilos.sem_resposta}`}>
      {rotulos[status] ?? status}
    </span>
  );
}

export default async function AtendimentosPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  const admin = criarClienteAdmin();

  const filtroDeStatus = searchParams.status;

  let consulta = admin
    .from("chatbot_atendimentos")
    .select(
      "id, instagram_scoped_id, cliente_nome, cliente_username, mensagem_recebida, tipo_resposta, resposta_enviada, status, erro_detalhe, criado_em"
    )
    .eq("account_id", params.id)
    .order("criado_em", { ascending: false })
    .limit(LIMITE_DE_LINHAS);

  if (filtroDeStatus === "respondido" || filtroDeStatus === "erro" || filtroDeStatus === "sem_resposta") {
    consulta = consulta.eq("status", filtroDeStatus);
  }

  const { data: atendimentos } = await consulta;

  const linhas = atendimentos ?? [];

  const filtros: { valor: string | undefined; rotulo: string }[] = [
    { valor: undefined, rotulo: "Todos" },
    { valor: "respondido", rotulo: "Respondido" },
    { valor: "erro", rotulo: "Erro" },
    { valor: "sem_resposta", rotulo: "Sem resposta" },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold">Atendimentos</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Histórico das últimas {LIMITE_DE_LINHAS} mensagens recebidas nessa conta, com o que o bot
        fez em resposta a cada uma — se respondeu, se deu erro, ou se ficou em silêncio (nenhuma
        palavra-chave bateu e o Gemini não está configurado).
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {filtros.map((filtro) => {
          const ativo = filtro.valor === filtroDeStatus || (!filtro.valor && !filtroDeStatus);
          const href = filtro.valor
            ? `/contas/${params.id}/atendimentos?status=${filtro.valor}`
            : `/contas/${params.id}/atendimentos`;

          return (
            <a
              key={filtro.rotulo}
              href={href}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                ativo
                  ? "border-neutral-500 bg-neutral-900 text-neutral-100"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {filtro.rotulo}
            </a>
          );
        })}
      </div>

      {linhas.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nenhum atendimento registrado ainda.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {linhas.map((atendimento) => (
            <div key={atendimento.id} className="rounded-lg border border-neutral-800 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-neutral-200">
                  {atendimento.cliente_nome ?? "Cliente"}
                  {atendimento.cliente_username ? (
                    <span className="text-neutral-500"> · @{atendimento.cliente_username}</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">{formatarDataHora(atendimento.criado_em)}</span>
                  <BadgeDeStatus status={atendimento.status} />
                </div>
              </div>

              <p className="mt-2 text-neutral-400">
                <span className="text-neutral-500">Mensagem recebida: </span>
                {atendimento.mensagem_recebida ?? "—"}
              </p>

              <p className="mt-1 text-neutral-400">
                <span className="text-neutral-500">Tipo de resposta: </span>
                {RESPOSTA_POR_TIPO[atendimento.tipo_resposta] ?? atendimento.tipo_resposta}
              </p>

              {atendimento.resposta_enviada && (
                <p className="mt-1 text-neutral-400">
                  <span className="text-neutral-500">Resposta enviada: </span>
                  {atendimento.resposta_enviada}
                </p>
              )}

              {atendimento.status === "erro" && atendimento.erro_detalhe && (
                <p className="mt-2 rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
                  {atendimento.erro_detalhe}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
