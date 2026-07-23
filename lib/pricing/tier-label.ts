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
