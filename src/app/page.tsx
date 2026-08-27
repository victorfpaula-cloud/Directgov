import { redirect } from "next/navigation";

// Ninguém fica na tela inicial — ela só existe pra mandar direto pra lista de contas. Enquanto
// isso carrega, quem vê é a tela de `loading.tsx` (o ícone com o anel girando), exatamente como
// acontece no agendador.
export default function Home() {
  redirect("/contas");
}
