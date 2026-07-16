"use client"

import { useActionState } from "react"
import { generateSocialAction, type ActionState } from "../../actions"
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
        {pending ? "Gerando…" : existing ? `Regerar ${LABEL[platform]}` : `Gerar ${LABEL[platform]}`}
      </button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

// Legendas sociais (IG/LinkedIn): gera via IA (fallback determinístico sem chave) e
// mostra o rascunho salvo — é o que o publish envia (body + hashtags).
export function SocialPanel({ id, drafts }: { id: string; drafts: SocialDraft[] }) {
  const byPlatform = new Map(drafts.map((d) => [d.platform, d]))
  const platforms: SocialPlatform[] = ["instagram", "linkedin"]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Legendas sociais</h2>
        {platforms.map((p) => (
          <GenerateButton key={p} id={id} platform={p} existing={byPlatform.has(p)} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {platforms.map((p) => {
          const d = byPlatform.get(p)
          return (
            <div key={p} className="rounded-xl border border-border p-3">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{LABEL[p]}</p>
              {d ? (
                <>
                  <pre className="whitespace-pre-wrap font-sans text-sm">{d.body}</pre>
                  {d.hashtags.length > 0 && (
                    <p className="mt-2 text-xs text-primary">{d.hashtags.map((h) => `#${h}`).join(" ")}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Ainda não gerada.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
