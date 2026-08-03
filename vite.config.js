import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// viteSingleFile inlines JS/CSS into dist/index.html at build time so the
// production build stays a single self-contained file — no separate asset
// requests, no runtime fetch of cases.json. That's what lets `dist/index.html`
// be dropped straight into an Artifact publish. It only applies during
// `vite build`; `vite dev` is unaffected.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
});
