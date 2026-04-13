import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pyproject = fs.readFileSync(path.resolve(__dirname, "../pyproject.toml"), "utf-8");
const appVersion = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendPort = env.PORT || "8080";

  return {
    plugins: [tanstackRouter({ quoteStyle: "double" }), react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    build: {
      outDir: "dist",
    },
  };
});
