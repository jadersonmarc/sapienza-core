import { motorContext, motorRaw } from "@/lib/motor/client"

export const runtime = "nodejs"

// Proxy de upload do console → Motor. Encaminha o multipart (arquivo de vídeo) para
// /api/v1/content/clip/upload com o JWT do produto, devolvendo status+corpo. Mantém
// o arquivo fora do JS bundle e escopado ao tenant ativo.
export async function POST(req: Request): Promise<Response> {
  const ctx = await motorContext()
  const form = await req.formData()
  const res = await motorRaw(ctx, "/api/v1/content/clip/upload", { method: "POST", body: form })
  const body = await res.text()
  return new Response(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  })
}
