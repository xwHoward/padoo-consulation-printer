import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./",
  server: {
    host: "127.0.0.1",
    proxy: {
      "/__auth": {
        target: "https://cloud1-0gkbm1dic147ccec.tcloudbaseapp.com/",
        changeOrigin: true,
      },
    },
    allowedHosts: true,
  },
});
