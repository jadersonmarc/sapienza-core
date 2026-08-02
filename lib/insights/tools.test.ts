import { describe, it, expect, vi } from "vitest"
import { toolsFor, runTool, type ToolDeps } from "./tools"

// Puro — sem DB nem LLM. Cobre a garantia multi-tenant (tenant vem das deps, nunca
// do input do modelo) e o gating por assinatura.

const deps = (): ToolDeps => ({
  editoraStats: vi.fn(async (period?: string) => ({ tool: "stats", period: period ?? "corrente" })),
  editoraTopPosts: vi.fn(async (period?: string, limit?: number) => ({ tool: "top", period, limit })),
  editoraByConfig: vi.fn(async (period?: string) => ({ tool: "byConfig", period })),
  editoraGrowth: vi.fn(async (period?: string) => ({ tool: "growth", period })),
  atendenteStats: vi.fn(async (period?: string) => ({ tool: "atendente", period })),
})

describe("toolsFor", () => {
  it("expõe só as tools dos produtos assinados", () => {
    expect(toolsFor({ motor: true, margot: false }).map((t) => t.name)).toEqual([
      "editora_stats",
      "editora_top_posts",
      "editora_by_config",
      "editora_growth",
    ])
    expect(toolsFor({ motor: false, margot: true }).map((t) => t.name)).toEqual(["atendente_stats"])
    expect(toolsFor({ motor: true, margot: true })).toHaveLength(5)
    expect(toolsFor({ motor: false, margot: false })).toEqual([])
  })
})

describe("runTool", () => {
  it("usa o period do input mas IGNORA qualquer tenant no input", async () => {
    const d = deps()
    await runTool("editora_stats", { period: "2026-01", tenantId: "evil", tenant: "evil2" }, { motor: true, margot: false }, d)
    expect(d.editoraStats).toHaveBeenCalledWith("2026-01") // só period; tenant nunca chega às deps
  })

  it("editora_top_posts passa period + limit; period inválido vira undefined", async () => {
    const d = deps()
    await runTool("editora_top_posts", { period: "2026-02", limit: 3 }, { motor: true, margot: false }, d)
    expect(d.editoraTopPosts).toHaveBeenCalledWith("2026-02", 3)
    await runTool("editora_top_posts", { period: "xx" }, { motor: true, margot: false }, d)
    expect(d.editoraTopPosts).toHaveBeenLastCalledWith(undefined, undefined)
  })

  it("editora_by_config e atendente_stats (com period)", async () => {
    const d = deps()
    await runTool("editora_by_config", { period: "2026-03" }, { motor: true, margot: false }, d)
    expect(d.editoraByConfig).toHaveBeenCalledWith("2026-03")
    await runTool("editora_growth", { period: "2026-03" }, { motor: true, margot: false }, d)
    expect(d.editoraGrowth).toHaveBeenCalledWith("2026-03")
    await runTool("atendente_stats", { period: "2026-04" }, { motor: false, margot: true }, d)
    expect(d.atendenteStats).toHaveBeenCalledWith("2026-04")
  })

  it("recusa as tools de um produto não assinado", async () => {
    const d = deps()
    for (const name of ["editora_stats", "editora_top_posts", "editora_by_config", "editora_growth"]) {
      expect(await runTool(name, {}, { motor: false, margot: true }, d)).toMatchObject({ error: expect.stringContaining("não assina") })
    }
    expect(await runTool("atendente_stats", {}, { motor: true, margot: false }, d)).toMatchObject({ error: expect.stringContaining("não assina") })
    expect(d.editoraStats).not.toHaveBeenCalled()
    expect(d.editoraTopPosts).not.toHaveBeenCalled()
    expect(d.editoraByConfig).not.toHaveBeenCalled()
    expect(d.editoraGrowth).not.toHaveBeenCalled()
    expect(d.atendenteStats).not.toHaveBeenCalled()
  })

  it("tool desconhecida devolve erro", async () => {
    expect(await runTool("drop_tables", {}, { motor: true, margot: true }, deps())).toMatchObject({ error: expect.stringContaining("desconhecida") })
  })
})
