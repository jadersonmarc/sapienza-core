"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ClipConnectors } from "@/lib/motor/client"
import { importFromConnectorAction } from "../actions"

const LABEL: Record<string, string> = { gdrive: "Google Drive", dropbox: "Dropbox" }
const REF_HINT: Record<string, string> = {
  gdrive: "ID do arquivo (da URL do Drive)",
  dropbox: "caminho do arquivo (ex.: /videos/podcast.mp4)",
}

function ConnectorRow({ provider, connected }: { provider: string; connected: boolean }) {
  const router = useRouter()
  const [ref, setRef] = useState("")
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  if (!connected) {
    return (
      <a
        href={`/motor/clipes/oauth?provider=${provider}`}
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Conectar {LABEL[provider] ?? provider}
      </a>
    )
  }

  function run() {
    setErr(null)
    setOk(false)
    start(async () => {
      const res = await importFromConnectorAction(provider, ref)
      if (res.error) {
        setErr(res.error)
        return
      }
      setRef("")
      setOk(true)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">✓ {LABEL[provider] ?? provider} conectado</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={REF_HINT[provider] ?? "arquivo"}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={run}
          disabled={pending || !ref.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {pending ? "Importando…" : "Importar"}
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {ok && <p className="text-xs text-muted-foreground">Na fila — os clipes aparecem quando ficarem prontos.</p>}
    </div>
  )
}

/** Conectores de nuvem (Onda 2): conectar conta e importar por ID/caminho. Só
 *  aparece quando há provedor configurável (app OAuth setado). */
export function ConnectorsPanel({ connectors }: { connectors: ClipConnectors }) {
  if (!connectors.available.length) return null
  const connected = new Set(connectors.connected)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <span className="text-sm font-medium">Importar da nuvem</span>
      <div className="flex flex-col gap-3">
        {connectors.available.map((p) => (
          <ConnectorRow key={p} provider={p} connected={connected.has(p)} />
        ))}
      </div>
    </div>
  )
}
