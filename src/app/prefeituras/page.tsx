import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PrefeiturasPage({
  searchParams,
}: {
  searchParams: { criada?: string; erro?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: prefeituras } = await admin
    .from("directgov_prefeituras")
    .select("id, nome, slug, ativo, created_at")
    .order("created_at", { ascending: true });

  // Contagem de setores por prefeitura, pra mostrar no cartão — feita em JS a partir de uma
  // busca só (em vez de uma query por prefeitura) porque o volume é baixo (poucas prefeituras
  // na v1, ver CLAUDE.md do projeto).
  const contagemSetoresPorPrefeitura = new Map<string, number>();
  if (prefeituras && prefeituras.length > 0) {
    const { data: setores } = await admin.from("directgov_setores").select("prefeitura_id");

    for (const setor of setores ?? []) {
      contagemSetoresPorPrefeitura.set(
        setor.prefeitura_id,
        (contagemSetoresPorPrefeitura.get(setor.prefeitura_id) ?? 0) + 1
      );
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Prefeituras</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Secretaria virtual — cada prefeitura tem seus próprios setores e base de conhecimento.
          </p>
        </div>

        <a
          href="/relatorios"
          className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:bg-neutral-950"
        >
          Relatório de atendimentos
        </a>
      </div>

      {searchParams.criada && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Prefeitura criada, com os 22 setores padrão já cadastrados.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(prefeituras ?? []).map((prefeitura) => (
          <a
            key={prefeitura.id}
            href={`/prefeituras/${prefeitura.id}`}
            className={`group flex flex-col rounded-2xl border bg-neutral-800 p-5 shadow-lg shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl ${
              prefeitura.ativo ? "border-neutral-700" : "border-red-950/60"
            }`}
          >
            <span
              className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                prefeitura.ativo
                  ? "border-green-900 bg-green-950 text-green-300"
                  : "border-red-900 bg-red-950 text-red-400"
              }`}
            >
              {prefeitura.ativo ? "Ativa" : "Inativa"}
            </span>

            <p className="mt-4 line-clamp-2 min-h-[2.5rem] font-medium leading-tight text-neutral-100">
              {prefeitura.nome}
            </p>
            <p className="text-sm text-neutral-500">/{prefeitura.slug}</p>

            <p className="mt-3 text-xs text-neutral-400">
              {contagemSetoresPorPrefeitura.get(prefeitura.id) ?? 0} setor(es) cadastrado(s)
            </p>
          </a>
        ))}

        <a
          href="/prefeituras/nova"
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-700 p-5 text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-300"
        >
          <span className="mb-1 text-2xl leading-none">+</span>
          <span className="text-sm font-medium">Nova prefeitura</span>
        </a>
      </div>

      {(prefeituras ?? []).length === 0 && (
        <p className="mt-2 text-sm text-neutral-500">Nenhuma prefeitura cadastrada ainda.</p>
      )}
    </main>
  );
}
