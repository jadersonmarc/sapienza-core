import { eq } from "drizzle-orm"
import { currentContext } from "@/lib/console/current"
import { roleInTenant } from "@/lib/tenant/context"
import { db, schema } from "@/lib/db"
import { Eyebrow } from "@/components/eyebrow"

// Gestão de usuários do tenant ativo (leitura na Fase 1; convite virá depois).
export default async function UsuariosPage() {
  const { user, active } = await currentContext()
  if (!active) return null

  const members = await db
    .select({
      email: schema.users.email,
      name: schema.users.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.tenantId, active.id))

  const myRole = user.isSuperadmin ? "superadmin" : await roleInTenant(user.id, active.id)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>{active.name}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Seu papel neste tenant: <span className="font-mono">{myRole ?? "—"}</span>
        </p>
      </div>

      <div className="rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Papel</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.email} className="border-t border-border">
                <td className="px-4 py-2">{m.email}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.name ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs uppercase">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
