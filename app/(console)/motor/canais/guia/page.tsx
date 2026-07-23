import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { produtoLabel } from "@/lib/pricing/tier-label"

// Guia de credenciais por canal da Margot Editora. Os campos de cada canal
// espelham REQUIRED_CREDENTIALS do Motor (app/api/v1/setup). Na tela de Canais,
// cole o JSON indicado no campo "Credenciais do canal".

type Canal = {
  nome: string
  campos: string[]
  preReq: string
  permissoes?: string
  onde: string[]
  json: string
  nota?: string
  doc?: { label: string; url: string }
}

const CANAIS: Canal[] = [
  {
    nome: "Instagram",
    campos: ["access_token", "account_id"],
    preReq:
      "Conta do Instagram Profissional (Business) vinculada a uma Página do Facebook + um app no Meta for Developers com a Instagram Graph API.",
    permissoes: "instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement",
    onde: [
      "access_token — gere um Token de Página (Page Access Token) de LONGA duração, com as permissões acima (Graph API Explorer ou seu fluxo OAuth).",
      "account_id — chame GET /{id-da-página}?fields=instagram_business_account. O id retornado é o account_id (ID da conta Instagram Business).",
    ],
    json: '{ "access_token": "EAAG…", "account_id": "17841400000000000" }',
    nota: "Publicar no Instagram exige imagem em URL pública — a Margot Editora já gera a capa on-brand e a serve publicamente.",
    doc: {
      label: "Meta — Instagram Content Publishing",
      url: "https://developers.facebook.com/docs/instagram-api/guides/content-publishing",
    },
  },
  {
    nome: "Facebook (Página)",
    campos: ["access_token", "page_id"],
    preReq: "Uma Página do Facebook + um app no Meta for Developers com a Pages API.",
    permissoes: "pages_manage_posts, pages_read_engagement, pages_show_list",
    onde: [
      "access_token — Token de Página (Page Access Token) de longa duração com as permissões acima.",
      "page_id — o ID numérico da Página (em Configurações da Página → Sobre → ID da Página, ou GET /me/accounts).",
    ],
    json: '{ "access_token": "EAAG…", "page_id": "123456789012345" }',
    doc: { label: "Meta — Pages API (Posts)", url: "https://developers.facebook.com/docs/pages-api/posts" },
  },
  {
    nome: "LinkedIn",
    campos: ["access_token", "author_urn"],
    preReq:
      "Um app no LinkedIn Developers com o produto 'Share on LinkedIn' (perfil pessoal) ou 'Community Management API' (página de empresa).",
    permissoes: "escopo w_member_social (postar como membro)",
    onde: [
      "access_token — token OAuth 2.0 (3-legged) do membro, com o escopo w_member_social.",
      "author_urn — para pessoa: urn:li:person:{id} (o id vem de GET https://api.linkedin.com/v2/userinfo, campo 'sub'). Para empresa: urn:li:organization:{id}.",
    ],
    json: '{ "access_token": "AQV…", "author_urn": "urn:li:person:AbC123xyz" }',
    doc: {
      label: "LinkedIn — Share on LinkedIn",
      url: "https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/share-on-linkedin",
    },
  },
  {
    nome: "X (Twitter)",
    campos: ["access_token", "username"],
    preReq:
      "Um Projeto/App no X Developer Portal com acesso à API v2. Publicar tweets exige um plano PAGO da X API.",
    permissoes: "escopos tweet.write, tweet.read, users.read, offline.access",
    onde: [
      "access_token — token OAuth 2.0 de contexto de usuário (User Context) com o escopo tweet.write.",
      "username — seu @ sem o arroba (opcional; só monta a URL final do tweet).",
    ],
    json: '{ "access_token": "…", "username": "suaempresa" }',
    doc: { label: "X — API v2", url: "https://developer.x.com/en/docs/x-api" },
  },
  {
    nome: "Threads",
    campos: ["access_token", "user_id"],
    preReq: "Conta Threads profissional + a Threads API habilitada no seu app Meta.",
    permissoes: "threads_basic, threads_content_publish",
    onde: [
      "access_token — token da Threads API de longa duração, com as permissões acima.",
      "user_id — GET https://graph.threads.net/v1.0/me?fields=id. O id retornado é o user_id.",
    ],
    json: '{ "access_token": "TH…", "user_id": "17841400000000000" }',
    doc: { label: "Meta — Threads API", url: "https://developers.facebook.com/docs/threads" },
  },
  {
    nome: "Blog — WordPress",
    campos: ["site_url", "username", "app_password"],
    preReq:
      "Um site WordPress com a REST API acessível (o padrão) e um usuário com papel de Autor ou Editor. Sem plugins.",
    onde: [
      "site_url — o endereço do site (ex.: https://cliente.com).",
      "username — o login do usuário WordPress (Autor/Editor).",
      "app_password — em Usuários → Perfil → Senhas de aplicativo (WordPress 5.6+), gere uma nova e copie os blocos exatamente como aparecem.",
    ],
    json: '{ "site_url": "https://cliente.com", "username": "editor", "app_password": "abcd 1234 efgh 5678" }',
    nota: "O texto (markdown) é convertido para HTML e o post sai publicado. Imagem de capa fica para uma próxima versão.",
    doc: {
      label: "WordPress — Application Passwords",
      url: "https://wordpress.org/documentation/article/application-passwords/",
    },
  },
  {
    nome: "Blog — Webhook (site sob medida)",
    campos: ["url", "secret"],
    preReq:
      "Um endpoint no seu site que receba a peça por POST (JSON) e a publique. Serve para qualquer site/CMS, mas exige um pequeno desenvolvimento do seu lado.",
    onde: [
      "url — o endereço do seu endpoint (ex.: https://cliente.com/hooks/sapienza).",
      "secret — um segredo forte que você define; o seu endpoint o usa para validar a assinatura.",
    ],
    json: '{ "url": "https://cliente.com/hooks/sapienza", "secret": "um-segredo-forte" }',
    nota:
      "A Margot Editora envia POST com o header X-Sapienza-Signature: sha256=HMAC(secret, corpo). Valide-o antes de publicar. Payload: { slug, title, body_markdown, image_url, published_at }. Responda 2xx (opcional: { \"url\": \"…\" } com o link final).",
  },
]

function CanalCard({ c }: { c: Canal }) {
  return (
    <section className="rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">{c.nome}</h2>
        {c.campos.map((f) => (
          <code key={f} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {f}
          </code>
        ))}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Pré-requisitos: </span>
        {c.preReq}
      </p>
      {c.permissoes && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Permissões: </span>
          <span className="font-mono text-xs">{c.permissoes}</span>
        </p>
      )}

      <p className="mt-3 text-sm font-medium text-foreground">Onde obter cada valor</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
        {c.onde.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>

      <p className="mt-3 text-sm font-medium text-foreground">Cole isto no campo “Credenciais do canal”</p>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">{c.json}</pre>

      {c.nota && <p className="mt-3 text-xs text-muted-foreground">{c.nota}</p>}

      {c.doc && (
        <a
          href={c.doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Documentação oficial: {c.doc.label} ↗
        </a>
      )}
    </section>
  )
}

export default function GuiaCanaisPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/motor" className="hover:underline">
            {produtoLabel("motor")}
          </Link>{" "}
          ·{" "}
          <Link href="/motor/canais" className="hover:underline">
            Canais
          </Link>{" "}
          · Guia de tokens
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Como obter os tokens de cada canal</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Para conectar um canal em <Link href="/motor/canais" className="text-primary hover:underline">Canais</Link>,
          você cola um JSON de credenciais. Abaixo, o que cada canal exige e onde conseguir. As credenciais são
          cifradas por tenant — ninguém as vê em texto depois de salvas.
        </p>
      </div>

      <div className="grid gap-4">
        {CANAIS.map((c) => (
          <CanalCard key={c.nome} c={c} />
        ))}
      </div>

      {/* Canal Blog interno */}
      <section className="rounded-xl border border-dashed border-border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-foreground">Blog (interno)</h2>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">sem credenciais</code>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          O canal <span className="font-medium text-foreground">Blog</span> apenas marca a peça como publicada na
          plataforma pela sua slug — não pede token. Para publicar no blog do{" "}
          <span className="font-medium text-foreground">seu próprio site</span>, use os canais{" "}
          <span className="font-medium text-foreground">Blog — WordPress</span> (self-service) ou{" "}
          <span className="font-medium text-foreground">Blog — Webhook</span> (site sob medida) acima.
        </p>
      </section>
    </div>
  )
}
