import { SignJWT } from "jose"

// JWT curto que o core emite para o usuário operar a API de um produto.
// HS256 com segredo compartilhado — validado pelo sapienza-kit/authclient (Go).
// Claims espelham authclient.Claims: uid, tid, produto, role, iss, exp.

const ISSUER = "sapienza-core"

function secret(): Uint8Array {
  const s = process.env.PRODUCT_JWT_SECRET
  if (!s) throw new Error("PRODUCT_JWT_SECRET não definida")
  return new TextEncoder().encode(s)
}

/** Emite um JWT curto (default 5 min) para (user, tenant, produto). */
export async function issueProductToken(args: {
  userId: string
  tenantId: string
  produto: string
  role: string
  ttlSeconds?: number
}): Promise<string> {
  const ttl = args.ttlSeconds ?? 300
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    uid: args.userId,
    tid: args.tenantId,
    produto: args.produto,
    role: args.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(secret())
}
