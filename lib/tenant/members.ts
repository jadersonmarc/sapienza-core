import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/events/emit"
import { SeatError, seatsUsage } from "@/lib/billing/seats"

// Gestão de membros do tenant com o gate de seats (hard-block no teto). Convite por
// e-mail com token é fast-follow; aqui é add-member direto (cria o usuário sem senha
// utilizável se ainda não existir). Papéis owner/admin/member contam como seat;
// super-admin da plataforma não conta.

export type SeatRole = "owner" | "admin" | "member"

type UserRow = { id: string; is_superadmin: boolean }

/** Adiciona (ou repromove) um usuário ao tenant por e-mail, respeitando o limite
 *  de seats do maior tier ativo. Lança SeatError("SEAT_LIMIT_REACHED") no teto. */
export async function addMember(args: {
  tenantId: string
  email: string
  role: SeatRole
}): Promise<{ userId: string; created: boolean }> {
  const email = args.email.trim().toLowerCase()
  if (!email || !/.+@.+\..+/.test(email)) throw new Error("e-mail inválido")

  // Cria o usuário se novo (senha aleatória inutilizável até um futuro fluxo de
  // convite); não sobrescreve a senha de um usuário existente.
  const placeholder = await bcrypt.hash(randomUUID(), 10)
  const before = (await db.execute(sql`
    SELECT id FROM public.users WHERE email = ${email}
  `)) as unknown as { id: string }[]
  const created = before.length === 0

  const [u] = (await db.execute(sql`
    INSERT INTO public.users (email, password_hash, is_superadmin)
    VALUES (${email}, ${placeholder}, false)
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id, is_superadmin
  `)) as unknown as UserRow[]

  const existingMembership = (await db.execute(sql`
    SELECT 1 FROM public.memberships WHERE user_id = ${u.id}::uuid AND tenant_id = ${args.tenantId}::uuid
  `)) as unknown as unknown[]
  const isNewMembership = existingMembership.length === 0

  // Só uma NOVA membership que conta como seat (usuário não-superadmin) passa pelo gate.
  if (isNewMembership && !u.is_superadmin) {
    const usage = await seatsUsage(args.tenantId)
    if (usage.atCap) {
      await db.transaction(async (tx) => {
        await emitEvent(tx, {
          type: "SeatLimitReached",
          tenantId: args.tenantId,
          payload: { tenant_id: args.tenantId, tier: usage.tier, limit: usage.limit },
        })
      })
      throw new SeatError(
        "SEAT_LIMIT_REACHED",
        `Seu plano ${usage.tier} permite ${usage.limit} usuário(s). Faça upgrade para adicionar mais.`,
      )
    }
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO public.memberships (user_id, tenant_id, role)
      VALUES (${u.id}::uuid, ${args.tenantId}::uuid, ${args.role})
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role
    `)
    await emitEvent(tx, {
      type: "MemberInvited",
      tenantId: args.tenantId,
      payload: { tenant_id: args.tenantId, user_id: u.id, email, role: args.role },
    })
  })

  return { userId: u.id, created }
}

/** Remove um membro do tenant. O sistema nunca remove usuários automaticamente —
 *  esta é a ação manual do owner/admin (ex.: para concluir um downgrade). */
export async function removeMember(args: { tenantId: string; userId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM public.memberships
      WHERE tenant_id = ${args.tenantId}::uuid AND user_id = ${args.userId}::uuid
    `)
    await emitEvent(tx, {
      type: "MemberRemoved",
      tenantId: args.tenantId,
      payload: { tenant_id: args.tenantId, user_id: args.userId },
    })
  })
}
