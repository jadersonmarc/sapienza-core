// Rótulo comercial do tier para exibição. O ID interno segue `scale` em todo lado
// (pricing.yaml, plans, subscriptions); só a APRESENTAÇÃO usa "Premium".
const LABELS: Record<string, string> = {
  start: "Start",
  pro: "Pro",
  scale: "Premium",
}

export function tierLabel(tier: string): string {
  return LABELS[tier] ?? tier
}

// Nome comercial do produto para exibição. Mantido em sincronia com o `nome` de
// config/pricing.yaml (fonte canônica — a home do console lê de lá via loadPricing).
// Estático aqui para poder ser usado também em client components. O id interno
// segue `margot`/`motor` em todo o resto (rotas, cobrança, subscriptions).
const PRODUTO_LABELS: Record<string, string> = {
  margot: "Margot Atendente",
  motor: "Margot Editora",
  combo: "Combo Sapienza",
}

export function produtoLabel(produto: string): string {
  return PRODUTO_LABELS[produto] ?? produto
}

// Rótulo pt-BR (plural) da métrica cobrável de cada produto — "peca" conta peças
// PUBLICADAS; "resposta", mensagens da IA enviadas. Usado na UI de uso.
const METRIC_LABELS: Record<string, string> = {
  peca: "peças",
  resposta: "respostas",
}

export function metricPlural(metric: string): string {
  return METRIC_LABELS[metric] ?? `${metric}s`
}
