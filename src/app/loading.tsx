// Tela de carregamento instantânea. O Next.js mostra isso automaticamente enquanto a página de
// verdade ainda está buscando os dados no servidor (lista de contas etc.) — é exatamente a "tela
// branca" que aparecia antes de abrir de verdade. Não depende de nenhum dado nem de JavaScript
// rodando no celular: já vem pronta no HTML que o servidor manda primeiro, então aparece bem mais
// rápido que o conteúdo real. Mesmo recurso usado no Agendador de Stories.
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950">
      <div className="relative flex h-40 w-40 items-center justify-center">
        {/* Anel girando ao redor do ícone — efeito clássico de "carregando". */}
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-neutral-800 border-t-emerald-500" />
        <img
          src="/icon.png"
          alt="Chatbot Direct"
          className="h-28 w-28 animate-pop-in rounded-2xl shadow-md"
        />
      </div>
    </div>
  );
}
