"use client";

import { usePathname } from "next/navigation";

const ABAS = [
  { segmento: "palavras-chave", rotulo: "Palavras-chave" },
  { segmento: "gemini", rotulo: "Gemini" },
  { segmento: "reserva", rotulo: "Reserva" },
  { segmento: "atendimentos", rotulo: "Atendimentos" },
];

/**
 * Menu de abas de cada conta (Palavras-chave / Gemini / Reserva / Atendimentos), agora destacando
 * qual aba está aberta no momento. Precisa ser Client Component só por causa do `usePathname()`
 * (é o único jeito de saber qual página está ativa) — os links continuam sendo `<a href>` normais
 * (recarregam a página inteira, como todo o resto do site), então não muda nada da navegação em
 * si, só o visual de qual aba está selecionada.
 */
export default function AbasDaConta({ contaId }: { contaId: string }) {
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex flex-wrap gap-2 border-b border-neutral-800 pb-3">
      {ABAS.map((aba) => {
        const href = `/contas/${contaId}/${aba.segmento}`;
        const ativa = pathname?.startsWith(href) ?? false;

        return (
          <a
            key={aba.segmento}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              ativa
                ? "bg-neutral-100 font-medium text-neutral-900"
                : "text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            {aba.rotulo}
          </a>
        );
      })}
    </nav>
  );
}
