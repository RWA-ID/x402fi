import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // tsconfig keeps JSX for Next ("preserve"); tests compile it themselves (OG card).
  oxc: { jsx: { runtime: "automatic" } },
  test: { include: ["test/**/*.test.ts"] },
});
