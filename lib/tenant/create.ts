import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// Cria um tenant novo com o usuário owner — o passo de onboarding que só existia
// via `pnpm db:seed`. Diferente do addMember (que cria senha aleatória inacessível),
// aqui geramos uma senha inicial FORTE e a devolvemos uma vez, para o superadmin
// repassar ao cliente. Transacional: tenant + user + membership juntos.

export type CreatedTenant = { tenantId: string; slug: string; ownerEmail: string; ownerPassword: string }

function slugify(name: string): string {
  // NFD + strip de acentos (̀-ͯ) para "São" virar "sao", não "s-o".
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Senha inicial forte (satisfaz validatePasswordStrength): letras, número, símbolo. */
function generatePassword(): string {
  // base64url de 12 bytes garante maiúscula/minúscula/número na prática; anexamos
  // marcadores fixos para garantir a política mesmo no pior caso.
  return "Sap" + randomBytes(9).toString("base64url") + "9"
}

export async function createTenant(input: {
  name: string
  ownerEmail: string
  // Senha escolhida pelo cliente (checkout). Sem ela, geramos uma inicial forte
  // (fluxo superadmin). Validada por quem passa (o checkout usa validatePasswordStrength).
  ownerPassword?: string
  // Self-service (checkout): SEMPRE cria um tenant NOVO com slug único — nunca reusa
  // um tenant existente por slug (senão dois cadastros de nomes iguais se fundiriam
  // no mesmo tenant). Superadmin/seed mantém o default idempotente por slug.
  uniqueSlug?: boolean
}): Promise<CreatedTenant> {
  const name = input.name.trim()
  const ownerEmail = input.ownerEmail.trim().toLowerCase()
  if (!name) throw new Error("nome do cliente é obrigatório")
  if (!ownerEmail.includes("@")) throw new Error("e-mail do owner inválido")
  const baseSlug = slugify(name)
  if (!baseSlug) throw new Error("nome inválido (slug vazio)")

  const ownerPassword = input.ownerPassword ?? generatePassword()
  const hash = await bcrypt.hash(ownerPassword, 12)

  const created = await db.transaction(async (tx) => {
    let slug = baseSlug
    let tenant: { id: string } | undefined

    if (input.uniqueSlug) {
      // Garante um tenant novo: tenta o slug; em conflito, sufixa e tenta de novo.
      for (let i = 0; i < 6 && !tenant; i++) {
        const rows = (await tx.execute(sql`
          INSERT INTO public.tenants (name, slug) VALUES (${name}, ${slug})
          ON CONFLICT (slug) DO NOTHING RETURNING id
        `)) as unknown as { id: string }[]
        if (rows.length > 0) tenant = rows[0]
        else slug = `${baseSlug}-${randomBytes(2).toString("hex")}`
      }
      if (!tenant) throw new Error("não foi possível gerar um identificador único")
    } else {
      const rows = (await tx.execute(sql`
        INSERT INTO public.tenants (name, slug) VALUES (${name}, ${slug})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
        RETURNING id
      `)) as unknown as { id: string }[]
      tenant = rows[0]
    }

    const [user] = (await tx.execute(sql`
      INSERT INTO public.users (email, password_hash, is_superadmin)
      VALUES (${ownerEmail}, ${hash}, false)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()
      RETURNING id
    `)) as unknown as { id: string }[]

    await tx.execute(sql`
      INSERT INTO public.memberships (user_id, tenant_id, role)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'owner')
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'owner'
    `)
    return { id: tenant.id, slug }
  })

  return { tenantId: created.id, slug: created.slug, ownerEmail, ownerPassword }
}
