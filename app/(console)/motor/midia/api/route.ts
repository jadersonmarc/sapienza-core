import { motorContext, motorRaw } from "@/lib/motor/client"

export const runtime = "nodejs"

// Proxy do console → API de mídia do Motor. O browser fala só com o console; aqui
// (server-only) o motorContext gateia o acesso (assinatura motor) e repassa a
// resposta do Motor tal e qual (status + JSON), inclusive 409 {inUse}.

function passthrough(res: Response): Response {
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  })
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await motorContext()
  const sp = new URL(req.url).searchParams
  const qs = new URLSearchParams()
  const folder = sp.get("folder")
  if (folder) qs.set("folder", folder)
  const token = sp.get("token")
  if (token) qs.set("token", token)
  return passthrough(await motorRaw(ctx, `/api/v1/media?${qs.toString()}`))
}

export async function DELETE(req: Request): Promise<Response> {
  const ctx = await motorContext()
  const sp = new URL(req.url).searchParams
  const qs = new URLSearchParams()
  const key = sp.get("key")
  if (key) qs.set("key", key)
  if (sp.get("confirm") === "1") qs.set("confirm", "1")
  return passthrough(await motorRaw(ctx, `/api/v1/media?${qs.toString()}`, { method: "DELETE" }))
}

export async function PUT(req: Request): Promise<Response> {
  const ctx = await motorContext()
  const body = await req.text()
  return passthrough(
    await motorRaw(ctx, "/api/v1/media/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  )
}
