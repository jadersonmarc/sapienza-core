import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// Cria/atualiza um usuário. Uso:
//   pnpm db:seed -- --email a@b.com --password 'Senha123!' [--superadmin]
//   pnpm db:seed -- --email a@b.com --password 'Senha123!' --tenant "Cliente X" --role owner

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const email = arg("email")?.toLowerCase().trim()
  const password = arg("password")
  if (!email || !password) {
    throw new Error("uso: --email <e> --password <p> [--superadmin] [--tenant <nome> --role <owner|admin|member>]")
  }
  const hash = await bcrypt.hash(password, 10)
  const superadmin = flag("superadmin")

  const [user] = (await db.execute(sql`
    INSERT INTO public.users (email, password_hash, is_superadmin)
    VALUES (${email}, ${hash}, ${superadmin})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
      is_superadmin = EXCLUDED.is_superadmin, updated_at = now()
    RETURNING id
  `)) as unknown as { id: string }[]
  console.log(`user ${email} (${user.id})${superadmin ? " [superadmin]" : ""}`)

  const tenantName = arg("tenant")
  if (tenantName) {
    const role = arg("role") ?? "owner"
    const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const [tenant] = (await db.execute(sql`
      INSERT INTO public.tenants (name, slug) VALUES (${tenantName}, ${slug})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `)) as unknown as { id: string }[]
    await db.execute(sql`
      INSERT INTO public.memberships (user_id, tenant_id, role)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, ${role})
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role
    `)
    console.log(`tenant ${tenantName} (${tenant.id}) — ${email} é ${role}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("seed falhou:", e)
  process.exit(1)
})
