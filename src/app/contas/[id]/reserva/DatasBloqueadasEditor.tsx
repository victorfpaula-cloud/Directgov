"use client";

import { useState } from "react";

// Converte o valor que o <input type="date"> devolve ("AAAA-MM-DD") pro formato que o resto do
// sistema já entende ("DD/MM/AAAA", igual ao campo de texto livre que existia antes).
function paraDDMMAAAA(valorInputDate: string): string | null {
  const match = valorInputDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
}

// Caminho inverso, só usado pra ordenar as datas cronologicamente (string "AAAA-MM-DD" ordena
// certinho com comparação de texto normal).
function paraChaveDeOrdenacao(valorDDMMAAAA: string): string {
  const match = valorDDMMAAAA.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return valorDDMMAAAA;
  const [, dia, mes, ano] = match;
  return `${ano}-${mes}-${dia}`;
}

/**
 * Editor de "datas bloqueadas" — em vez de um campo de texto livre, cada data é adicionada uma de
 * cada vez (toca em "+ Adicionar data", escolhe no calendário, toca em "Salvar"), aparecendo como
 * uma etiqueta com um "x" pra remover depois. Por baixo dos panos continua alimentando um campo
 * escondido com o mesmo formato de texto (datas separadas por vírgula) que o backend já lê — não
 * precisou mudar nada no banco nem no fluxo de reserva por causa dessa mudança de visual.
 */
export default function DatasBloqueadasEditor({
  nome,
  valorInicial,
}: {
  nome: string;
  valorInicial: string;
}) {
  const [datas, setDatas] = useState<string[]>(
    valorInicial
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean)
  );
  const [adicionando, setAdicionando] = useState(false);
  const [novaData, setNovaData] = useState("");

  function salvarNovaData() {
    const convertida = paraDDMMAAAA(novaData);
    if (!convertida) return;

    setDatas((atual) => {
      if (atual.includes(convertida)) return atual;
      return [...atual, convertida].sort((a, b) =>
        paraChaveDeOrdenacao(a).localeCompare(paraChaveDeOrdenacao(b))
      );
    });

    setNovaData("");
    setAdicionando(false);
  }

  function removerData(data: string) {
    setDatas((atual) => atual.filter((d) => d !== data));
  }

  return (
    <div>
      <input type="hidden" name={nome} value={datas.join(", ")} />

      {datas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {datas.map((data) => (
            <span
              key={data}
              className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-sm text-neutral-200"
            >
              {data}
              <button
                type="button"
                onClick={() => removerData(data)}
                className="text-neutral-500 hover:text-red-400"
                aria-label={`Remover ${data}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {datas.length === 0 && !adicionando && (
        <p className="mt-1 text-xs text-neutral-500">Nenhuma data bloqueada no momento.</p>
      )}

      {adicionando ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={novaData}
            onChange={(evento) => setNovaData(evento.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={salvarNovaData}
            disabled={!novaData}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-40"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => {
              setAdicionando(false);
              setNovaData("");
            }}
            className="text-sm text-neutral-500 hover:text-neutral-300"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          className="mt-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
        >
          + Adicionar data
        </button>
      )}
    </div>
  );
}
