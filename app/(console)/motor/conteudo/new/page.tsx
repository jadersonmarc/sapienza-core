import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { Button } from "@/components/ui/button"
import { motorContext, getChannels } from "@/lib/motor/client"
import { NewContentForm } from "../new-form"
import { BriefForm } from "../brief-form"

export default async function NewContentPage() {
  const ctx = await motorContext()
  // Canais sociais conectados → a nova peça já nasce no formato do canal.
  const ch = await getChannels(ctx).catch(() => null)
  const socialChannels = (ch?.channels ?? [])
    .filter((c) => c.enabled && (c.platform === "linkedin" || c.platform === "instagram"))
    .map((c) => c.platform as "linkedin" | "instagram")

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
          Gere um rascunho por tema ou por brief detalhado. A IA escreve no formato do canal.
        </p>
      </div>

      <NewContentForm socialChannels={socialChannels} />
      <BriefForm />

      <Button asChild variant="outline">
        <Link href="/motor/conteudo">Voltar</Link>
      </Button>
    </div>
  )
}
