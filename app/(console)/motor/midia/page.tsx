import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { motorContext } from "@/lib/motor/client"
import { produtoLabel } from "@/lib/pricing/tier-label"
import { MediaLibrary } from "./media-library"

export default async function MidiaPage() {
  await motorContext() // gate: exige assinatura motor ativa

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            {produtoLabel("motor")}
          </Link>{" "}
          · Mídia
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Biblioteca de mídia</h1>
        <p className="text-sm text-muted-foreground">
          Imagens on-brand por canal. As capas geradas no publish aparecem aqui; você também pode enviar as suas.
        </p>
      </div>

      <MediaLibrary />
    </div>
  )
}
