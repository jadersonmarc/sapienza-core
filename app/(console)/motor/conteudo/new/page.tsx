import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { Button } from "@/components/ui/button"
import { motorContext, getChannels, getEditorConfig } from "@/lib/motor/client"
import { tenantSubscriptions } from "@/lib/tenant/context"
import type { ContentFormat } from "@/lib/motor/types"
import { NewContentForm } from "../new-form"
import { BriefForm } from "../brief-form"
import { MotionForm } from "../motion-form"

export default async function NewContentPage() {
  const ctx = await motorContext()
  // Motion é diferencial de Pro/Premium (=scale) — mostra o form só p/ esses tiers.
  const subs = await tenantSubscriptions(ctx.tenantId).catch(() => [])
  const motionEnabled = subs.some(
    (s) => s.produto === "motor" && s.status === "active" && (s.tier === "pro" || s.tier === "scale"),
  )
  // Só ofereço criar peça para canais CONECTADOS. blog cobre blog/wordpress/webhook.
  const ch = await getChannels(ctx).catch(() => null)
  const connected = new Set((ch?.channels ?? []).filter((c) => c.enabled).map((c) => c.platform))
  const formats: ContentFormat[] = []
  if (connected.has("blog") || connected.has("wordpress") || connected.has("webhook")) formats.push("blog")
  if (connected.has("linkedin")) formats.push("linkedin")
  if (connected.has("instagram")) formats.push("instagram")
  // Vídeo (motion) precisa de um destino: canal social nativo OU webhook (Fase 1).
  const motionDestino = connected.has("instagram") || connected.has("linkedin") || connected.has("webhook")

  // Identidade do agente é pré-requisito de QUALQUER criação (não há marca padrão).
  const cfg = await getEditorConfig(ctx).catch(() => null)
  const agentePronto = Boolean(cfg?.system_prompt?.trim())

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor/conteudo" className="hover:underline">
            Conteúdo
          </Link>{" "}
          · Nova peça
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nova peça</h1>
        <p className="text-sm text-muted-foreground">
          {formats.length > 1
            ? "Escolha o canal e gere o rascunho. A IA escreve no formato do canal."
            : "Gere o rascunho. A IA escreve no formato do canal conectado."}
        </p>
      </div>

      {!agentePronto ? (
        <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
          Antes de criar peças, defina a <strong className="text-foreground">identidade da marca</strong> no{" "}
          <Link href="/motor/agente" className="text-primary hover:underline">
            Agente
          </Link>{" "}
          (voz, tom e temas). O conteúdo é sempre da sua marca — não há um padrão.
        </div>
      ) : formats.length === 0 && !motionDestino ? (
        <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
          Você ainda não conectou nenhum canal.{" "}
          <Link href="/motor/canais" className="text-primary hover:underline">
            Conecte um canal
          </Link>{" "}
          para criar peças.
        </div>
      ) : (
        <>
          {formats.length > 0 ? (
            <>
              <NewContentForm formats={formats} />
              {formats.includes("blog") && <BriefForm />}
            </>
          ) : (
            <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
              Nenhum canal de texto conectado.{" "}
              <Link href="/motor/canais" className="text-primary hover:underline">
                Conecte um canal
              </Link>{" "}
              para criar artigos/posts.
            </div>
          )}
          {/* Motion só com destino de vídeo conectado (canal social ou webhook). */}
          {motionEnabled && motionDestino && <MotionForm />}
          {motionEnabled && !motionDestino && (
            <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
              Para peças em <strong className="text-foreground">vídeo</strong>, conecte o Instagram, o
              LinkedIn ou um{" "}
              <Link href="/motor/canais" className="text-primary hover:underline">
                Webhook
              </Link>
              .
            </div>
          )}
        </>
      )}

      <Button asChild variant="outline">
        <Link href="/motor/conteudo">Voltar</Link>
      </Button>
    </div>
  )
}
