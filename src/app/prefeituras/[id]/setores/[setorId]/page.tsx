import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function EditarSetorPage({
  params,
  searchParams,
}: {
  params: { id: string; setorId: string };
  searchParams: { erro?: string; salvo?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: setor } = await admin
    .from("directgov_setores")
    .select(
      "id, nome, eh_geral, ativo, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto"
    )
    .eq("id", params.setorId)
    .eq("prefeitura_id", params.id)
    .maybeSingle();

  if (!setor) {
    return (
      <div>
        <a href={`/prefeituras/${params.id}`} className="text-sm text-neutral-400 hover:text-neutral-300">
          &larr; Voltar pros setores
        </a>
        <p className="mt-4 text-sm text-neutral-400">Setor não encontrado.</p>
      </div>
    );
  }

  return (
    <div>
      <a href={`/prefeituras/${params.id}`} className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pros setores
      </a>

      <div className="mt-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{setor.nome}</h2>
        {setor.eh_geral && (
          <span className="rounded-full border border-sky-900 bg-sky-950 px-2 py-0.5 text-[10px] font-medium text-sky-300">
            Fallback
          </span>
        )}
      </div>

      {searchParams.salvo && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Setor salvo.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <form action={`/api/setores/${setor.id}`} method="POST" className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="prefeitura_id" value={params.id} />

        <div>
          <label className="text-xs text-neutral-400">Nome do setor</label>
          <input
            type="text"
            name="nome"
            required
            defaultValue={setor.nome}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" name="ativo" value="1" defaultChecked={setor.ativo} />
          Setor ativo (aparece pra triagem escolher)
        </label>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h3 className="text-sm font-semibold text-neutral-200">Contato (opcional)</h3>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Endereço</label>
              <input
                type="text"
                name="endereco"
                defaultValue={setor.endereco ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Telefone</label>
              <input
                type="text"
                name="telefone"
                defaultValue={setor.telefone ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">E-mail</label>
              <input
                type="email"
                name="email"
                defaultValue={setor.email ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Horário de atendimento</label>
              <input
                type="text"
                name="horario_atendimento"
                placeholder="Ex: seg a sex, 8h às 17h"
                defaultValue={setor.horario_atendimento ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-neutral-400">Responsável</label>
              <input
                type="text"
                name="responsavel"
                defaultValue={setor.responsavel ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Base de conhecimento (texto que o Gemini usa pra responder sobre esse setor)
          </label>
          <textarea
            name="base_conhecimento_texto"
            rows={12}
            defaultValue={setor.base_conhecimento_texto}
            placeholder="Cola aqui tudo que esse setor precisa saber pra responder bem"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Upload de PDF/Word chega numa próxima etapa — por enquanto, é só colar o texto aqui.
          </p>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Salvar setor
        </button>
      </form>

      {!setor.eh_geral ? (
        <form
          action={`/api/setores/${setor.id}/excluir`}
          method="POST"
          className="mt-6 border-t border-neutral-800 pt-4"
        >
          <input type="hidden" name="prefeitura_id" value={params.id} />
          <button
            type="submit"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:border-red-900 hover:bg-red-950/40 hover:text-red-400"
          >
            Excluir setor
          </button>
        </form>
      ) : (
        <p className="mt-6 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
          Esse é o setor "Geral" (fallback) — não pode ser excluído. Dá pra desativar (mas não é
          recomendado, já que é o destino padrão de qualquer assunto que não bata com nenhum outro
          setor).
        </p>
      )}
    </div>
  );
}
