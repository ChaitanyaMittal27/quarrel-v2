import { defineConfig } from "vitest/config";

// One `npm test` runs every workspace's tests. Each entry is a separate Vitest "project"
// with its own root. The ui project is added with the UI port (last slice).
export default defineConfig({
  test: {
    // `npm run test:coverage`: report on server and shared source, not on the tests.
    // No thresholds yet; they are enforced from slice 1. Output goes to coverage/ (git-ignored).
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/tests/**", "**/*.test.ts"],
      reporter: ["text", "html", "json-summary"],
    },
    projects: [
      {
        test: {
          name: "shared",
          root: "./shared",
          include: ["tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "server",
          root: "./server",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          // Same as v1: the ported AI tests rely on spies and mocks being reset between tests.
          restoreMocks: true,
          clearMocks: true,
        },
      },
    ],
  },
});
