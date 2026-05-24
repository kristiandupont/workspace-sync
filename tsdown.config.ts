import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    backend: "src/backend/index.ts",
    frontend: "src/frontend/index.tsx",
  },
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
