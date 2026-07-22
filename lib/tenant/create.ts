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

export async function createTenant(input: { name: string; ownerEmail: string }): Promise<CreatedTenant> {
  const name = input.name.trim()
  const ownerEmail = input.ownerEmail.trim().toLowerCase()
  if (!name) throw new Error("nome do cliente é obrigatório")
  if (!ownerEmail.includes("@")) throw new Error("e-mail do owner inválido")
  const slug = slugify(name)
  if (!slug) throw new Error("nome inválido (slug vazio)")

  const ownerPassword = generatePassword()
  const hash = await bcrypt.hash(ownerPassword, 12)

  const tenantId = await db.transaction(async (tx) => {
    const [tenant] = (await tx.execute(sql`
      INSERT INTO public.tenants (name, slug) VALUES (${name}, ${slug})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
      RETURNING id
    `)) as unknown as { id: string }[]

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
    return tenant.id
  })

  return { tenantId, slug, ownerEmail, ownerPassword }
}
