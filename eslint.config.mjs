import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Prefixo _ marca variável intencionalmente não usada.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
      // Regras novas/advisórias do react-hooks (Next 16) — padrões deliberados no
      // console (try/catch de carga em Server Component; fechar menu na troca de
      // rota). Ficam como warn: orientam sem quebrar o build; refactor é fora do
      // escopo de higiene.
      "react-hooks/error-boundaries": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Código gerado pelo shadcn/ui — não mantido manualmente.
      "components/ui/**",
    ],
  },
]

export default eslintConfig
