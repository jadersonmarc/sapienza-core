"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { getPixQrAction } from "../actions"

export function PixPanel({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [qr, setQr] = useState<{ encodedImage: string; payload: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [paid, setPaid] = useState(false)
  const started = useRef(false)

  // Busca o QR uma vez.
  useEffect(() => {
    if (started.current) return
    started.current = true
    getPixQrAction(invoiceId).then((r) => {
      if (r.error || !r.encodedImage || !r.payload) setError(r.error ?? "Não foi possível gerar o PIX.")
      else setQr({ encodedImage: r.encodedImage, payload: r.payload })
    })
  }, [invoiceId])

  // Polling do status até pago.
  useEffect(() => {
    if (paid) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/checkout/status?invoice=${invoiceId}`, { cache: "no-store" })
        const data = (await res.json()) as { paid?: boolean }
        if (data.paid) {
          setPaid(true)
          clearInterval(id)
          setTimeout(() => router.push("/login?assinou=1"), 1500)
        }
      } catch {
        /* mantém tentando */
      }
    }, 4000)
    return () => clearInterval(id)
  }, [invoiceId, paid, router])

  async function copy() {
    if (!qr) return
    try {
      await navigator.clipboard.writeText(qr.payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  if (paid) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-6 text-center">
        <p className="text-lg font-semibold text-primary">Pagamento confirmado! 🎉</p>
        <p className="mt-1 text-sm text-muted-foreground">Redirecionando para o login…</p>
      </div>
    )
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!qr) return <p className="text-sm text-muted-foreground">Gerando o PIX…</p>

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${qr.encodedImage}`}
        alt="QR Code do PIX"
        className="h-56 w-56 rounded-lg border border-border bg-white p-2"
      />
      <div className="w-full">
        <p className="mb-1 text-xs text-muted-foreground">PIX copia e cola</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={qr.payload}
            className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block size-2 animate-pulse rounded-full bg-amber-500" />
        Aguardando o pagamento…
      </p>
    </div>
  )
}
