import { motorContext, fetchPreviewImage } from "@/lib/motor/client"

export const runtime = "nodejs"

// Proxy do preview de imagem on-brand: o browser fala só com o console; o console
// (server-only) busca o PNG na rota pública /api/og do Motor. Gated ao usuário do
// console com assinatura motor (motorContext redireciona se não).
export async function GET(req: Request): Promise<Response> {
  await motorContext()
  const search = new URL(req.url).searchParams
  const res = await fetchPreviewImage(search)
  if (!res.ok) return new Response("preview indisponível", { status: 502 })
  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/png",
      "cache-control": "private, max-age=600",
    },
  })
}
