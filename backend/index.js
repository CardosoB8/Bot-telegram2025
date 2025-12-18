const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { setupBot } = require('./bot');
const { setupScheduler } = require('./scheduler');
const { Telegraf, Markup } = require('telegraf');
const { parseMessage } = require('./utils'); // Importando o novo arquivo

// ... resto do código permanece igual

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Carregar Configuração Inicial
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
let bot = setupBot(config);
setupScheduler(config, bot);

app.get('/config', (req, res) => res.json(config));

app.post('/config', (req, res) => {
    config = req.body;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    
    // Reiniciar Bot e Scheduler com nova config
    bot = setupBot(config);
    setupScheduler(config, bot);
    
    res.json({ success: true, message: "Configuração atualizada!" });
});

app.post('/send-test', async (req, res) => {
    const { target, message } = req.body;
    try {
        await bot.telegram.sendMessage(target, `🧪 TESTE: ${message}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('🚀 Painel rodando em http://localhost:3000'));