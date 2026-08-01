import { describe, it, expect, vi } from "vitest"
import { toolsFor, runTool, type ToolDeps } from "./tools"

// Puro — sem DB nem LLM. Cobre a garantia multi-tenant (tenant vem das deps, nunca
// do input do modelo) e o gating por assinatura.

const deps = (): ToolDeps => ({
  editoraStats: vi.fn(async (period?: string) => ({ period: period ?? "corrente", ok: true })),
  atendenteStats: vi.fn(async () => ({ ok: true })),
})

describe("toolsFor", () => {
  it("expõe só as tools dos produtos assinados", () => {
    expect(toolsFor({ motor: true, margot: false }).map((t) => t.name)).toEqual(["editora_stats"])
    expect(toolsFor({ motor: false, margot: true }).map((t) => t.name)).toEqual(["atendente_stats"])
    expect(toolsFor({ motor: true, margot: true }).map((t) => t.name)).toEqual(["editora_stats", "atendente_stats"])
    expect(toolsFor({ motor: false, margot: false })).toEqual([])
  })
})

describe("runTool", () => {
  it("editora_stats: usa o period do input mas IGNORA qualquer tenant no input", async () => {
    const d = deps()
    const out = await runTool("editora_stats", { period: "2026-01", tenantId: "evil", tenant: "evil2" }, { motor: true, margot: false }, d)
    expect(d.editoraStats).toHaveBeenCalledWith("2026-01") // só o period; tenant nunca chega às deps
    expect(out).toMatchObject({ period: "2026-01", ok: true })
  })

  it("editora_stats: period inválido vira undefined (mês corrente)", async () => {
    const d = deps()
    await runTool("editora_stats", { period: "não-é-período" }, { motor: true, margot: false }, d)
    expect(d.editoraStats).toHaveBeenCalledWith(undefined)
  })

  it("recusa a tool de um produto não assinado", async () => {
    const d = deps()
    expect(await runTool("editora_stats", {}, { motor: false, margot: true }, d)).toMatchObject({ error: expect.stringContaining("não assina") })
    expect(await runTool("atendente_stats", {}, { motor: true, margot: false }, d)).toMatchObject({ error: expect.stringContaining("não assina") })
    expect(d.editoraStats).not.toHaveBeenCalled()
    expect(d.atendenteStats).not.toHaveBeenCalled()
  })

  it("tool desconhecida devolve erro", async () => {
    expect(await runTool("drop_tables", {}, { motor: true, margot: true }, deps())).toMatchObject({ error: expect.stringContaining("desconhecida") })
  })
})
