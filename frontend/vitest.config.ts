import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // firestore-tests needs the Firestore emulator; CI runs it in its own job.
    exclude: ["**/node_modules/**", "e2e/**", "firestore-tests/**"],
  },
});
