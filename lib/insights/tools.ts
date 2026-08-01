import type Anthropic from "@anthropic-ai/sdk"

// Tools TIPADAS do assistente de métricas. O modelo escolhe tool + params; NUNCA
// escreve SQL. O tenant NÃO é parâmetro de tool nenhuma — é resolvido no servidor
// (deps), então o modelo não consegue cruzar tenant nem por prompt-injection.

export type Subs = { motor: boolean; margot: boolean }

// Injetadas pelo servidor: já resolvem o tenant da sessão (motorContext/margotContext).
export type ToolDeps = {
  editoraStats: (period?: string) => Promise<unknown>
  atendenteStats: () => Promise<unknown>
}

const EDITORA_STATS: Anthropic.Tool = {
  name: "editora_stats",
  description:
    "Desempenho das peças publicadas (Margot Editora): série diária de impressões/alcance/curtidas/" +
    "comentários/compartilhamentos, totais e quebra por pilar, no período. Use para perguntas sobre " +
    "conteúdo, posts, alcance, engajamento.",
  input_schema: {
    type: "object",
    properties: {
      period: { type: "string", description: "Mês AAAA-MM. Omitido = mês corrente." },
    },
    additionalProperties: false,
  },
}

const ATENDENTE_STATS: Anthropic.Tool = {
  name: "atendente_stats",
  description:
    "Desempenho do atendimento (Margot Atendente): série diária de respostas da IA, conversas novas e " +
    "handoffs; totais e uso vs incluído no plano. Use para perguntas sobre atendimento, WhatsApp, " +
    "respostas, handoffs, consumo do plano.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
}

/** Monta o array de tools só com os produtos que o tenant assina. */
export function toolsFor(subs: Subs): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = []
  if (subs.motor) tools.push(EDITORA_STATS)
  if (subs.margot) tools.push(ATENDENTE_STATS)
  return tools
}

/** Executa a tool escolhida pelo modelo. O tenant vem das deps (sessão), NUNCA do
 *  input — qualquer campo de tenant no input é ignorado por construção. */
export async function runTool(name: string, input: unknown, subs: Subs, deps: ToolDeps): Promise<unknown> {
  const obj = (input ?? {}) as Record<string, unknown>
  switch (name) {
    case "editora_stats": {
      if (!subs.motor) return { error: "tenant não assina a Margot Editora" }
      const period = typeof obj.period === "string" && /^\d{4}-\d{2}$/.test(obj.period) ? obj.period : undefined
      return deps.editoraStats(period)
    }
    case "atendente_stats": {
      if (!subs.margot) return { error: "tenant não assina a Margot Atendente" }
      return deps.atendenteStats()
    }
    default:
      return { error: `tool desconhecida: ${name}` }
  }
}
