import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerIpcHandlers, bootstrap } from './ipc/index'
import { ensureDataDirs } from './store/paths'
import { openDatabase } from './db/database'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// A estrutura depois do build:
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
const TITLEBAR_HEIGHT = 40

/** Ações dos menus da barra de título (Ficheiro / Editar / Ver). */
function registerWindowHandlers() {
  ipcMain.handle('window:action', (_e, action: string) => {
    const w = win
    if (!w) return
    const wc = w.webContents
    switch (action) {
      case 'reload':
        wc.reload()
        break
      case 'devtools':
        wc.toggleDevTools()
        break
      case 'zoomIn':
        wc.setZoomLevel(Math.min(4, wc.getZoomLevel() + 0.5))
        break
      case 'zoomOut':
        wc.setZoomLevel(Math.max(-3, wc.getZoomLevel() - 0.5))
        break
      case 'zoomReset':
        wc.setZoomLevel(0)
        break
      case 'fullscreen':
        w.setFullScreen(!w.isFullScreen())
        break
      case 'minimize':
        w.minimize()
        break
      case 'maximize':
        if (w.isMaximized()) w.unmaximize()
        else w.maximize()
        break
      case 'quit':
        app.quit()
        break
      case 'undo':
      case 'redo':
      case 'cut':
      case 'copy':
      case 'paste':
      case 'selectAll':
        wc[action]()
        break
    }
  })
  ipcMain.handle('window:platform', () => process.platform)
}

function createWindow() {
  win = new BrowserWindow({
    title: 'LisDiscord',
    icon: path.join(process.env.VITE_PUBLIC as string, 'icon.png'),
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    // Sem a barra de título do Windows: a app desenha a sua (TitleBar.tsx) e os botões
    // minimizar/maximizar/fechar nativos ficam por cima, nas cores da app (mantém o "encaixar" do Windows 11).
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#0b0d10', symbolColor: '#c9d1d9', height: TITLEBAR_HEIGHT },
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Links externos (ex.: portal de developers da Discord) abrem no browser do sistema, nunca dentro da app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  ensureDataDirs()
  await openDatabase()
  registerIpcHandlers(() => win)
  registerWindowHandlers()
  createWindow()
  await bootstrap()
})
