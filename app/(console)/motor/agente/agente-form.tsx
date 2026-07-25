"use client"

import { useActionState } from "react"
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
