export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">Chatbot Direct</h1>
      <p className="max-w-sm text-sm text-neutral-400">
        Atendimento automático de Instagram Direct.
      </p>
      <a
        href="/contas"
        className="mt-2 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950"
      >
        Ver contas conectadas
      </a>
    </main>
  );
}
