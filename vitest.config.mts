import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve o alias @/* (igual ao tsconfig) para os testes.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
