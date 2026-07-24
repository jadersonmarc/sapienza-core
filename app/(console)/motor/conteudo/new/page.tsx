import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { Button } from "@/components/ui/button"
import { motorContext, getChannels } from "@/lib/motor/client"
import type { ContentFormat } from "@/lib/motor/types"
import { NewContentForm } from "../new-form"
import { BriefForm } from "../brief-form"

export default async function NewContentPage() {
  const ctx = await motorContext()
  // Só ofereço criar peça para canais CONECTADOS. blog cobre blog/wordpress/webhook.
  const ch = await getChannels(ctx).catch(() => null)
  const connected = new Set((ch?.channels ?? []).filter((c) => c.enabled).map((c) => c.platform))
  const formats: ContentFormat[] = []
  if (connected.has("blog") || connected.has("wordpress") || connected.has("webhook")) formats.push("blog")
  if (connected.has("linkedin")) formats.push("linkedin")
  if (connected.has("instagram")) formats.push("instagram")

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

      {formats.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
          Você ainda não conectou nenhum canal.{" "}
          <Link href="/motor/canais" className="text-primary hover:underline">
            Conecte um canal
          </Link>{" "}
          para criar peças.
        </div>
      ) : (
        <>
          <NewContentForm formats={formats} />
          {formats.includes("blog") && <BriefForm />}
        </>
      )}

      <Button asChild variant="outline">
        <Link href="/motor/conteudo">Voltar</Link>
      </Button>
    </div>
  )
}
