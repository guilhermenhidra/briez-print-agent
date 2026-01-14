const { contextBridge, ipcRenderer } = require('electron');

// Expor API segura para o renderer
contextBridge.exposeInMainWorld('briez', {
  // Obter status do servidor
  getStatus: () => ipcRenderer.invoke('get-status'),
  
  // Obter lista de impressoras
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  
  // Imprimir teste
  printTest: (printerId) => ipcRenderer.invoke('print-test', printerId),
  
  // Configurações
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // Eventos
  onStatusChange: (callback) => {
    ipcRenderer.on('status-change', (event, status) => callback(status));
  },
  
  onPrintJob: (callback) => {
    ipcRenderer.on('print-job', (event, job) => callback(job));
  },
  
  // Sistema
  minimize: () => ipcRenderer.send('minimize-window'),
  close: () => ipcRenderer.send('close-window'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
