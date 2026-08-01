import type Anthropic from "@anthropic-ai/sdk"

// Tools TIPADAS do assistente de métricas. O modelo escolhe tool + params; NUNCA
// escreve SQL. O tenant NÃO é parâmetro de tool nenhuma — é resolvido no servidor
// (deps), então o modelo não consegue cruzar tenant nem por prompt-injection.

export type Subs = { motor: boolean; margot: boolean }

// Injetadas pelo servidor: já resolvem o tenant da sessão (motorContext/margotContext).
export type ToolDeps = {
  editoraStats: (period?: string) => Promise<unknown>
  editoraTopPosts: (period?: string, limit?: number) => Promise<unknown>
  editoraByConfig: (period?: string) => Promise<unknown>
  atendenteStats: (period?: string) => Promise<unknown>
}

const PERIOD_PROP = { period: { type: "string", description: "Mês AAAA-MM. Omitido = mês corrente. Para comparar meses, chame a tool uma vez por período." } }

const EDITORA_STATS: Anthropic.Tool = {
  name: "editora_stats",
  description:
    "Desempenho das peças publicadas (Margot Editora): série diária de impressões/alcance/curtidas/" +
    "comentários/compartilhamentos, totais e quebra por pilar, no período.",
  input_schema: { type: "object", properties: { ...PERIOD_PROP }, additionalProperties: false },
}

const EDITORA_TOP_POSTS: Anthropic.Tool = {
  name: "editora_top_posts",
  description:
    "Melhores posts do período por impressões (título, pilar, formato, impressões/curtidas/comentários). " +
    "Use para 'quais posts foram melhores', rankings, exemplos de destaque.",
  input_schema: {
    type: "object",
    properties: { ...PERIOD_PROP, limit: { type: "integer", description: "Quantos posts (1–20; padrão 5)." } },
    additionalProperties: false,
  },
}

const EDITORA_BY_CONFIG: Anthropic.Tool = {
  name: "editora_by_config",
  description:
    "Desempenho agrupado por versão da configuração de geração (config_version): posts, impressões e " +
    "média por versão. Use para correlacionar COMO a peça foi gerada (mudanças de prompt/tom/temas) " +
    "com o resultado — ex.: 'a config nova rendeu mais?'.",
  input_schema: { type: "object", properties: { ...PERIOD_PROP }, additionalProperties: false },
}

const ATENDENTE_STATS: Anthropic.Tool = {
  name: "atendente_stats",
  description:
    "Desempenho do atendimento (Margot Atendente): série diária de respostas da IA, conversas novas e " +
    "handoffs; totais e uso vs incluído no plano, no período.",
  input_schema: { type: "object", properties: { ...PERIOD_PROP }, additionalProperties: false },
}

/** Monta o array de tools só com os produtos que o tenant assina. */
export function toolsFor(subs: Subs): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = []
  if (subs.motor) tools.push(EDITORA_STATS, EDITORA_TOP_POSTS, EDITORA_BY_CONFIG)
  if (subs.margot) tools.push(ATENDENTE_STATS)
  return tools
}

const validPeriod = (v: unknown): string | undefined =>
  typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : undefined

/** Executa a tool escolhida pelo modelo. O tenant vem das deps (sessão), NUNCA do
 *  input — qualquer campo de tenant no input é ignorado por construção. */
export async function runTool(name: string, input: unknown, subs: Subs, deps: ToolDeps): Promise<unknown> {
  const obj = (input ?? {}) as Record<string, unknown>
  const period = validPeriod(obj.period)
  switch (name) {
    case "editora_stats":
      if (!subs.motor) return { error: "tenant não assina a Margot Editora" }
      return deps.editoraStats(period)
    case "editora_top_posts": {
      if (!subs.motor) return { error: "tenant não assina a Margot Editora" }
      const limit = typeof obj.limit === "number" && Number.isFinite(obj.limit) ? obj.limit : undefined
      return deps.editoraTopPosts(period, limit)
    }
    case "editora_by_config":
      if (!subs.motor) return { error: "tenant não assina a Margot Editora" }
      return deps.editoraByConfig(period)
    case "atendente_stats":
      if (!subs.margot) return { error: "tenant não assina a Margot Atendente" }
      return deps.atendenteStats(period)
    default:
      return { error: `tool desconhecida: ${name}` }
  }
}
