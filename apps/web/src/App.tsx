export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-200 text-neutral-950">
      <h1 className="text-3xl font-bold">Simulador Vaca Muerta</h1>
      <p className="text-lg text-neutral-600">
        Firma de válvulas y calibración de transmisores
      </p>
      <span
        data-testid="app-version"
        className="rounded bg-neutral-300 px-3 py-1 font-mono text-sm"
      >
        v0.1.0
      </span>
    </main>
  )
}
