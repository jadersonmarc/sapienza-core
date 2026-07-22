import { margotContext, channelStatus, MargotError } from "@/lib/margot/client"

export const runtime = "nodejs"

// GET — estado da conexão do WhatsApp do tenant ativo. O painel de conexão faz
// polling disto durante o onboarding (até `connected`). Escopado ao tenant/sessão
// pelo margotContext; o Margot valida o JWT curto do core.
export async function GET(): Promise<Response> {
  try {
    const ctx = await margotContext()
    const status = await channelStatus(ctx)
    return Response.json(status)
  } catch (e) {
    const status = e instanceof MargotError ? e.status : 500
    return Response.json({ connected: false, state: "error", number: "" }, { status })
  }
}
