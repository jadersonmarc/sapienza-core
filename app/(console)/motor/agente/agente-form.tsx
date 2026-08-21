"use client"

import { useActionState, useState } from "react"
import { saveEditorConfigAction, type ActionState } from "../actions"
import type { ContentFormat, EditorConfig } from "@/lib/motor/types"

const initial: ActionState = {}

const FORMAT_LABEL: Record<ContentFormat, string> = {
  blog: "Blog (artigo)",
  linkedin: "Post de LinkedIn",
  instagram: "Post de Instagram",
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const label = "text-sm font-medium"

// Modelos oferecidos. Vazio = padrão do produto (Opus). Sonnet/Haiku para quem
// quer mais econômico. O id segue o que o Motor passa à Anthropic.
const MODELOS = [
  { value: "", label: "Padrão — mais capaz (recomendado)" },
  { value: "claude-sonnet-5", label: "Sonnet — equilíbrio" },
  { value: "claude-haiku-4-5", label: "Haiku — rápido e econômico" },
]

export function AgenteForm({ cfg, formats }: { cfg: EditorConfig; formats: ContentFormat[] }) {
  const [state, action, pending] = useActionState(saveEditorConfigAction, initial)
  // Logo: campo controlado para o upload preencher a URL (o save grava logo_url).
  const [logoUrl, setLogoUrl] = useState(cfg.logo_url)
  const [uploading, setUploading] = useState<null | "ok" | "erro" | "enviando">(null)
  // Fundos-padrão do Brand Kit (item deste ciclo): lista controlada de URLs de mídia.
  // Máx. 5. Enviados pelo mesmo upload; o save grava background_keys (hidden JSON).
  const MAX_BG = 5
  const [backgrounds, setBackgrounds] = useState<string[]>(cfg.background_keys ?? [])
  const [bgState, setBgState] = useState<null | "enviando" | "erro" | "cheio">(null)

  async function uploadBackground(file: File) {
    if (backgrounds.length >= MAX_BG) {
      setBgState("cheio")
      return
    }
    setBgState("enviando")
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "geral")
      const res = await fetch("/motor/midia/api/upload", { method: "POST", body: fd })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? "falha")
      setBackgrounds((prev) => (prev.includes(data.url!) || prev.length >= MAX_BG ? prev : [...prev, data.url!]))
      setBgState(null)
    } catch {
      setBgState("erro")
    }
  }

  async function uploadLogo(file: File) {
    setUploading("enviando")
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "logo")
      const res = await fetch("/motor/midia/api/upload", { method: "POST", body: fd })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? "falha")
      setLogoUrl(data.url)
      setUploading("ok")
    } catch {
      setUploading("erro")
    }
  }
  // Formato padrão só entre os canais conectados. Default = o configurado, se ainda
  // conectado; senão o primeiro disponível.
  const defaultFormat = formats.includes(cfg.format) ? cfg.format : (formats[0] ?? "blog")

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label className={label} htmlFor="system_prompt">
          Prompt do sistema (voz da marca)
        </label>
        <textarea
          id="system_prompt"
          name="system_prompt"
          rows={5}
          defaultValue={cfg.system_prompt}
          placeholder="Ex.: Escreva como uma consultoria próxima e prática para PMEs. Evite jargão; foque em ganhos concretos."
          className={field}
        />
        <p className="text-xs text-muted-foreground">
          Some às regras base (pt-BR, sem inventar dados). Vale para a automação e a criação manual.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={label} htmlFor="tone">
            Tom
          </label>
          <input id="tone" name="tone" defaultValue={cfg.tone} placeholder="Ex.: profissional e direto" className={field} />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="model">
            Modelo
          </label>
          <select id="model" name="model" defaultValue={cfg.model ?? ""} className={field}>
            {MODELOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="handle">
          Handle da marca (peças de motion)
        </label>
        <input id="handle" name="handle" defaultValue={cfg.handle} placeholder="Ex.: @suamarca" className={field} />
        <p className="text-xs text-muted-foreground">
          Aparece no rodapé dos vídeos (peças em movimento). Vazio = @sapienzalabs.
        </p>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="logo_url">
          Logo da marca (peças de motion)
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            className="text-sm"
          />
          {uploading === "enviando" && <span className="text-xs text-muted-foreground">enviando…</span>}
          {uploading === "ok" && <span className="text-xs text-primary">logo enviado</span>}
          {uploading === "erro" && <span className="text-xs text-destructive">falha no upload</span>}
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="h-8 w-auto rounded border border-border" />
          )}
        </div>
        <input
          id="logo_url"
          name="logo_url"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…/logo.png"
          className={field}
        />
        <p className="text-xs text-muted-foreground">
          Envie uma imagem (acima) ou cole uma URL https. Aparece no rodapé dos vídeos. Vazio = inicial da marca.
        </p>
      </div>

      {/* Legenda padrão das peças de motion (item 8a) — restrito aos tokens da marca.
          "Padrão da marca" = valores atuais. Cada peça pode sobrescrever no momento da
          criação. Tamanho e posição não são configuráveis (layout dos presets é fixo). */}
      <div className="space-y-1">
        <label className={label}>Legenda padrão (peças de motion)</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="captionFont" defaultValue={cfg.caption_style?.font ?? ""} className={field}>
            <option value="">Fonte: padrão da marca</option>
            <option value="display">Fonte: Display</option>
            <option value="sans">Fonte: Sans</option>
            <option value="mono">Fonte: Mono</option>
          </select>
          <select name="captionColor" defaultValue={cfg.caption_style?.color ?? ""} className={field}>
            <option value="">Cor: padrão da marca</option>
            <option value="default">Cor: Padrão</option>
            <option value="accent">Cor: Acento</option>
            <option value="signal">Cor: Destaque</option>
          </select>
          <select name="captionHighlight" defaultValue={cfg.caption_style?.highlight ?? ""} className={field}>
            <option value="">Realce: padrão da marca</option>
            <option value="accent">Realce: Acento</option>
            <option value="signal">Realce: Destaque</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Aplica-se à fonte, cor do texto e cor de realce dos 4 formatos. Vazio = como está hoje.
        </p>
      </div>

      {/* Fundos-padrão do Brand Kit: imagens de exemplo que viram o fundo das peças de
          motion sem imagem própria (rotação entre elas). Ver/adicionar/remover, máx. 5. */}
      <div className="space-y-2">
        <label className={label}>Fundos-padrão das peças de motion (máx. 5)</label>
        <input type="hidden" name="background_keys" value={JSON.stringify(backgrounds)} />
        {backgrounds.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {backgrounds.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="fundo" className="h-20 w-20 rounded border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => setBackgrounds((prev) => prev.filter((u) => u !== url))}
                  className="absolute -right-2 -top-2 rounded-full border border-border bg-background px-1.5 text-xs text-destructive hover:bg-muted"
                  aria-label="remover fundo"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            disabled={backgrounds.length >= MAX_BG || bgState === "enviando"}
            onChange={(e) => e.target.files?.[0] && uploadBackground(e.target.files[0])}
            className="text-sm disabled:opacity-50"
          />
          {bgState === "enviando" && <span className="text-xs text-muted-foreground">enviando…</span>}
          {bgState === "erro" && <span className="text-xs text-destructive">falha no upload</span>}
          {bgState === "cheio" && <span className="text-xs text-destructive">limite de {MAX_BG} atingido</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          A Margot usa uma destas como fundo, em rodízio, quando a peça não tem imagem própria. Sem
          nenhuma, a peça sai com o campo chapado, como hoje.
        </p>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="themes">
          Temas / áreas a priorizar
        </label>
        <textarea
          id="themes"
          name="themes"
          rows={4}
          defaultValue={cfg.themes.join("\n")}
          placeholder={"Um por linha, ex.:\nautomação de atendimento\nnota fiscal eletrônica\nCRM para PME"}
          className={field}
        />
        <p className="text-xs text-muted-foreground">A automação escolhe um tema novo dentre estas áreas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={label} htmlFor="format">
            Formato padrão da automação
          </label>
          {formats.length === 0 ? (
            <>
              <input type="hidden" name="format" value={cfg.format} />
              <p className="text-xs text-muted-foreground">
                Nenhum canal conectado. A automação precisa de um canal para saber o que criar —{" "}
                <a href="/motor/canais" className="text-primary hover:underline">
                  conecte um canal
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <select id="format" name="format" defaultValue={defaultFormat} className={field}>
                {formats.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {formats.length > 1
                  ? "Você tem mais de um canal — defina em qual formato as peças automáticas nascem."
                  : "Segue o único canal conectado."}
              </p>
            </>
          )}
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="cadence_days">
            Frequência da automação
          </label>
          <select id="cadence_days" name="cadence_days" defaultValue={String(cfg.cadence_days)} className={field}>
            <option value="1">Diária</option>
            <option value="3">A cada 3 dias</option>
            <option value="7">Semanal</option>
            <option value="14">Quinzenal</option>
            <option value="30">Mensal</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="size-4" />
        Automação ativa (gerar peças automaticamente)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
        {state.ok && <span className="text-sm text-muted-foreground">Configuração salva.</span>}
      </div>
    </form>
  )
}
