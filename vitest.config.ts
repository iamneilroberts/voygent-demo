import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["worker/**/*.test.ts", "shared/**/*.test.ts", "web/src/**/*.test.ts", "web/src/**/*.test.tsx", "scripts/**/*.test.mjs"] } });
