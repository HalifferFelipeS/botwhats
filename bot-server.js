// Bot Diário de Gastos WhatsApp
// Integração com Whapi.Cloud + Reconhecimento de Áudio

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.WHAPI_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'vBdc22pkrVBRNrsMHEdn43Zq3McmrcZ4';

// Arquivo de dados local (JSON)
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Função para carregar dados
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }
  return { expenses: [], installments: {} };
}

// Função para salvar dados
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
  }
}

// Categorias disponíveis
const CATEGORIES = [
  'combustível',
  'comida',
  'entretenimento',
  'transporte',
  'saúde',
  'shopping',
  'contas',
  'educação',
  'outros'
];

// Palavras-chave para categorização automática
const CATEGORY_KEYWORDS = {
  'combustível': ['gasolina', 'diesel', 'etanol', 'posto', 'abastec', 'combustivel'],
  'comida': ['comida', 'almoço', 'café', 'pizza', 'hambur', 'restaurante', 'lanche', 'sorvete', 'sushi', 'refeição', 'prato', 'sanduíche'],
  'entretenimento': ['cinema', 'show', 'jogo', 'filme', 'diversão', 'hobby', 'presente', 'livro', 'música', 'streaming'],
  'transporte': ['uber', 'taxi', 'passagem', 'ônibus', 'metrô', 'estacionamento', 'moto'],
  'saúde': ['farmácia', 'médico', 'hospital', 'consulta', 'remédio', 'medicamento', 'saúde', 'academia', 'gym'],
  'shopping': ['roupa', 'calçado', 'sapato', 'camiseta', 'calça', 'vestido', 'moda', 'loja', 'compra', 'produto'],
  'contas': ['energia', 'água', 'internet', 'telefone', 'conta', 'boleto', 'aluguel', 'condomínio'],
  'educação': ['curso', 'aula', 'escola', 'universidade', 'educação', 'material', 'livro', 'apostila']
};

// Função para detectar categoria automaticamente
function detectCategory(text) {
  const lowerText = text.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return category.charAt(0).toUpperCase() + category.slice(1);
      }
    }
  }
  
  return 'Outros';
}

// Função para extrair valor de uma mensagem
function extractAmount(text) {
  const patterns = [
    /r?\$?\s*(\d+[.,]\d{2})/i,
    /(\d+[.,]\d{2})\s*reais?/i,
    /(\d+)\s*reais?/i,
    /(\d+[.,]\d{2})/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }
  
  return null;
}

// Função para formatar resposta
function formatCurrency(value) {
  return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

// Função para gerar relatório
function generateReport(data, userId, period = 'current') {
  const userExpenses = data.expenses.filter(e => e.userId === userId);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  let filteredExpenses = userExpenses;
  
  if (period === 'current') {
    filteredExpenses = userExpenses.filter(e => e.date.startsWith(currentMonth));
  }
  
  if (filteredExpenses.length === 0) {
    return 'Nenhum gasto registrado para este período.';
  }
  
  // Agrupar por categoria
  const byCategory = {};
  let total = 0;
  
  filteredExpenses.forEach(exp => {
    byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
    total += exp.amount;
  });
  
  // Montar relatório
  let report = '*📊 RELATÓRIO DE GASTOS*\n\n';
  
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, amount]) => {
      const percentage = ((amount / total) * 100).toFixed(1);
      report += `• *${cat}*: ${formatCurrency(amount)} (${percentage}%)\n`;
    });
  
  report += `\n*Total: ${formatCurrency(total)}*`;
  
  return report;
}

// Função para lidar com mensagens de texto/áudio
async function handleMessage(message, senderNumber, data) {
  let text = message.body || '';
  let response = '';
  
  // Se for áudio, transcrever (simulado por enquanto)
  if (message.type === 'audio') {
    text = '[Áudio - será implementado com Google Speech-to-Text]';
  }
  
  // Comandos especiais
  if (text.toLowerCase().startsWith('/relatorio')) {
    response = generateReport(data, senderNumber, 'current');
  } 
  else if (text.toLowerCase().startsWith('/limpar')) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    data.expenses = data.expenses.filter(e => 
      e.userId !== senderNumber || !e.date.startsWith(currentMonth)
    );
    saveData(data);
    response = '✅ Gastos do mês foram limpos! (Parcelas não foram afetadas)';
  }
  else if (text.toLowerCase().startsWith('/parcelas')) {
    const userInstallments = data.installments[senderNumber] || {};
    if (Object.keys(userInstallments).length === 0) {
      response = 'Você não tem parcelas ativas.';
    } else {
      response = '*💳 PARCELAS ATIVAS*\n\n';
      Object.entries(userInstallments).forEach(([id, inst]) => {
        const remaining = inst.count - inst.paidCount;
        response += `• ${inst.description}\n  Total: ${formatCurrency(inst.totalAmount)}\n  Restam: ${remaining}x de ${formatCurrency(inst.monthlyAmount)}\n\n`;
      });
    }
  }
  else if (text.toLowerCase().startsWith('/total')) {
    const userExpenses = data.expenses.filter(e => e.userId === senderNumber);
    const total = userExpenses.reduce((sum, e) => sum + e.amount, 0);
    response = `*💰 GASTOS TOTAIS*\nTotal geral: ${formatCurrency(total)}`;
  }
  else if (text.toLowerCase().startsWith('/ajuda')) {
    response = `*🤖 COMANDOS DISPONÍVEIS*\n\n` +
      `/relatorio - Relatório do mês atual\n` +
      `/total - Gastos totais\n` +
      `/parcelas - Parcelas ativas\n` +
      `/limpar - Limpar gastos do mês\n` +
      `/ajuda - Esta mensagem\n\n` +
      `*Exemplos de gastos:*\n` +
      `• "Gasolina: 50 reais"\n` +
      `• "Almoço: 45,50"\n` +
      `• "Presente para mãe: 120"\n` +
      `• "Parcela produto: 89,90 x 12"`;
  }
  else if (text.trim()) {
    // Registrar novo gasto
    const amount = extractAmount(text);
    
    if (amount && amount > 0) {
      const category = detectCategory(text);
      const expense = {
        id: Date.now(),
        userId: senderNumber,
        description: text.replace(/\d+[.,]\d{2}|r?\$|\d+\s*reais?/gi, '').trim(),
        amount: amount,
        category: category,
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      };
      
      data.expenses.push(expense);
      saveData(data);
      
      response = `✅ *Gasto registrado!*\n\n` +
        `Descrição: ${expense.description}\n` +
        `Categoria: *${category}*\n` +
        `Valor: *${formatCurrency(amount)}*\n` +
        `Data: ${new Date(expense.date).toLocaleDateString('pt-BR')}\n\n` +
        `_Use /relatorio para ver seu resumo do mês_`;
    } else {
      response = `❌ Não consegui identificar o valor.\n\n` +
        `Tente novamente com o formato:\n` +
        `• "Gasolina: 50"\n` +
        `• "Almoço: 45,50"\n\n` +
        `Use /ajuda para mais comandos.`;
    }
  }
  
  return response;
}

// Webhook para receber mensagens
app.post('/webhook', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || messages.length === 0) {
      return res.sendStatus(200);
    }
    
    const data = loadData();
    
    for (const message of messages) {
      if (message.type !== 'text' && message.type !== 'audio') continue;
      
      const senderNumber = message.from_me ? message.to : message.from;
      const response = await handleMessage(message, senderNumber, data);
      
      if (response) {
        // Enviar resposta
        await sendMessage(senderNumber, response);
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Função para enviar mensagem
async function sendMessage(phoneNumber, message) {
  try {
    await axios.post('https://api.whapi.cloud/messages/text', {
      to: phoneNumber,
      body: message
    }, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error.response?.data || error.message);
  }
}

// Rota para verificação de webhook
app.get('/webhook', (req, res) => {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (token === WEBHOOK_SECRET) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Rota para status da API
app.get('/api/status', (req, res) => {
  const data = loadData();
  res.json({
    status: 'online',
    totalExpenses: data.expenses.length,
    totalInstallments: Object.keys(data.installments).length
  });
});

// Rota para obter dados do usuário
app.get('/api/data/:userId', (req, res) => {
  const data = loadData();
  const userExpenses = data.expenses.filter(e => e.userId === req.params.userId);
  const userInstallments = data.installments[req.params.userId] || {};
  
  res.json({
    expenses: userExpenses,
    installments: userInstallments
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🤖 Bot de Gastos rodando na porta ${PORT}`);
  console.log(`📱 Webhook disponível em /webhook`);
  console.log(`📊 Dashboard em http://localhost:${PORT}`);
});
