import Link from "next/link"
import { Eyebrow } from "@/components/eyebrow"
import { produtoLabel } from "@/lib/pricing/tier-label"

// Guia de configuração da IA da Margot Atendente. Explica cada campo do
// "Comportamento do agente" (config-form) + conexão do WhatsApp.

const PROMPT_EXEMPLO = `Você é a Ana, atendente virtual da Clínica Sorriso.
Atende no WhatsApp, em português, de forma cordial e objetiva.

O que você faz:
- Tira dúvidas sobre serviços, horários e endereço.
- Ajuda a agendar/remarcar consultas (peça nome, serviço e melhor horário).
- Passa valores só dos itens da lista abaixo.

Regras:
- Nunca invente preços, disponibilidade ou informações que não estão aqui.
- Se não souber ou for um caso delicado, diga que vai chamar um atendente humano.
- Não dê conselhos médicos.

Informações:
- Endereço: Rua X, 123. Horário: seg–sex, 9h–18h.
- Serviços e valores: limpeza R$150; clareamento R$800.`

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-5">
      <h2 className="font-display text-lg font-semibold text-foreground">{titulo}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function GuiaMargotPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>
          <Link href="/margot" className="hover:underline">
            {produtoLabel("margot")}
          </Link>{" "}
          ·{" "}
          <Link href="/margot/configuracao" className="hover:underline">
            Configuração
          </Link>{" "}
          · Guia
        </Eyebrow>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Como configurar a IA da Margot</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A Margot Atendente responde no WhatsApp com IA, no tom da sua marca. O comportamento dela vem inteiro do
          que você define em{" "}
          <Link href="/margot/configuracao" className="text-primary hover:underline">Configuração</Link>. Abaixo, o
          que cada campo faz e como preencher bem.
        </p>
      </div>

      <Secao titulo="Prompt do sistema — a persona (o campo mais importante)">
        <p>
          É a instrução que define <span className="font-medium text-foreground">quem é a Margot, o que ela sabe e
          como age</span>. Quanto mais claro e específico, melhores as respostas. Inclua: o nome/persona, o que ela
          pode fazer, as informações do negócio (endereço, horários, serviços, valores) e as regras — principalmente{" "}
          <span className="font-medium text-foreground">o que ela NÃO deve fazer</span> e quando chamar um humano.
        </p>
        <p className="font-medium text-foreground">Modelo que você pode adaptar:</p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">{PROMPT_EXEMPLO}</pre>
        <p>
          Dica: a Margot só sabe o que está no prompt. Ela não inventa — se faltar uma informação, ela cai na regra de
          encaminhar. Mantenha o prompt atualizado (preços, horários) como fonte de verdade.
        </p>
      </Secao>

      <Secao titulo="Tom">
        <p>
          O estilo da conversa, em poucas palavras. Ex.: “cordial e objetivo”, “informal e caloroso”, “técnico e
          direto”. Complementa o prompt sem repetir as regras.
        </p>
      </Secao>

      <Secao titulo="Modelo — Haiku ou Sonnet">
        <p>
          Você escolhe qual modelo de IA responde:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-foreground">Haiku</span> — rápido e econômico. Ótimo para atendimento
            direto: dúvidas, FAQ, agendamento simples. É o padrão e resolve a maioria dos casos.
          </li>
          <li>
            <span className="font-medium text-foreground">Sonnet</span> — mais capaz e com mais nuance. Vale quando a
            conversa é mais complexa, exige interpretar melhor o cliente ou respostas mais elaboradas. Custa mais por
            resposta.
          </li>
        </ul>
        <p>
          Recomendação: comece com <span className="font-medium text-foreground">Haiku</span>; se sentir que as
          respostas precisam de mais profundidade, troque para <span className="font-medium text-foreground">Sonnet</span>{" "}
          e compare. Dá para mudar quando quiser.
        </p>
      </Secao>

      <Secao titulo="Máx. tokens">
        <p>
          O tamanho máximo de cada resposta. Valores menores deixam as respostas mais curtas e baratas; maiores
          permitem respostas mais completas. Para WhatsApp, respostas curtas costumam funcionar melhor — comece
          moderado e ajuste.
        </p>
      </Secao>

      <Secao titulo="Fallback">
        <p>
          A mensagem enviada quando a IA não consegue responder (erro ou tempo esgotado). Deixe algo acolhedor que
          conduz o cliente, ex.: “Não consegui responder agora — já vou chamar um atendente para te ajudar.”
        </p>
      </Secao>

      <Secao titulo="Quando um humano assume">
        <p>
          A Margot encaminha para atendimento humano nas situações que o seu prompt manda (casos delicados, fora do
          escopo) e você acompanha tudo em{" "}
          <Link href="/margot/atendimento" className="text-primary hover:underline">Atendimento</Link> — dá para
          responder manualmente a qualquer momento; o que você mesmo enviar não é cobrado.
        </p>
      </Secao>

      <Secao titulo="Conectar o WhatsApp (número dedicado)">
        <p>
          Antes de configurar o comportamento, conecte o WhatsApp na própria página de{" "}
          <Link href="/margot/configuracao" className="text-primary hover:underline">Configuração</Link> (leitura do
          QR Code). Use um <span className="font-medium text-foreground">número dedicado</span> à Margot — não o seu
          número pessoal —, porque o atendimento automático assume as mensagens daquele número.
        </p>
      </Secao>
    </div>
  )
}
