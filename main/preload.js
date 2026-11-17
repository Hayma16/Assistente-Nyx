const { contextBridge, ipcRenderer } = require('electron');

// A "ponte" entre a tela e o processo principal.
// Dentro do renderer.js isso aparece como window.nyx.notificar(...)
contextBridge.exposeInMainWorld('nyx', {
  notificar: (titulo, corpo) => ipcRenderer.send('notificar', { titulo, corpo }),
});