import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { loadPricing, pisoDe } from "./load"

const yaml = join(process.cwd(), "config", "pricing.yaml")

describe("loadPricing", () => {
  it("valida e carrega o pricing.yaml do projeto", () => {
    const p = loadPricing(yaml)
    expect(p.currency).toBe("BRL")
    expect(p.setup.degrau_13).toBe(true)
  })

  it("materializa os tiers do margot conforme o brief", () => {
    const p = loadPricing(yaml)
    const margot = p.produtos.margot
    expect(margot.metric).toBe("conversa")
    expect(margot.excedente_unitario).toBe(1.5)
    expect(margot.tiers.map((t) => [t.id, t.mensal, t.incluso])).toEqual([
      ["start", 400, 200],
      ["pro", 700, 600],
      ["scale", 1200, 1500],
    ])
    expect(margot.regras.handoff_max_mensagens).toBe(15)
  })

  it("materializa os tiers do motor com canais", () => {
    const p = loadPricing(yaml)
    const motor = p.produtos.motor
    expect(motor.metric).toBe("peca")
    expect(motor.excedente_unitario).toBe(25)
    expect(motor.tiers.map((t) => [t.id, t.mensal, t.incluso, t.canais])).toEqual([
      ["start", 400, 12, 1],
      ["pro", 700, 30, 2],
      ["scale", 1200, 60, 3],
    ])
    expect(motor.regras.janela_aprovacao_horas).toBe(48)
    expect(motor.regras.max_regeneracoes_por_peca).toBe(2)
  })

  it("pisoDe retorna a menor mensalidade (Degrau 13)", () => {
    const p = loadPricing(yaml)
    expect(pisoDe(p.produtos.margot)).toBe(400)
    expect(pisoDe(p.produtos.motor)).toBe(400)
  })
})
