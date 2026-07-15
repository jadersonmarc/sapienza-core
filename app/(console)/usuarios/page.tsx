import { eq } from "drizzle-orm"
import { currentContext } from "@/lib/console/current"
import { roleInTenant } from "@/lib/tenant/context"
import { seatsUsage } from "@/lib/billing/seats"
import { db, schema } from "@/lib/db"
import { Eyebrow } from "@/components/eyebrow"
import { AddMemberForm } from "./add-member-form"
import { removeMemberAction } from "./actions"

// Gestão de usuários do tenant ativo, com o limite de seats do maior tier ativo.
export default async function UsuariosPage() {
  const { user, active } = await currentContext()
  if (!active) return null

  const members = await db
    .select({
      id: schema.memberships.userId,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.memberships.role,
      isSuperadmin: schema.users.isSuperadmin,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.tenantId, active.id))

  const myRole = user.isSuperadmin ? "superadmin" : await roleInTenant(user.id, active.id)
  const canManage = myRole === "owner" || myRole === "admin" || myRole === "superadmin"
  const seats = await seatsUsage(active.id)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>{active.name}</Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Seu papel neste tenant: <span className="font-mono">{myRole ?? "—"}</span> · usuários:{" "}
          <span className="font-mono">
            {seats.used} / {seats.limit}
          </span>{" "}
          <span className="text-xs">(plano {seats.tier})</span>
        </p>
      </div>

      {canManage && <AddMemberForm atCap={seats.atCap} tier={seats.tier} limit={seats.limit} />}

      <div className="rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Papel</th>
              {canManage && <th className="px-4 py-2 font-medium text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.email} className="border-t border-border">
                <td className="px-4 py-2">{m.email}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.name ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs uppercase">
                  {m.role}
                  {m.isSuperadmin && <span className="ml-1 text-muted-foreground">· plataforma</span>}
                </td>
                {canManage && (
                  <td className="px-4 py-2 text-right">
                    {m.id !== user.id && (
                      <form action={removeMemberAction} className="inline">
                        <input type="hidden" name="userId" value={m.id} />
                        <button type="submit" className="text-xs text-destructive hover:underline">
                          remover
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
