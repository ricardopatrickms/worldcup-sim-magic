// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // SPA mode: emit a static shell that mounts the app in the browser. The app is
    // fully client-side (ESPN data is fetched in the browser), so this lets us host it
    // as plain static files (GitHub Pages) with no server. Gated on an env var so the
    // Lovable build keeps its normal SSR behavior — only the Pages CI build sets this.
    spa: { enabled: process.env.GITHUB_PAGES === "true" },
  },
});
