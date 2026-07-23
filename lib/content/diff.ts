export type DiffLine = { type: "eq" | "add" | "del"; text: string }

// Diff de linhas via LCS (sem dependências). Bom o suficiente para revisões de
// conteúdo. Portado de spa-sapienza/lib/content/diff.ts.
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText ? oldText.split("\n") : []
  const b = newText ? newText.split("\n") : []
  const n = a.length
  const m = b.length

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "eq", text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "del", text: a[i] })
      i++
    } else {
      out.push({ type: "add", text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] })
  while (j < m) out.push({ type: "add", text: b[j++] })
  return out
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.type === "add") added++
    else if (l.type === "del") removed++
  }
  return { added, removed }
}
