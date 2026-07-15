import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve o alias @/* (igual ao tsconfig) para os testes.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // Testes de integração compartilham um único Postgres e recriam o schema public
  // no setup; rodar os arquivos em série evita corrida entre eles.
  test: {
    fileParallelism: false,
  },
})
