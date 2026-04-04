import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/__tests__/engines/**/*.test.ts",
      "src/__tests__/api/**/*.test.ts",
      "src/__tests__/workflows/**/*.test.ts",
      "src/__tests__/security/injection.test.ts",
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      reporter: ["text", "text-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
