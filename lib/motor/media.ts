// Helpers puros da biblioteca de mídia no console. Espelham as pastas/finalidades
// do Motor (lib/storage/keys.ts) — mantidos aqui porque o console não importa o
// código do produto; só monta strings de chave/rótulo para a UI.

export type R2Purpose = "instagram" | "linkedin" | "article" | "page" | "editor" | "geral"

const PREFIX: Record<R2Purpose, string> = {
  instagram: "social/instagram",
  linkedin: "social/linkedin",
  article: "articles",
  page: "pages",
  editor: "editor",
  geral: "geral",
}

/** Pastas navegáveis na biblioteca (ordem de exibição). */
export const R2_PURPOSES: readonly R2Purpose[] = ["instagram", "linkedin", "article", "page", "editor", "geral"]

export const FOLDER_LABEL: Record<R2Purpose, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  article: "Artigos",
  page: "Páginas",
  editor: "Editor",
  geral: "Geral",
}

export function prefixFor(p: R2Purpose): string {
  return PREFIX[p]
}

export function fileNameFromKey(key: string): string {
  return key.split("/").pop() || key
}

export function formatBytes(n?: number): string {
  if (typeof n !== "number") return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Nome de arquivo seguro: sem barras/espaços problemáticos; preserva ext. */
function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
  return cleaned || "arquivo"
}

function keyFolder(key: string): string {
  const i = key.lastIndexOf("/")
  return i >= 0 ? key.slice(0, i) : ""
}

/** Renomear: mantém a pasta, troca só o nome do arquivo (sanitizado). */
export function destKeyForRename(srcKey: string, newName: string): string {
  const folder = keyFolder(srcKey)
  const safe = sanitizeFileName(newName)
  return folder ? `${folder}/${safe}` : safe
}

/** Mover: mantém o nome do arquivo, troca a pasta para a finalidade alvo. */
export function destKeyForMove(srcKey: string, target: R2Purpose): string {
  const file = srcKey.split("/").pop() || srcKey
  return `${PREFIX[target]}/${file}`
}
