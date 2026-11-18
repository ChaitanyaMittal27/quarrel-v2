import { defineConfig } from "vitest/config";

// One `npm test` runs every workspace's tests. Each entry is a separate Vitest "project"
// with its own root. UI tests exercise the HTTP/socket helpers without a DOM dependency.
export default defineConfig({
  test: {
    // `npm run test:coverage`: report on server and shared source, not on the tests.
    // Each workspace must pass independently, including the ported AI and entry points.
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/tests/**", "**/*.test.ts"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        "server/**": { statements: 90, lines: 90, functions: 90, branches: 85 },
        "shared/**": { statements: 90, lines: 90, functions: 90, branches: 85 },
      },
    },
    projects: [
      {
        test: {
          name: "ui", root: "./ui", include: ["tests/**/*.test.ts"], environment: "node",
          restoreMocks: true, clearMocks: true,
          server: { deps: { inline: ["@quarrel/shared"] } },
        },
      },
      {
        test: {
          name: "shared",
          root: "./shared",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          server: { deps: { inline: ["@quarrel/shared"] } },
        },
      },
      {
        test: {
          name: "server",
          root: "./server",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          server: { deps: { inline: ["@quarrel/shared"] } },
          // Same as v1: the ported AI tests rely on spies and mocks being reset between tests.
          restoreMocks: true,
          clearMocks: true,
        },
      },
    ],
  },
});
