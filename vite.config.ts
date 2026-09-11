import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// O processo principal e o preload correm em Node de verdade (não no browser),
// por isso não faz sentido o Vite tentar meter o discord.js e afins dentro do
// bundle — isso rebenta com dependências opcionais nativas (ex.: zlib-sync).
// Ficam de fora do bundle e são lidos de node_modules em runtime, como em
// qualquer app Node normal.
const externalizeNodeModules = (id: string) => !id.startsWith('.') && !path.isAbsolute(id)

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // a app carrega dist/index.html por file://, não por um servidor — caminhos têm de ser relativos
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: { rollupOptions: { external: externalizeNodeModules } },
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: { rollupOptions: { external: externalizeNodeModules } },
        },
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
})
