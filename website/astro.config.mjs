// website/astro.config.mjs
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://codebywire.com",
  base: "/",
  trailingSlash: "always",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});
