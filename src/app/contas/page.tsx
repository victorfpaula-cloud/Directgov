import { criarClienteAdmin } from "@/lib/supabase/admin";
import { buscarFotoDePerfilDaConta } from "@/lib/metaMessaging";
import { BotaoPausar } from "./BotaoPausar";
import { AvatarConta } from "./AvatarConta";

export const dynamic = "force-dynamic";

const MENSAGENS_DE_ERRO: Record<string, string> = {
  parametros_faltando: "O Facebook não devolveu os dados esperados. Tenta conectar de novo.",
  state_invalido: "Essa tentativa de login expirou ou já foi usada. Tenta conectar de novo.",
  sem_paginas_com_instagram:
    "Nenhuma das suas Páginas do Facebook tem uma conta do Instagram profissional vinculada.",
  falha_na_conexao: "Deu um erro conectando com o Facebook. Tenta de novo em instantes.",
  escolha_invalida: "Não veio nenhuma conta selecionada.",
  conexao_expirada: "Essa conexão expirou. Começa de novo clicando em Adicionar conta.",
  pagina_nao_encontrada: "Essa conta não estava mais na lista. Tenta conectar de novo.",
  falha_ao_salvar_conta: "Deu um erro salvando a conta. Tenta de novo em instantes.",
  falha_ao_pausar: "Deu um erro pausando/reativando a conta. Tenta de novo em instantes.",
  falha_ao_excluir: "Deu um erro excluindo a conta. Tenta de novo em instantes.",
};

// Estilo de cada conta (avatar + brilho ao passar o mouse) — escolhido de forma estável a partir
// do id, então a mesma conta sempre cai no mesmo estilo. Cartão em si ficou num cinza mais claro
// (neutral-800) que a página (neutral-900) — antes era o contrário (cartão mais escuro que a
// página), que o Victor achou "muito preto" — assim os cartões ficam claramente destacados/
// "flutuando" sobre o fundo, em vez de se misturar com ele.
const ESTILOS_CONTA = [
  { avatar: "bg-emerald-950 text-emerald-300", brilho: "hover:shadow-emerald-950/50" },
  { avatar: "bg-sky-950 text-sky-300", brilho: "hover:shadow-sky-950/50" },
  { avatar: "bg-amber-950 text-amber-300", brilho: "hover:shadow-amber-950/50" },
  { avatar: "bg-fuchsia-950 text-fuchsia-300", brilho: "hover:shadow-fuchsia-950/50" },
  { avatar: "bg-rose-950 text-rose-300", brilho: "hover:shadow-rose-950/50" },
];

function estiloDaConta(id: string) {
  let soma = 0;
  for (const caractere of id) soma += caractere.charCodeAt(0);
  return ESTILOS_CONTA[soma % ESTILOS_CONTA.length];
}

// Cor da faixa no topo do cartão — agora é sobre STATUS, não mais sobre qual conta é: verde
// enquanto ativa e sem erro hoje, amarela quando pausada, vermelha quando ativa mas teve pelo
// menos um erro hoje (isso avisa de problema batendo o olho, antes mesmo de entrar na conta).
function corDaFaixa(conta: { active: boolean }, stats: EstatisticaDoDia) {
  if (!conta.active) return "bg-amber-500";
  if (stats.erros > 0) return "bg-red-500";
  return "bg-green-500";
}

// Meia-noite de hoje, horário de São Paulo, convertida pra um instante UTC — usado como corte
// pra contar só os atendimentos de HOJE. Brasil não tem mais horário de verão desde 2019, então
// São Paulo é sempre UTC-3 fixo (meia-noite em SP = 03:00 UTC) — não precisa de biblioteca de
// fuso horário pra isso, só somar 3 horas.
function inicioDoDiaEmSaoPauloISO(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const obter = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";

  const ano = parseInt(obter("year"), 10);
  const mes = parseInt(obter("month"), 10);
  const dia = parseInt(obter("day"), 10);

  return new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0)).toISOString();
}

type EstatisticaDoDia = { respondidas: number; erros: number };

export default async function ContasPage({
  searchParams,
}: {
  searchParams: { erro?: string; conectada?: string; aviso?: string; detalhe?: string; excluida?: string };
}) {
  const admin = criarClienteAdmin();
  const { data: contas } = await admin
    .from("chatbot_accounts")
    .select("id, page_name, instagram_username, active, access_token, instagram_user_id")
    .order("created_at", { ascending: true });

  // Foto de perfil de cada conta, buscada direto na Meta a cada abertura da tela (nunca guardada
  // no banco — ver o comentário de buscarFotoDePerfilDaConta pra entender o motivo). O access_token
  // só é usado aqui, dentro do servidor, pra fazer essa busca — nunca é passado pro componente de
  // cliente (AvatarConta só recebe a URL da foto já pronta).
  const fotosPorConta = new Map<string, string | null>();
  if (contas && contas.length > 0) {
    const resultados = await Promise.all(
      contas.map(async (conta) => ({
        id: conta.id,
        foto: await buscarFotoDePerfilDaConta(conta.access_token, conta.instagram_user_id),
      }))
    );
    for (const resultado of resultados) {
      fotosPorConta.set(resultado.id, resultado.foto);
    }
  }

  // "Status do dia": conta rápida de quantos atendimentos essa conta teve hoje e quantos deram
  // erro — só pra dar uma visão geral batendo o olho, sem precisar entrar em cada conta. Isso
  // roda só quando essa página é aberta (não é um relógio rodando toda hora em segundo plano —
  // essa tela já busca dado novo a cada abertura, então já vem sempre atualizado sozinho, sem
  // gastar nada além do que essa página já gasta hoje).
  const estatisticasPorConta = new Map<string, EstatisticaDoDia>();
  if (contas && contas.length > 0) {
    const { data: atendimentosDeHoje } = await admin
      .from("chatbot_atendimentos")
      .select("account_id, status")
      .gte("criado_em", inicioDoDiaEmSaoPauloISO());

    for (const atendimento of atendimentosDeHoje ?? []) {
      const atual = estatisticasPorConta.get(atendimento.account_id) ?? { respondidas: 0, erros: 0 };
      if (atendimento.status === "erro") {
        atual.erros += 1;
      } else if (atendimento.status === "respondido") {
        atual.respondidas += 1;
      }
      estatisticasPorConta.set(atendimento.account_id, atual);
    }
  }

  const mensagemDeErro = searchParams.erro ? MENSAGENS_DE_ERRO[searchParams.erro] : null;
  const avisoFalhaWebhook = searchParams.aviso === "falha_ao_inscrever_webhook";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Contas conectadas</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Atendimento automático de Instagram Direct — suas contas conectadas.
      </p>

      {searchParams.conectada && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Conta conectada com sucesso.
        </div>
      )}

      {searchParams.excluida && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Conta excluída.
        </div>
      )}

      {mensagemDeErro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {mensagemDeErro}
        </div>
      )}

      {avisoFalhaWebhook && (
        <div className="mt-4 rounded-lg border border-yellow-900 bg-yellow-950 px-4 py-2 text-sm text-yellow-300">
          <p>
            A conta foi conectada, mas não conseguimos inscrever ela pra receber mensagens (o
            Facebook recusou o pedido). Tenta conectar essa mesma conta de novo em instantes.
          </p>
          {searchParams.detalhe && (
            <p className="mt-2 break-words rounded-md bg-yellow-900/40 px-2 py-1 font-mono text-xs text-yellow-200">
              Motivo do Facebook: {searchParams.detalhe}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(contas ?? []).map((conta) => {
          const estilo = estiloDaConta(conta.id);
          const stats = estatisticasPorConta.get(conta.id) ?? { respondidas: 0, erros: 0 };

          return (
            <div
              key={conta.id}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-neutral-800 pt-6 shadow-lg shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl ${estilo.brilho} ${
                conta.active ? "border-neutral-700" : "border-red-950/60"
              }`}
            >
              {/* Faixa colorida no topo do cartão — verde ativa, amarela pausada, vermelha com erro hoje. */}
              <span className={`absolute inset-x-0 top-0 h-1 ${corDaFaixa(conta, stats)}`} />

              <div className="flex flex-col px-5 pb-5">
                <div className="flex items-center justify-between">
                  <AvatarConta
                    fotoUrl={fotosPorConta.get(conta.id) ?? null}
                    letra={conta.page_name.charAt(0).toUpperCase()}
                    corDeFundo={estilo.avatar}
                    corDoAnel={conta.active ? "ring-neutral-700" : "ring-red-900"}
                  />

                  <span
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      conta.active
                        ? "border-green-900 bg-green-950 text-green-300"
                        : "border-red-900 bg-red-950 text-red-400"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        conta.active ? "animate-pulse bg-green-500" : "bg-red-500"
                      }`}
                    />
                    {conta.active ? "Ativa" : "Pausada"}
                  </span>
                </div>

                <p className="mt-4 font-medium text-neutral-100">{conta.page_name}</p>
                <p className="text-sm text-neutral-500">@{conta.instagram_username}</p>

                {/* Status do dia — quantos atendimentos hoje, e quantos deram erro (se houver). */}
                <a
                  href={`/contas/${conta.id}/atendimentos`}
                  className="mt-3 flex flex-wrap items-center gap-2 text-xs"
                >
                  <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300">
                    {stats.respondidas} respondida{stats.respondidas === 1 ? "" : "s"} hoje
                  </span>
                  {stats.erros > 0 && (
                    <span className="flex items-center gap-1 rounded-full border border-red-900 bg-red-950 px-2 py-0.5 font-medium text-red-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {stats.erros} erro{stats.erros === 1 ? "" : "s"} hoje
                    </span>
                  )}
                </a>

                <div className="mt-5 flex flex-col gap-2">
                  <a
                    href={`/contas/${conta.id}/palavras-chave`}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-center text-xs font-medium text-neutral-300 hover:bg-neutral-950"
                  >
                    Configurar atendimento
                  </a>

                  <div className="flex gap-2">
                    <form action="/api/contas/status" method="POST" className="flex-1">
                      <input type="hidden" name="account_id" value={conta.id} />
                      <input type="hidden" name="ativar" value={conta.active ? "0" : "1"} />
                      <BotaoPausar ativo={conta.active} />
                    </form>

                    <a
                      href={`/contas/${conta.id}/excluir`}
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-center text-xs font-medium text-neutral-500 hover:border-red-900 hover:bg-red-950/40 hover:text-red-400"
                    >
                      Excluir
                    </a>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <a
          href="/api/auth/facebook/start"
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-700 p-5 text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-300"
        >
          <span className="mb-1 text-2xl leading-none">+</span>
          <span className="text-sm font-medium">Adicionar conta</span>
        </a>
      </div>

      {(contas ?? []).length === 0 && (
        <p className="mt-2 text-sm text-neutral-500">Nenhuma conta conectada ainda.</p>
      )}
    </main>
  );
}
