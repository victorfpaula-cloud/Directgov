"use client";

import { useState } from "react";

// Bolinha do avatar de cada conta: mostra a foto de perfil de verdade do Instagram quando tem uma
// e ela carrega direitinho; se não tiver foto, ou se ela falhar ao carregar (por exemplo, o link
// temporário da Meta expirou entre a hora que a página buscou ele e a hora que o navegador tentou
// usar), volta pra bolinha colorida com a inicial do nome — igual já era antes dessa mudança.
// Precisa ser componente de cliente porque só dá pra saber que uma imagem falhou (onError) depois
// que o navegador já tentou carregar ela.
export function AvatarConta({
  fotoUrl,
  letra,
  corDeFundo,
  corDoAnel,
}: {
  fotoUrl: string | null;
  letra: string;
  corDeFundo: string;
  corDoAnel: string;
}) {
  const [falhouAoCarregar, setFalhouAoCarregar] = useState(false);

  if (fotoUrl && !falhouAoCarregar) {
    return (
      <img
        src={fotoUrl}
        alt=""
        onError={() => setFalhouAoCarregar(true)}
        className={`h-12 w-12 rounded-full object-cover ring-2 ring-offset-2 ring-offset-neutral-800 ${corDoAnel}`}
      />
    );
  }

  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold ring-2 ring-offset-2 ring-offset-neutral-800 ${corDeFundo} ${corDoAnel}`}
    >
      {letra}
    </div>
  );
}
