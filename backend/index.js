const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { initBot, updateBotConfig, sendTestMessage, restartBot } = require('./bot');
const { initScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Carregar configuração inicial
let config = {};
const CONFIG_FILE = path.join(__dirname, 'config.json');

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        config = JSON.parse(data);
        console.log('✅ Configuração carregada');
        return config;
    } catch (error) {
        console.error('❌ Erro ao carregar configuração:', error);
        return {};
    }
}

async function saveConfig(newConfig) {
    try {
        await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
        config = newConfig;
        console.log('✅ Configuração salva');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar configuração:', error);
        return false;
    }
}

// API Routes
app.get('/api/config', async (req, res) => {
    try {
        const currentConfig = await loadConfig();
        res.json(currentConfig);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar configuração' });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const newConfig = req.body;
        const saved = await saveConfig(newConfig);
        
        if (saved) {
            // Atualizar bot com nova configuração
            await updateBotConfig(newConfig);
            await initScheduler(newConfig);
            
            res.json({ 
                success: true, 
                message: 'Configuração salva e bot atualizado!' 
            });
        } else {
            res.status(500).json({ error: 'Erro ao salvar configuração' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/send-test', async (req, res) => {
    try {
        const { chatId, message } = req.body;
        const result = await sendTestMessage(chatId, message);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/restart-bot', async (req, res) => {
    try {
        await restartBot();
        res.json({ success: true, message: 'Bot reiniciado!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Inicializar servidor
async function startServer() {
    // Carregar configuração
    const initialConfig = await loadConfig();
    
    // Inicializar bot
    if (initialConfig.bot && initialConfig.bot.token) {
        await initBot(initialConfig);
        await initScheduler(initialConfig);
    } else {
        console.log('⚠️ Token do bot não configurado. Use o painel para configurar.');
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
        console.log(`📱 Painel disponível em http://localhost:${PORT}/index.html`);
    });
}

startServer();