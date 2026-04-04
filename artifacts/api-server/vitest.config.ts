import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    exclude: process.env.DATABASE_URL
      ? []
      : [
          // Skip DB-dependent tests when no DATABASE_URL
          "src/__tests__/engines/**",
          "src/__tests__/api/**",
          "src/__tests__/workflows/**",
          "src/__tests__/e2e/**",
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
