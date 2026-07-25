import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export const runtime = "nodejs"

// GET /api/public/checkout/status?invoice= — o passo de pagamento faz polling
// disto até { paid: true }. A verdade do pagamento vem do webhook do Asaas
// (reconcile marca a fatura como paid); aqui só lemos o estado.
export async function GET(req: Request): Promise<Response> {
  const invoice = new URL(req.url).searchParams.get("invoice")
  const j = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } })
  if (!invoice) return j({ paid: false })
  try {
    const rows = (await db.execute(
      sql`SELECT status FROM public.invoices WHERE id = ${invoice}::uuid`,
    )) as unknown as { status: string }[]
    return j({ paid: rows[0]?.status === "paid" })
  } catch {
    return j({ paid: false })
  }
}
