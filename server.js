const express = require('express');
const cors = require('cors');
const os = require('os');
const { getPrinters, printTestPage, printEscPos } = require('./printer-service');

const app = express();
const PORT = 3001;
const VERSION = '1.0.0';

let server = null;
let isRunning = false;

// Middleware
app.use(cors({
  origin: '*', // Aceitar de qualquer origem (navegador local)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

// ============ ENDPOINTS ============

/**
 * GET /status
 * Retorna status do agente e lista de impressoras
 */
app.get('/status', async (req, res) => {
  try {
    const printers = await getPrinters();
    
    res.json({
      connected: true,
      version: VERSION,
      computerName: os.hostname(),
      printers: printers,
      uptime: process.uptime(),
      platform: process.platform,
    });
  } catch (error) {
    console.error('Erro ao obter status:', error);
    res.status(500).json({ error: 'Erro ao obter status' });
  }
});

/**
 * GET /printers
 * Lista todas as impressoras detectadas
 */
app.get('/printers', async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json(printers);
  } catch (error) {
    console.error('Erro ao listar impressoras:', error);
    res.status(500).json({ error: 'Erro ao listar impressoras' });
  }
});

/**
 * POST /print-test
 * Imprime uma página de teste na impressora especificada
 * Body: { printerId: string }
 */
app.post('/print-test', async (req, res) => {
  try {
    const { printerId } = req.body;
    
    if (!printerId) {
      return res.status(400).json({ error: 'printerId é obrigatório' });
    }

    const result = await printTestPage(printerId);
    
    if (result.success) {
      res.json({ success: true, message: 'Página de teste impressa com sucesso' });
    } else {
      res.status(500).json({ success: false, message: result.error });
    }
  } catch (error) {
    console.error('Erro ao imprimir teste:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /print
 * Envia dados para impressão
 * Body: { printerId: string, data: string, type: 'escpos' | 'text' }
 */
app.post('/print', async (req, res) => {
  try {
    const { printerId, data, type = 'escpos' } = req.body;
    
    if (!printerId || !data) {
      return res.status(400).json({ error: 'printerId e data são obrigatórios' });
    }

    let result;
    
    if (type === 'escpos') {
      result = await printEscPos(printerId, data);
    } else {
      // Impressão de texto simples
      result = await printEscPos(printerId, data);
    }
    
    if (result.success) {
      res.json({ success: true, message: 'Impressão enviada com sucesso' });
    } else {
      res.status(500).json({ success: false, message: result.error });
    }
  } catch (error) {
    console.error('Erro ao imprimir:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /print-order
 * Endpoint especializado para imprimir pedidos do Briez
 * Body: { printerId: string, order: OrderData }
 */
app.post('/print-order', async (req, res) => {
  try {
    const { printerId, order } = req.body;
    
    if (!printerId || !order) {
      return res.status(400).json({ error: 'printerId e order são obrigatórios' });
    }

    // Formatar pedido como ESC/POS
    const escposData = formatOrderToEscPos(order);
    const result = await printEscPos(printerId, escposData);
    
    if (result.success) {
      res.json({ success: true, message: 'Pedido impresso com sucesso' });
    } else {
      res.status(500).json({ success: false, message: result.error });
    }
  } catch (error) {
    console.error('Erro ao imprimir pedido:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /health
 * Health check simples
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ FORMATAÇÃO DE PEDIDOS ============

function formatOrderToEscPos(order) {
  const lines = [];
  
  // Cabeçalho
  lines.push('\x1b\x40'); // Reset
  lines.push('\x1b\x61\x01'); // Centralizar
  lines.push('\x1b\x21\x30'); // Texto grande
  
  if (order.mesa) {
    lines.push(`MESA ${order.mesa}`);
  } else if (order.balcao) {
    lines.push(`BALCAO ${order.balcao}`);
  }
  
  lines.push('\x1b\x21\x00'); // Texto normal
  lines.push('\x1b\x61\x00'); // Alinhar esquerda
  lines.push('================================');
  
  // Pedido
  lines.push(`Pedido: #${order.numero || order.id?.slice(0, 8)}`);
  lines.push(`Data: ${new Date().toLocaleString('pt-BR')}`);
  
  if (order.garcom) {
    lines.push(`Garcom: ${order.garcom}`);
  }
  
  lines.push('--------------------------------');
  
  // Itens
  if (order.itens && order.itens.length > 0) {
    for (const item of order.itens) {
      lines.push(`${item.quantidade}x ${item.nome}`);
      if (item.observacoes) {
        lines.push(`   OBS: ${item.observacoes}`);
      }
    }
  }
  
  lines.push('--------------------------------');
  
  // Observações gerais
  if (order.observacoes) {
    lines.push(`OBS: ${order.observacoes}`);
    lines.push('--------------------------------');
  }
  
  // Rodapé
  lines.push('\x1b\x61\x01'); // Centralizar
  lines.push('BRIEZ - Sistema de Gestao');
  lines.push('\x1b\x61\x00'); // Alinhar esquerda
  
  // Cortar papel
  lines.push('\n\n\n\n');
  lines.push('\x1d\x56\x00'); // Corte total
  
  return lines.join('\n');
}

// ============ CONTROLE DO SERVIDOR ============

async function startServer() {
  return new Promise((resolve, reject) => {
    try {
      server = app.listen(PORT, '0.0.0.0', () => {
        isRunning = true;
        console.log(`[Briez Print Agent] Servidor rodando na porta ${PORT}`);
        console.log(`[Briez Print Agent] Versão: ${VERSION}`);
        console.log(`[Briez Print Agent] Computador: ${os.hostname()}`);
        resolve();
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[Briez Print Agent] Porta ${PORT} já está em uso`);
          // Tentar porta alternativa
          server = app.listen(3002, '0.0.0.0', () => {
            isRunning = true;
            console.log(`[Briez Print Agent] Servidor rodando na porta alternativa 3002`);
            resolve();
          });
        } else {
          reject(err);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function stopServer() {
  if (server) {
    server.close();
    isRunning = false;
    console.log('[Briez Print Agent] Servidor parado');
  }
}

function getServerStatus() {
  return {
    running: isRunning,
    port: PORT,
    version: VERSION,
  };
}

module.exports = { startServer, stopServer, getServerStatus };
