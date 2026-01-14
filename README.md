# Briez Print Agent

Agente de impressão automática para o sistema Briez. Roda em Windows e permite que o sistema web imprima diretamente em impressoras térmicas sem popups.

## 🚀 Funcionalidades

- **Servidor HTTP** na porta 3001 para comunicação com o sistema web
- **Detecção automática** de impressoras Windows (USB, Rede, Serial)
- **Scan de rede** para encontrar impressoras térmicas (porta 9100)
- **Comandos ESC/POS** para impressoras térmicas
- **Minimiza para bandeja** do sistema
- **Auto-start** com Windows (opcional)

## 📦 Instalação para Usuários

1. Baixe o instalador mais recente em [Releases](../../releases/latest)
2. Execute `briez-print-agent-setup.exe`
3. O aplicativo inicia automaticamente

## 🛠️ Desenvolvimento

### Pré-requisitos

- Node.js 18 ou superior
- Windows 10/11

### Configuração

```bash
# Instalar dependências
npm install

# Executar em modo desenvolvimento
npm run dev

# Build para produção
npm run build:win
```

### Estrutura do Projeto

```
briez-print-agent/
├── main.js              # Processo principal Electron
├── preload.js           # Bridge seguro para renderer
├── index.html           # Interface do usuário
├── server.js            # Servidor HTTP (porta 3001)
├── printer-service.js   # Comunicação com impressoras
├── assets/              # Ícones e recursos
└── .github/workflows/   # CI/CD para build automático
```

## 🔌 API REST

### `GET /status`
Retorna status do agente e lista de impressoras.

```json
{
  "connected": true,
  "version": "1.0.0",
  "computerName": "DESKTOP-ABC123",
  "printers": [...]
}
```

### `GET /printers`
Lista todas as impressoras detectadas.

```json
[
  {
    "id": "win-abc123",
    "name": "EPSON TM-T20",
    "type": "network",
    "ip": "192.168.1.100",
    "port": 9100,
    "status": "online"
  }
]
```

### `POST /print-test`
Imprime página de teste.

```json
{
  "printerId": "win-abc123"
}
```

### `POST /print`
Envia dados para impressão.

```json
{
  "printerId": "win-abc123",
  "data": "ESC/POS data here",
  "type": "escpos"
}
```

### `POST /print-order`
Imprime pedido formatado do Briez.

```json
{
  "printerId": "win-abc123",
  "order": {
    "numero": 123,
    "mesa": "05",
    "garcom": "João",
    "itens": [
      { "quantidade": 2, "nome": "X-Bacon", "observacoes": "Sem cebola" }
    ]
  }
}
```

## 🔒 Segurança

- O servidor aceita conexões apenas do localhost
- CORS configurado para aceitar requisições do navegador
- Não expõe dados sensíveis do sistema

## 📝 Criando Release

1. Atualize a versão em `package.json`
2. Crie uma tag: `git tag v1.0.0`
3. Push da tag: `git push origin v1.0.0`
4. O GitHub Actions irá buildar e criar a release automaticamente

## 🆘 Suporte

Em caso de problemas:

1. Verifique se o aplicativo está rodando (ícone na bandeja)
2. Verifique se a porta 3001 não está bloqueada pelo firewall
3. Teste o endpoint `http://localhost:3001/status` no navegador

## 📄 Licença

MIT © Briez
