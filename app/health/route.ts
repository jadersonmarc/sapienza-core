export const runtime = "nodejs"

// GET /health — liveness para o Coolify, uniforme com margot e motor. A raiz `/`
// do core redireciona para /login (307) quando não há sessão, e nem todo health
// check aceita 3xx; este responde 200 sem ambiguidade.
//
// Precisa estar FORA do matcher do middleware (middleware.ts), senão o callback
// authorized() o manda para /login — mesma armadilha do /api/cron. Não toca no
// banco: prova que o Node responde, não que o Postgres está de pé.
export function GET(): Response {
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })
}
