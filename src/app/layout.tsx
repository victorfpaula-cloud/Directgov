import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DirectGov",
  description: "Secretaria virtual de prefeituras via Instagram Direct",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-neutral-900 text-neutral-100 antialiased">
        {/*
          Tela de abertura com o logo — aparece SÓ na primeira vez que o site é aberto numa aba
          (guardado em sessionStorage, então some sozinha e não volta a aparecer enquanto você
          navega entre as páginas na mesma aba). Nas trocas de página depois disso, quem aparece é
          só a barrinha fina de carregamento (`src/app/loading.tsx`), bem mais discreta.
        */}
        <div
          id="cd-splash"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950 opacity-100 transition-opacity duration-500"
        >
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-neutral-800 border-t-neutral-300" />
            <div className="flex h-11 w-11 animate-pop-in items-center justify-center rounded-full bg-neutral-100 text-sm font-bold text-neutral-900">
              DG
            </div>
          </div>
        </div>
        <script
          // Roda assim que o navegador lê essa tag, antes do resto da página aparecer. Se já
          // existe a marca de "já abriu" nessa aba (sessionStorage — dura enquanto a aba estiver
          // aberta, some se fechar e abrir de novo), esconde a tela de abertura na hora. Se não
          // existe ainda, deixa aparecer por um instante e depois esconde sozinha com uma
          // transição suave.
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var el = document.getElementById("cd-splash");
                  if (!el) return;
                  var jaAbriu = sessionStorage.getItem("dg_ja_abriu");
                  if (jaAbriu) {
                    el.style.display = "none";
                    return;
                  }
                  sessionStorage.setItem("dg_ja_abriu", "1");
                  setTimeout(function () {
                    el.style.opacity = "0";
                    el.style.pointerEvents = "none";
                    setTimeout(function () {
                      el.style.display = "none";
                    }, 500);
                  }, 700);
                } catch (e) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
