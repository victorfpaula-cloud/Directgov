import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const LIMITE_DE_LINHAS = 300;

const RESPOSTA_POR_TIPO: Record<string, string> = {
  reserva: "Fluxo de reserva",
  palavra_chave: "Palavra-chave",
  gemini: "Gemini (IA)",
  sem_resposta: "Sem resposta",
};

type Atendimento = {
  id: string;
  instagram_scoped_id: string;
  cliente_nome: string | null;
  cliente_username: string | null;
  mensagem_recebida: string | null;
  tipo_resposta: string;
  resposta_enviada: string | null;
  status: string;
  erro_detalhe: string | null;
  criado_em: string;
};

type GrupoPorCliente = {
  instagramScopedId: string;
  clienteNome: string | null;
  clienteUsername: string | null;
  atendimentos: Atendimento[];
  temErro: boolean;
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

/**
 * Agrupa os atendimentos por cliente (pelo IGSID, o id do cliente no Direct — mais confiável que
 * nome/@usuário, que podem mudar). Como a lista já vem ordenada mais recente primeiro, o primeiro
 * atendimento de cada cliente que aparece durante a montagem dos grupos já é o mais recente DELE,
 * e os grupos acabam naturalmente na ordem "cliente mais ativo recentemente primeiro" — sem
 * precisar ordenar de novo depois.
 */
function agruparPorCliente(atendimentos: Atendimento[]): GrupoPorCliente[] {
  const grupos = new Map<string, GrupoPorCliente>();

  for (const atendimento of atendimentos) {
    const chave = atendimento.instagram_scoped_id;
    let grupo = grupos.get(chave);

    if (!grupo) {
      grupo = {
        instagramScopedId: chave,
        clienteNome: atendimento.cliente_nome,
        clienteUsername: atendimento.cliente_username,
        atendimentos: [],
        temErro: false,
      };
      grupos.set(chave, grupo);
    }

    grupo.atendimentos.push(atendimento);
    if (atendimento.status === "erro") grupo.temErro = true;
  }

  return Array.from(grupos.values());
}

function CartaoDeAtendimento({ atendimento }: { atendimento: Atendimento }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm shadow-sm shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">{formatarDataHora(atendimento.criado_em)}</span>
        <BadgeDeStatus status={atendimento.status} />
      </div>

      <p className="mt-2 break-words text-neutral-400">
        <span className="text-neutral-500">Mensagem recebida: </span>
        {atendimento.mensagem_recebida ?? "—"}
      </p>

      <p className="mt-1 break-words text-neutral-400">
        <span className="text-neutral-500">Tipo de resposta: </span>
        {RESPOSTA_POR_TIPO[atendimento.tipo_resposta] ?? atendimento.tipo_resposta}
      </p>

      {atendimento.resposta_enviada && (
        <p className="mt-1 break-words text-neutral-400">
          <span className="text-neutral-500">Resposta enviada: </span>
          {atendimento.resposta_enviada}
        </p>
      )}

      {atendimento.status === "erro" && atendimento.erro_detalhe && (
        <p className="mt-2 break-words rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
          {atendimento.erro_detalhe}
        </p>
      )}
    </div>
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

  const linhas: Atendimento[] = atendimentos ?? [];
  const grupos = agruparPorCliente(linhas);

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
        Histórico das últimas {LIMITE_DE_LINHAS} mensagens recebidas nessa conta, agrupadas por
        cliente — toca num cliente pra ver tudo que ele mandou e clicou. Cada atendimento mostra o
        que o bot fez em resposta — se respondeu, se deu erro, ou se ficou em silêncio (nenhuma
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

      {grupos.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nenhum atendimento registrado ainda.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {grupos.map((grupo) => (
            <details
              key={grupo.instagramScopedId}
              className="group rounded-lg border border-neutral-800 bg-neutral-950 shadow-md shadow-black/30 open:border-neutral-600"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 transition-transform group-open:rotate-90">▸</span>
                  <span className="break-words font-medium text-neutral-200">
                    {grupo.clienteNome ?? "Cliente"}
                    {grupo.clienteUsername ? (
                      <span className="text-neutral-500"> · @{grupo.clienteUsername}</span>
                    ) : null}
                  </span>
                  {grupo.temErro && (
                    <span className="rounded-full border border-red-900 bg-red-950 px-2 py-0.5 text-xs text-red-300">
                      Erro
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>
                    {grupo.atendimentos.length}{" "}
                    {grupo.atendimentos.length === 1 ? "atendimento" : "atendimentos"}
                  </span>
                  <span>· último em {formatarDataHora(grupo.atendimentos[0].criado_em)}</span>
                </div>
              </summary>

              <div className="flex flex-col gap-3 border-t border-neutral-800 p-4 pt-3">
                {grupo.atendimentos.map((atendimento) => (
                  <CartaoDeAtendimento key={atendimento.id} atendimento={atendimento} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
