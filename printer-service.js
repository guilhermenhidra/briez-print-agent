const { exec } = require('child_process');
const net = require('net');
const os = require('os');

// Cache de impressoras
let printerCache = [];
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30 segundos

/**
 * Detecta impressoras instaladas no Windows
 */
async function detectWindowsPrinters() {
  return new Promise((resolve) => {
    // Usar WMIC para listar impressoras (funciona em Windows)
    exec('wmic printer get name,portname,status /format:csv', { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        console.error('Erro ao detectar impressoras Windows:', error);
        resolve([]);
        return;
      }

      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const printers = [];

      // Pular cabeçalho
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 3) {
          const name = parts[1]?.trim();
          const portName = parts[2]?.trim() || '';
          const status = parts[3]?.trim() || '';
          
          if (name) {
            // Determinar tipo baseado na porta
            let type = 'usb';
            let ip = null;
            let port = null;

            if (portName.startsWith('IP_')) {
              type = 'network';
              const match = portName.match(/IP_(\d+\.\d+\.\d+\.\d+)/);
              if (match) {
                ip = match[1];
                port = 9100; // Porta padrão para impressoras térmicas
              }
            } else if (portName.includes(':')) {
              type = 'network';
              const [ipPart, portPart] = portName.split(':');
              ip = ipPart;
              port = parseInt(portPart) || 9100;
            } else if (portName.startsWith('COM')) {
              type = 'serial';
            }

            printers.push({
              id: `win-${Buffer.from(name).toString('base64').slice(0, 12)}`,
              name: name,
              type: type,
              ip: ip,
              port: port,
              portName: portName,
              status: status === 'OK' || status === '' ? 'online' : 'offline',
              raw: { portName, status },
            });
          }
        }
      }

      resolve(printers);
    });
  });
}

/**
 * Escanear rede local por impressoras térmicas (porta 9100)
 */
async function scanNetworkPrinters() {
  const printers = [];
  const localIp = getLocalIp();
  
  if (!localIp) return printers;

  // Extrair subnet
  const subnet = localIp.split('.').slice(0, 3).join('.');
  
  // Escanear IPs comuns para impressoras (rápido, apenas alguns IPs)
  const commonIps = [
    `${subnet}.100`, `${subnet}.101`, `${subnet}.102`,
    `${subnet}.200`, `${subnet}.201`, `${subnet}.202`,
    `${subnet}.150`, `${subnet}.151`,
  ];

  const scanPromises = commonIps.map(ip => checkPrinterPort(ip, 9100));
  const results = await Promise.all(scanPromises);

  results.forEach((isOpen, index) => {
    if (isOpen) {
      printers.push({
        id: `net-${commonIps[index].replace(/\./g, '-')}`,
        name: `Impressora ${commonIps[index]}`,
        type: 'network',
        ip: commonIps[index],
        port: 9100,
        status: 'online',
      });
    }
  });

  return printers;
}

/**
 * Verifica se uma porta está aberta
 */
function checkPrinterPort(ip, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

/**
 * Obtém IP local da máquina
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return null;
}

/**
 * Lista todas as impressoras (Windows + rede)
 */
async function getPrinters() {
  const now = Date.now();
  
  // Usar cache se ainda válido
  if (now - lastCacheUpdate < CACHE_TTL && printerCache.length > 0) {
    return printerCache;
  }

  try {
    const [windowsPrinters, networkPrinters] = await Promise.all([
      detectWindowsPrinters(),
      scanNetworkPrinters(),
    ]);

    // Combinar e remover duplicatas
    const allPrinters = [...windowsPrinters];
    
    for (const netPrinter of networkPrinters) {
      const exists = allPrinters.some(p => p.ip === netPrinter.ip);
      if (!exists) {
        allPrinters.push(netPrinter);
      }
    }

    printerCache = allPrinters;
    lastCacheUpdate = now;
    
    console.log(`[Printer Service] ${allPrinters.length} impressoras detectadas`);
    return allPrinters;
  } catch (error) {
    console.error('[Printer Service] Erro ao detectar impressoras:', error);
    return printerCache; // Retornar cache antigo em caso de erro
  }
}

/**
 * Encontra impressora por ID
 */
async function findPrinter(printerId) {
  const printers = await getPrinters();
  return printers.find(p => p.id === printerId);
}

/**
 * Imprime página de teste
 */
async function printTestPage(printerId) {
  const printer = await findPrinter(printerId);
  
  if (!printer) {
    return { success: false, error: 'Impressora não encontrada' };
  }

  // Dados ESC/POS para teste
  const testData = [
    '\x1b\x40',           // Reset
    '\x1b\x61\x01',       // Centralizar
    '\x1b\x21\x30',       // Texto grande
    'TESTE DE IMPRESSAO',
    '\x1b\x21\x00',       // Texto normal
    '\n',
    '================================',
    '\n',
    'Briez Print Agent',
    `Versao: 1.0.0`,
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    '\n',
    `Impressora: ${printer.name}`,
    `Tipo: ${printer.type}`,
    printer.ip ? `IP: ${printer.ip}:${printer.port}` : '',
    '\n',
    '================================',
    '\x1b\x61\x01',       // Centralizar
    '\n',
    'Impressao OK!',
    '\n\n\n\n',
    '\x1d\x56\x00',       // Cortar papel
  ].filter(Boolean).join('\n');

  return await printEscPos(printerId, testData);
}

/**
 * Envia dados ESC/POS para impressora
 */
async function printEscPos(printerId, data) {
  const printer = await findPrinter(printerId);
  
  if (!printer) {
    return { success: false, error: 'Impressora não encontrada' };
  }

  try {
    if (printer.type === 'network' && printer.ip) {
      // Impressão via rede
      return await printToNetworkPrinter(printer.ip, printer.port || 9100, data);
    } else if (printer.portName) {
      // Impressão via Windows (RAW)
      return await printToWindowsPrinter(printer.name, data);
    } else {
      return { success: false, error: 'Tipo de impressora não suportado' };
    }
  } catch (error) {
    console.error('[Printer Service] Erro ao imprimir:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Imprime via rede TCP (porta 9100)
 */
function printToNetworkPrinter(ip, port, data) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(10000);
    
    socket.on('connect', () => {
      console.log(`[Printer Service] Conectado a ${ip}:${port}`);
      socket.write(data, 'binary', () => {
        socket.end();
        resolve({ success: true });
      });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, error: 'Timeout de conexão' });
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      resolve({ success: false, error: `Erro de conexão: ${err.message}` });
    });
    
    socket.connect(port, ip);
  });
}

/**
 * Imprime via Windows Print Spooler (RAW)
 */
function printToWindowsPrinter(printerName, data) {
  return new Promise((resolve) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // Criar arquivo temporário
    const tempFile = path.join(os.tmpdir(), `briez-print-${Date.now()}.raw`);
    
    fs.writeFile(tempFile, data, 'binary', (writeErr) => {
      if (writeErr) {
        resolve({ success: false, error: `Erro ao criar arquivo: ${writeErr.message}` });
        return;
      }
      
      // Usar comando PRINT do Windows
      const cmd = `print /d:"${printerName}" "${tempFile}"`;
      
      exec(cmd, (error) => {
        // Limpar arquivo temporário
        fs.unlink(tempFile, () => {});
        
        if (error) {
          // Tentar método alternativo com copy
          const altCmd = `copy /b "${tempFile}" "${printerName}"`;
          exec(altCmd, (altError) => {
            fs.unlink(tempFile, () => {});
            if (altError) {
              resolve({ success: false, error: `Erro ao imprimir: ${altError.message}` });
            } else {
              resolve({ success: true });
            }
          });
        } else {
          resolve({ success: true });
        }
      });
    });
  });
}

module.exports = {
  getPrinters,
  findPrinter,
  printTestPage,
  printEscPos,
};
