"use client"

import { useActionState } from "react"
import { generateSocialAction, saveSocialAction, type ActionState } from "../../actions"
import type { SocialDraft, SocialPlatform } from "@/lib/motor/types"

const initial: ActionState = {}

const LABEL: Record<SocialPlatform, string> = { instagram: "Instagram", linkedin: "LinkedIn" }

function GenerateButton({ id, platform, existing }: { id: string; platform: SocialPlatform; existing: boolean }) {
  const [state, action, pending] = useActionState(generateSocialAction, initial)
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="platform" value={platform} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Gerando…" : existing ? "Regerar com IA" : "Gerar com IA"}
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

// Card editável por plataforma: gera com IA e/ou edita à mão (body + hashtags) antes
// de publicar. O que fica salvo é o que o publish envia.
function PlatformCard({ id, platform, draft }: { id: string; platform: SocialPlatform; draft?: SocialDraft }) {
  const [state, action, pending] = useActionState(saveSocialAction, initial)
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{LABEL[platform]}</p>
        <GenerateButton id={id} platform={platform} existing={!!draft} />
      </div>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="platform" value={platform} />
        <textarea
          name="body"
          rows={5}
          required
          defaultValue={draft?.body ?? ""}
          placeholder="Escreva ou gere a legenda…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          name="hashtags"
          defaultValue={(draft?.hashtags ?? []).map((h) => `#${h}`).join(" ")}
          placeholder="#hashtags separadas por espaço"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Salvando…" : "Salvar legenda"}
          </button>
          {state.ok && <span className="text-xs text-primary">Salva.</span>}
          {state.error && <span className="text-xs text-destructive">{state.error}</span>}
        </div>
      </form>
    </div>
  )
}

// Legendas sociais (IG/LinkedIn): editáveis antes de publicar — é o que o publish
// envia (body + hashtags). Sem chave de IA, o "gerar" cai no fallback do Motor.
export function SocialPanel({ id, drafts }: { id: string; drafts: SocialDraft[] }) {
  const byPlatform = new Map(drafts.map((d) => [d.platform, d]))
  const platforms: SocialPlatform[] = ["instagram", "linkedin"]

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Legendas sociais</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {platforms.map((p) => {
          const d = byPlatform.get(p)
          // key inclui o conteúdo: ao regerar, o card remonta e o textarea reflete a nova legenda.
          return <PlatformCard key={`${p}:${d?.body ?? ""}`} id={id} platform={p} draft={d} />
        })}
      </div>
    </div>
  )
}
