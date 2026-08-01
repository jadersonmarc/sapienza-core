import Anthropic from "@anthropic-ai/sdk"
import { toolsFor, runTool, type Subs, type ToolDeps } from "./tools"

// Assistente de métricas: loop de tool-use com Sonnet 5. O modelo responde SÓ com
// base nos números que as tools retornam (funções tipadas, tenant-scoped no
// servidor). Nunca gera SQL. Seam: sem ANTHROPIC_API_KEY, isAssistantConfigured()=false.

export const ASSISTANT_MODEL = "claude-sonnet-5"
const MAX_TURNS = 6

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export type ChatTurn = { role: "user" | "assistant"; content: string }

const SYSTEM = [
  "Você é o assistente de métricas da Sapienza — analista de marketing de conteúdo (Margot Editora)",
  "e de atendimento no WhatsApp (Margot Atendente). Responde em português do Brasil, direto e conciso.",
  "",
  "Use SEMPRE as tools para obter números — nunca invente métrica nem estime sem dado. Se uma tool",
  "voltar vazia ou com erro, diga claramente que ainda não há dados (ex.: a coleta ainda não rodou ou",
  "o canal não está conectado) em vez de inventar. Não exponha detalhes técnicos (SQL, nomes de tabela).",
  "Traga o número que responde a pergunta primeiro; contexto depois. Se a pergunta fugir de métricas de",
  "conteúdo/atendimento, explique gentilmente seu escopo.",
].join("\n")

export type AskResult = { reply: string; usedTools: string[] }

/** Roda o loop de tool-use para o histórico dado. history = turnos user/assistant
 *  em texto (o cliente mantém). deps já resolvem o tenant da sessão. */
export async function ask(history: ChatTurn[], subs: Subs, deps: ToolDeps): Promise<AskResult> {
  const client = new Anthropic()
  const tools = toolsFor(subs)
  const messages: Anthropic.MessageParam[] = history.map((t) => ({ role: t.role, content: t.content }))
  const usedTools: string[] = []

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: SYSTEM,
      tools,
      messages,
    } as unknown as Anthropic.MessageCreateParamsNonStreaming)

    if (res.stop_reason === "refusal") {
      return { reply: "Não posso responder a isso (política de conteúdo).", usedTools }
    }
    messages.push({ role: "assistant", content: res.content })

    if (res.stop_reason !== "tool_use") {
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim()
      return { reply: reply || "Não consegui gerar uma resposta.", usedTools }
    }

    // Executa as tools pedidas e devolve os resultados num único turno de user.
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const b of res.content) {
      if (b.type !== "tool_use") continue
      usedTools.push(b.name)
      let out: unknown
      try {
        out = await runTool(b.name, b.input, subs, deps)
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) }
      }
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) })
    }
    messages.push({ role: "user", content: results })
  }

  return { reply: "Não consegui concluir a análise (muitas etapas). Tente reformular a pergunta.", usedTools }
}
