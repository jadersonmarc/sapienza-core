import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import type { ChatTurn } from "./assistant"

// Persistência do histórico do assistente. Control-plane (public). TODA query é
// escopada por tenant_id + user_id — inclusive as de mensagem, que verificam a
// posse da conversa via JOIN. Um usuário nunca lê/escreve a conversa de outro.

export type Conversation = { id: string; title: string; updated_at: string }

export async function listConversations(tenantId: string, userId: string): Promise<Conversation[]> {
  return (await db.execute(sql`
    SELECT id, title, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
      FROM public.assistant_conversations
     WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid
     ORDER BY updated_at DESC LIMIT 50
  `)) as unknown as Conversation[]
}

export async function createConversation(tenantId: string, userId: string, title: string): Promise<string> {
  const [row] = (await db.execute(sql`
    INSERT INTO public.assistant_conversations (tenant_id, user_id, title)
    VALUES (${tenantId}::uuid, ${userId}::uuid, ${title.slice(0, 80)})
    RETURNING id
  `)) as unknown as { id: string }[]
  return row.id
}

/** Mensagens da conversa — só retorna se a conversa pertence ao tenant+usuário. */
export async function getMessages(conversationId: string, tenantId: string, userId: string): Promise<ChatTurn[]> {
  return (await db.execute(sql`
    SELECT m.role, m.content
      FROM public.assistant_messages m
      JOIN public.assistant_conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = ${conversationId}::uuid
       AND c.tenant_id = ${tenantId}::uuid AND c.user_id = ${userId}::uuid
     ORDER BY m.created_at
  `)) as unknown as ChatTurn[]
}

/** Anexa uma mensagem — só se a conversa é do tenant+usuário. Retorna false se
 *  a conversa não pertence a quem pediu (guarda de posse). Toca updated_at. */
export async function appendMessage(
  conversationId: string,
  tenantId: string,
  userId: string,
  role: "user" | "assistant",
  content: string,
): Promise<boolean> {
  const rows = (await db.execute(sql`
    INSERT INTO public.assistant_messages (conversation_id, role, content)
    SELECT ${conversationId}::uuid, ${role}, ${content}
     WHERE EXISTS (
       SELECT 1 FROM public.assistant_conversations
        WHERE id = ${conversationId}::uuid AND tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid
     )
    RETURNING id
  `)) as unknown as { id: string }[]
  if (rows.length === 0) return false
  await db.execute(sql`
    UPDATE public.assistant_conversations SET updated_at = now()
     WHERE id = ${conversationId}::uuid AND tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid
  `)
  return true
}
