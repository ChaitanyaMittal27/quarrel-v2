import { defineConfig } from "vitest/config";

// One `npm test` runs every workspace's tests. Each entry is a separate Vitest "project"
// with its own root. ui/ is added in sub-stage C.
export default defineConfig({
  test: {
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
        },
      },
    ],
  },
});
