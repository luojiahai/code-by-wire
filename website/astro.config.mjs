// website/astro.config.mjs
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://luojiahai.github.io",
  base: "/code-by-wire/",
  trailingSlash: "always",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});
