import { motorContext, motorRaw } from "@/lib/motor/client"

export const runtime = "nodejs"

// Proxy do upload (multipart): repassa o FormData ao Motor com o JWT do produto.
// Não define Content-Type — o fetch monta o boundary do multipart sozinho.
export async function POST(req: Request): Promise<Response> {
  const ctx = await motorContext()
  const form = await req.formData()
  const res = await motorRaw(ctx, "/api/v1/media", { method: "POST", body: form })
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  })
}
