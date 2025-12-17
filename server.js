// ============================================
// BOT PLATFORM WEBHOOK - Sistema Completo
// ============================================

require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Banco de dados em memória
const botsDB = new Map();
const botInstances = new Map();

// ==================== SISTEMA WEBHOOK ====================

async function setupWebhook(botToken, botId) {
    try {
        const webhookUrl = `${BASE_URL}/webhook/${botId}`;
        console.log(`🔗 Configurando webhook para ${botId}`);
        
        const response = await axios.post(
            `https://api.telegram.org/bot${botToken}/setWebhook`,
            { url: webhookUrl }
        );
        
        return response.data.ok;
    } catch (error) {
        console.error('❌ Erro no webhook:', error.message);
        return false;
    }
}

async function removeWebhook(botToken) {
    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
        return true;
    } catch (error) {
        console.error('Erro ao remover webhook:', error.message);
        return false;
    }
}

// ==================== INTERPRETADOR JSON ====================

class BotInterpreter {
    static validate(config) {
        const errors = [];
        const warnings = [];

        if (!config.bot?.token) errors.push('Token do bot é obrigatório');
        if (!config.bot?.name) warnings.push('Nome do bot não especificado');

        if (config.commands) {
            Object.entries(config.commands).forEach(([cmd, data]) => {
                if (!data.message && !data.text && !data.image) {
                    warnings.push(`Comando "${cmd}" sem conteúdo`);
                }
            });
        }

        return { errors, warnings };
    }

    static createBot(config, botId) {
        const bot = new Telegraf(config.bot.token);
        const tasks = [];

        // Configurar comandos
        if (config.commands) {
            Object.entries(config.commands).forEach(([command, data]) => {
                const cmdName = command.startsWith('/') ? command.slice(1) : command;
                
                bot.command(cmdName, async (ctx) => {
                    try {
                        let message = data.message || data.text || '';
                        message = message
                            .replace(/{user_name}/g, ctx.from.first_name)
                            .replace(/{bot_name}/g, config.bot.name);

                        const options = { parse_mode: 'HTML' };

                        if (data.buttons) {
                            options.reply_markup = {
                                inline_keyboard: data.buttons.map(btn => [{
                                    text: btn.text || "🔗",
                                    url: btn.url,
                                    callback_data: btn.callback
                                }])
                            };
                        }

                        if (data.image) {
                            await ctx.replyWithPhoto(data.image, {
                                caption: message,
                                ...options
                            });
                        } else {
                            await ctx.reply(message, options);
                        }
                    } catch (error) {
                        console.error(`Erro no comando ${command}:`, error.message);
                    }
                });
            });
        }

        // Configurar agendamentos
        if (config.schedule) {
            config.schedule.forEach(post => {
                if (!post.time || !post.message) return;

                const [hours, minutes] = post.time.split(':');
                const cronTime = `${minutes} ${hours} * * *`;

                if (cron.validate(cronTime)) {
                    const task = cron.schedule(cronTime, async () => {
                        try {
                            const target = post.channel;
                            if (!target) return;

                            const options = { parse_mode: 'HTML' };

                            if (post.buttons) {
                                options.reply_markup = {
                                    inline_keyboard: post.buttons.map(btn => [{
                                        text: btn.text || "🔗",
                                        url: btn.url
                                    }])
                                };
                            }

                            if (post.image) {
                                await bot.telegram.sendPhoto(target, post.image, {
                                    caption: post.message,
                                    ...options
                                });
                            } else {
                                await bot.telegram.sendMessage(target, post.message, options);
                            }
                        } catch (error) {
                            console.error('Erro no post agendado:', error.message);
                        }
                    });

                    tasks.push(task);
                }
            });
        }

        // Configurar bot Aviator
        if (config.type === 'aviator') {
            tasks.push(...this.setupAviatorBot(bot, config.aviator_config));
        }

        return { bot, tasks };
    }

    static setupAviatorBot(bot, config) {
        const tasks = [];
        if (!config) return tasks;

        let currentLinkIndex = 0;
        let counters = { purple: 0, pink: 0 };

        const sendSignal = async () => {
            try {
                const links = config.links || [];
                const brands = config.brands || {};
                const channel = config.channel || '@sinaisaviatormoza';
                const image = config.image || 'https://imgur.com/a/uYNMXKF';

                const currentLink = links[currentLinkIndex];
                const currentBrand = brands[currentLink] || `Casa ${currentLinkIndex + 1}`;

                // Gerar sinal
                const isPurple = Math.random() * 100 < 75;
                const signalType = isPurple ? 'purple' : 'pink';
                counters[signalType]++;

                const targetMin = isPurple ? 2 : 10;
                const targetMax = isPurple ? 6 : 20;
                const target = Math.floor(Math.random() * (targetMax - targetMin + 1)) + targetMin;

                // Mensagem do sinal
                const signalMessage = `🚀 <b>ENTRADA CONFIRMADA</b> 🚀\n\n📱 <b>Site:</b> ${currentBrand}\n💰 <b>Sair até:</b> ${target}X\n\n🔄 Realize até 2 proteções.`;

                // Enviar sinal
                await bot.telegram.sendPhoto(channel, image, {
                    caption: signalMessage,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "🎮 JOGUE AQUI!", url: currentLink }
                        ]]
                    }
                });

                // Aguardar
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Enviar análise
                const analysisMessage = `📊 <b>ANÁLISE</b>\n━━━━━━━━━━━━━━━━━━\n🟣: ${counters.purple} | 🌹: ${counters.pink}\n━━━━━━━━━━━━━━━━━━\nBateu meta? Partilha!`;
                
                await bot.telegram.sendMessage(channel, analysisMessage, {
                    parse_mode: 'HTML'
                });

                // Rotacionar link
                currentLinkIndex = (currentLinkIndex + 1) % links.length;

            } catch (error) {
                console.error('Erro no bot Aviator:', error.message);
            }
        };

        const interval = config.interval || 180;
        const task = setInterval(sendSignal, interval * 1000);
        tasks.push({ stop: () => clearInterval(task) });

        // Iniciar após 5 segundos
        setTimeout(sendSignal, 5000);

        return tasks;
    }
}

// ==================== API ENDPOINTS ====================

// Criar bot
app.post('/api/bots', async (req, res) => {
    try {
        const config = req.body;
        const botId = `bot_${Date.now()}_${uuidv4().split('-')[0]}`;

        // Validar
        const validation = BotInterpreter.validate(config);
        if (validation.errors.length > 0) {
            return res.status(400).json({
                success: false,
                errors: validation.errors
            });
        }

        // Criar bot
        const { bot, tasks } = BotInterpreter.createBot(config, botId);

        // Configurar webhook
        const webhookOk = await setupWebhook(config.bot.token, botId);
        if (!webhookOk) {
            return res.status(500).json({
                success: false,
                error: 'Falha no webhook'
            });
        }

        // Iniciar bot
        bot.launch({
            webhook: {
                domain: BASE_URL.replace('http://', '').replace('https://', ''),
                port: PORT,
                path: `/webhook/${botId}`
            }
        }).catch(console.error);

        // Salvar
        botsDB.set(botId, {
            id: botId,
            name: config.bot.name,
            token: config.bot.token,
            config: config,
            type: config.type || 'simple',
            status: 'running',
            tasks: tasks,
            created: new Date()
        });

        botInstances.set(botId, bot);

        res.json({
            success: true,
            botId: botId,
            name: config.bot.name,
            type: config.type || 'simple',
            message: '✅ Bot criado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao criar bot:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Listar bots
app.get('/api/bots', (req, res) => {
    const bots = Array.from(botsDB.values()).map(bot => ({
        id: bot.id,
        name: bot.name,
        type: bot.type,
        status: bot.status,
        created: bot.created,
        commands: Object.keys(bot.config.commands || {}).length,
        scheduled: (bot.config.schedule || []).length
    }));

    res.json({
        success: true,
        count: bots.length,
        bots: bots
    });
});

// Controlar bot
app.post('/api/bots/:id/control', async (req, res) => {
    try {
        const botId = req.params.id;
        const { action } = req.body;

        const botData = botsDB.get(botId);
        if (!botData) {
            return res.status(404).json({ error: 'Bot não encontrado' });
        }

        const bot = botInstances.get(botId);

        if (action === 'stop') {
            if (bot) bot.stop();
            botData.tasks.forEach(task => task.stop());
            botData.status = 'stopped';
        } else if (action === 'start') {
            if (!bot) {
                const { bot: newBot, tasks } = BotInterpreter.createBot(botData.config, botId);
                newBot.launch({
                    webhook: {
                        domain: BASE_URL.replace('http://', '').replace('https://', ''),
                        port: PORT,
                        path: `/webhook/${botId}`
                    }
                }).catch(console.error);
                botInstances.set(botId, newBot);
                botData.tasks = tasks;
            }
            botData.status = 'running';
        }

        botsDB.set(botId, botData);

        res.json({
            success: true,
            action: action,
            status: botData.status
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remover bot
app.delete('/api/bots/:id', async (req, res) => {
    try {
        const botId = req.params.id;
        const botData = botsDB.get(botId);

        if (botData) {
            // Parar bot
            const bot = botInstances.get(botId);
            if (bot) bot.stop();
            
            // Parar tarefas
            botData.tasks.forEach(task => task.stop());
            
            // Remover webhook
            await removeWebhook(botData.token);
            
            // Remover do banco
            botsDB.delete(botId);
            botInstances.delete(botId);
        }

        res.json({ success: true, message: 'Bot removido' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint de webhook
app.post('/webhook/:botId', async (req, res) => {
    const botId = req.params.botId;
    const bot = botInstances.get(botId);

    if (bot) {
        try {
            await bot.handleUpdate(req.body);
        } catch (error) {
            console.error('Erro no webhook:', error.message);
        }
    }

    res.sendStatus(200);
});

// Validar JSON
app.post('/api/validate', (req, res) => {
    try {
        const config = req.body;
        const validation = BotInterpreter.validate(config);

        res.json({
            success: validation.errors.length === 0,
            errors: validation.errors,
            warnings: validation.warnings,
            stats: {
                commands: Object.keys(config.commands || {}).length,
                schedule: (config.schedule || []).length,
                type: config.type || 'simple'
            }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: 'JSON inválido'
        });
    }
});

// Favicon (resolve erro 404)
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.get('/favicon.png', (req, res) => {
    res.status(204).end();
});

// ==================== INTERFACE WEB ====================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🤖 Bot Platform Webhook</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                :root {
                    --primary: #4361ee;
                    --secondary: #3a0ca3;
                }
                
                body {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    font-family: 'Segoe UI', sans-serif;
                }
                
                .card {
                    border-radius: 15px;
                    border: none;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    border: none;
                    padding: 10px 20px;
                    border-radius: 10px;
                    font-weight: 600;
                }
                
                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 20px rgba(67, 97, 238, 0.3);
                }
                
                .bot-card {
                    transition: all 0.3s;
                    border-left: 5px solid var(--primary);
                }
                
                .bot-card:hover {
                    transform: translateY(-5px);
                }
                
                .status-running {
                    border-left-color: #2ecc71 !important;
                }
                
                .status-stopped {
                    border-left-color: #e74c3c !important;
                }
                
                .stats-card {
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    color: white;
                    border-radius: 15px;
                    padding: 20px;
                }
                
                #json-editor {
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container py-4">
                <!-- Header -->
                <div class="row mb-4">
                    <div class="col-12">
                        <h1 class="text-white mb-0">
                            <i class="fas fa-robot me-2"></i>Bot Platform
                            <small class="h6 text-light ms-2">Webhook Edition</small>
                        </h1>
                        <p class="text-white-50">Sistema completo para criação e gerenciamento de bots Telegram</p>
                    </div>
                </div>
                
                <!-- Stats -->
                <div class="row mb-4">
                    <div class="col-md-3 mb-3">
                        <div class="stats-card">
                            <div class="d-flex align-items-center">
                                <div>
                                    <h6 class="opacity-75">Total Bots</h6>
                                    <h2 class="mb-0" id="total-bots">0</h2>
                                </div>
                                <i class="fas fa-robot fa-3x ms-auto opacity-50"></i>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="stats-card">
                            <div class="d-flex align-items-center">
                                <div>
                                    <h6 class="opacity-75">Ativos</h6>
                                    <h2 class="mb-0" id="active-bots">0</h2>
                                </div>
                                <i class="fas fa-play-circle fa-3x ms-auto opacity-50"></i>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="stats-card">
                            <div class="d-flex align-items-center">
                                <div>
                                    <h6 class="opacity-75">Comandos</h6>
                                    <h2 class="mb-0" id="total-commands">0</h2>
                                </div>
                                <i class="fas fa-terminal fa-3x ms-auto opacity-50"></i>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="stats-card">
                            <div class="d-flex align-items-center">
                                <div>
                                    <h6 class="opacity-75">Agendados</h6>
                                    <h2 class="mb-0" id="total-scheduled">0</h2>
                                </div>
                                <i class="fas fa-clock fa-3x ms-auto opacity-50"></i>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Main Content -->
                <div class="row">
                    <div class="col-md-4">
                        <!-- Create Bot Panel -->
                        <div class="card mb-4">
                            <div class="card-header bg-white">
                                <h5 class="mb-0"><i class="fas fa-plus-circle me-2"></i>Criar Novo Bot</h5>
                            </div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">Nome do Bot</label>
                                    <input type="text" class="form-control" id="bot-name" placeholder="Meu Bot">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Token do Bot</label>
                                    <input type="text" class="form-control" id="bot-token" placeholder="1234567890:ABC...">
                                    <div class="form-text">
                                        <a href="https://t.me/BotFather" target="_blank" class="text-decoration-none">
                                            <i class="fas fa-external-link-alt me-1"></i>Obter no @BotFather
                                        </a>
                                    </div>
                                </div>
                                
                                <!-- Quick Templates -->
                                <div class="mb-3">
                                    <label class="form-label">Template Rápido</label>
                                    <select class="form-select" id="template-select" onchange="loadTemplate(this.value)">
                                        <option value="">Escolha um template</option>
                                        <option value="simple">🤖 Bot Simples</option>
                                        <option value="aviator">🚀 Bot Aviator</option>
                                        <option value="group">👥 Bot de Grupo</option>
                                    </select>
                                </div>
                                
                                <div class="d-grid gap-2">
                                    <button class="btn btn-primary" onclick="validateJSON()">
                                        <i class="fas fa-check me-2"></i>Validar JSON
                                    </button>
                                    <button class="btn btn-success" onclick="createBot()">
                                        <i class="fas fa-rocket me-2"></i>Criar Bot
                                    </button>
                                </div>
                                
                                <!-- Validation Result -->
                                <div id="validation-result" class="mt-3"></div>
                            </div>
                        </div>
                        
                        <!-- JSON Editor -->
                        <div class="card">
                            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                                <h5 class="mb-0"><i class="fas fa-code me-2"></i>Configuração JSON</h5>
                                <div>
                                    <button class="btn btn-sm btn-outline-primary me-1" onclick="formatJSON()">
                                        <i class="fas fa-align-left"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="clearJSON()">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="card-body p-0">
                                <textarea id="json-editor" class="form-control border-0" rows="15" style="resize: none;">
{
  "bot": {
    "name": "Meu Bot",
    "token": "SEU_TOKEN_AQUI"
  },
  "commands": {
    "start": {
      "message": "👋 Olá! Eu sou o {bot_name}",
      "buttons": [
        { "text": "🌐 Site", "url": "https://google.com" }
      ]
    }
  }
}</textarea>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Bots List -->
                    <div class="col-md-8">
                        <div class="card">
                            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                                <h5 class="mb-0"><i class="fas fa-list me-2"></i>Meus Bots</h5>
                                <button class="btn btn-sm btn-primary" onclick="loadBots()">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                            </div>
                            <div class="card-body">
                                <div id="bots-container" class="row">
                                    <!-- Bots serão carregados aqui -->
                                    <div class="col-12 text-center py-5">
                                        <div class="spinner-border text-primary" role="status">
                                            <span class="visually-hidden">Carregando...</span>
                                        </div>
                                        <p class="mt-3 text-muted">Carregando bots...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="row mt-4">
                    <div class="col-12">
                        <div class="text-center text-white-50">
                            <p class="mb-0">🤖 Bot Platform Webhook v3.0 • Sistema estável e funcional</p>
                            <small>Usa webhook para melhor performance</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Scripts -->
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                // Carregar bots ao iniciar
                document.addEventListener('DOMContentLoaded', loadBots);
                
                // Templates
                const templates = {
                    simple: {
                        name: "Bot Simples",
                        json: {
                            bot: {
                                name: "Bot Simples",
                                token: "SEU_TOKEN_AQUI",
                                channel: "@meucanal"
                            },
                            commands: {
                                start: {
                                    message: "👋 Olá {user_name}! Eu sou o {bot_name}\\n\\nComo posso ajudar?",
                                    buttons: [
                                        { text: "🌐 Site Oficial", url: "https://google.com" },
                                        { text: "📞 Contato", callback: "contato" }
                                    ]
                                },
                                ajuda: {
                                    message: "🤖 **COMANDOS DISPONÍVEIS:**\\n\\n• /start - Iniciar bot\\n• /ajuda - Esta mensagem\\n• Use os botões para navegar!"
                                }
                            },
                            schedule: [
                                {
                                    time: "09:00",
                                    message: "☀️ **Bom dia!** Hora de começar o dia com energia! 🚀",
                                    channel: "@meucanal"
                                }
                            ]
                        }
                    },
                    
                    aviator: {
                        name: "Bot Aviator",
                        json: {
                            bot: {
                                name: "Sinais Aviator",
                                token: "SEU_TOKEN_AQUI"
                            },
                            type: "aviator",
                            aviator_config: {
                                channel: "@sinaisaviatormoza",
                                image: "https://imgur.com/a/uYNMXKF",
                                links: [
                                    "https://media1.placard.co.mz/redirect.aspx?pid=5905&bid=1690",
                                    "https://record.elephantbet.com/_rhoOOvBxBOAWqcfzuvZcQGNd7ZgqdRLk/1/",
                                    "https://tracking.olabet.co.mz/C.ashx?btag=a_969b_12c_&affid=941&siteid=969&adid=12&c=",
                                    "https://affiliates.bantubet.co.mz/links/?btag=2307928"
                                ],
                                brands: {
                                    "https://media1.placard.co.mz/redirect.aspx?pid=5905&bid=1690": "Placard",
                                    "https://record.elephantbet.com/_rhoOOvBxBOAWqcfzuvZcQGNd7ZgqdRLk/1/": "Elephantbet",
                                    "https://tracking.olabet.co.mz/C.ashx?btag=a_969b_12c_&affid=941&siteid=969&adid=12&c=": "Olabet",
                                    "https://affiliates.bantubet.co.mz/links/?btag=2307928": "Bantubet"
                                },
                                interval: 180
                            }
                        }
                    },
                    
                    group: {
                        name: "Bot de Grupo",
                        json: {
                            bot: {
                                name: "Moderador de Grupo",
                                token: "SEU_TOKEN_AQUI",
                                admins: ["@admin1", "@admin2"]
                            },
                            commands: {
                                regras: {
                                    message: "📜 **REGRAS DO GRUPO:**\\n\\n1. Respeite todos\\n2. Sem spam\\n3. Mantenha o tema\\n4. Sem conteúdo impróprio",
                                    only_admins: false
                                }
                            },
                            auto_responses: {
                                "bom dia": "Bom dia! ☀️",
                                "boa tarde": "Boa tarde! 🌤️",
                                "obrigado": "De nada! 😊"
                            }
                        }
                    }
                };
                
                async function loadBots() {
                    try {
                        const response = await fetch('/api/bots');
                        const data = await response.json();
                        
                        if (data.success) {
                            updateStats(data);
                            renderBots(data.bots);
                        }
                    } catch (error) {
                        console.error('Erro ao carregar bots:', error);
                        showAlert('Erro ao carregar bots', 'danger');
                    }
                }
                
                function updateStats(data) {
                    document.getElementById('total-bots').textContent = data.count;
                    
                    const active = data.bots.filter(b => b.status === 'running').length;
                    const totalCommands = data.bots.reduce((sum, bot) => sum + bot.commands, 0);
                    const totalScheduled = data.bots.reduce((sum, bot) => sum + bot.scheduled, 0);
                    
                    document.getElementById('active-bots').textContent = active;
                    document.getElementById('total-commands').textContent = totalCommands;
                    document.getElementById('total-scheduled').textContent = totalScheduled;
                }
                
                function renderBots(bots) {
                    const container = document.getElementById('bots-container');
                    
                    if (bots.length === 0) {
                        container.innerHTML = \`
                            <div class="col-12 text-center py-5">
                                <i class="fas fa-robot fa-4x text-muted mb-3"></i>
                                <h4 class="text-muted">Nenhum bot criado</h4>
                                <p class="text-muted">Comece criando seu primeiro bot!</p>
                            </div>
                        \`;
                        return;
                    }
                    
                    container.innerHTML = bots.map(bot => \`
                        <div class="col-md-6 mb-3">
                            <div class="card bot-card \${bot.status === 'running' ? 'status-running' : 'status-stopped'}">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-3">
                                        <div>
                                            <h5 class="card-title mb-1">\${bot.name}</h5>
                                            <span class="badge bg-light text-dark">\${bot.type}</span>
                                        </div>
                                        <span class="badge \${bot.status === 'running' ? 'bg-success' : 'bg-danger'}">
                                            \${bot.status === 'running' ? '▶️ Online' : '⏸️ Pausado'}
                                        </span>
                                    </div>
                                    
                                    <p class="card-text text-muted small">
                                        <i class="fas fa-hashtag me-1"></i> ID: \${bot.id.substring(0, 10)}...
                                    </p>
                                    
                                    <div class="row mb-3">
                                        <div class="col-6 text-center">
                                            <div class="text-primary fw-bold">\${bot.commands}</div>
                                            <small class="text-muted">Comandos</small>
                                        </div>
                                        <div class="col-6 text-center">
                                            <div class="text-primary fw-bold">\${bot.scheduled}</div>
                                            <small class="text-muted">Agendados</small>
                                        </div>
                                    </div>
                                    
                                    <div class="d-grid gap-2">
                                        \${bot.status === 'running' ? 
                                            \`<button class="btn btn-outline-danger btn-sm" onclick="controlBot('\${bot.id}', 'stop')">
                                                <i class="fas fa-stop me-1"></i> Parar
                                            </button>\` :
                                            \`<button class="btn btn-outline-success btn-sm" onclick="controlBot('\${bot.id}', 'start')">
                                                <i class="fas fa-play me-1"></i> Iniciar
                                            </button>\`
                                        }
                                        <button class="btn btn-outline-secondary btn-sm" onclick="deleteBot('\${bot.id}')">
                                            <i class="fas fa-trash me-1"></i> Remover
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`).join('');
                }
                
                async function controlBot(botId, action) {
                    try {
                        const response = await fetch(\`/api/bots/\${botId}/control\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showAlert(\`Bot \${action === 'start' ? 'iniciado' : 'parado'} com sucesso!\`, 'success');
                            loadBots();
                        }
                    } catch (error) {
                        showAlert('Erro ao controlar bot', 'danger');
                    }
                }
                
                async function deleteBot(botId) {
                    if (!confirm('Remover este bot? Esta ação não pode ser desfeita.')) {
                        return;
                    }
                    
                    try {
                        const response = await fetch(\`/api/bots/\${botId}\`, { method: 'DELETE' });
                        const data = await response.json();
                        
                        if (data.success) {
                            showAlert('Bot removido com sucesso!', 'success');
                            loadBots();
                        }
                    } catch (error) {
                        showAlert('Erro ao remover bot', 'danger');
                    }
                }
                
                function loadTemplate(type) {
                    const template = templates[type];
                    if (!template) return;
                    
                    document.getElementById('bot-name').value = template.name;
                    document.getElementById('json-editor').value = JSON.stringify(template.json, null, 2);
                }
                
                function formatJSON() {
                    try {
                        const editor = document.getElementById('json-editor');
                        const json = JSON.parse(editor.value);
                        editor.value = JSON.stringify(json, null, 2);
                        showAlert('JSON formatado!', 'success');
                    } catch (error) {
                        showAlert('Erro ao formatar JSON', 'danger');
                    }
                }
                
                function clearJSON() {
                    document.getElementById('json-editor').value = '';
                    document.getElementById('bot-name').value = '';
                    document.getElementById('bot-token').value = '';
                }
                
                async function validateJSON() {
                    const jsonText = document.getElementById('json-editor').value;
                    
                    try {
                        const response = await fetch('/api/validate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: jsonText
                        });
                        
                        const result = await response.json();
                        const validationDiv = document.getElementById('validation-result');
                        
                        if (result.success) {
                            validationDiv.innerHTML = \`
                                <div class="alert alert-success">
                                    <i class="fas fa-check-circle me-2"></i>
                                    <strong>✅ JSON Válido!</strong>
                                    <div class="mt-2">
                                        <small>Tipo: \${result.stats.type}</small>
                                        <small class="ms-2">Comandos: \${result.stats.commands}</small>
                                        <small class="ms-2">Agendados: \${result.stats.schedule}</small>
                                    </div>
                                </div>
                            \`;
                        } else {
                            validationDiv.innerHTML = \`
                                <div class="alert alert-danger">
                                    <i class="fas fa-times-circle me-2"></i>
                                    <strong>❌ Erros encontrados:</strong>
                                    <ul class="mb-0 mt-2">
                                        \${result.errors.map(e => \`<li>\${e}</li>\`).join('')}
                                    </ul>
                                </div>
                            \`;
                        }
                        
                    } catch (error) {
                        document.getElementById('validation-result').innerHTML = \`
                            <div class="alert alert-danger">
                                <i class="fas fa-times-circle me-2"></i>
                                <strong>❌ JSON Inválido:</strong>
                                <p class="mb-0 mt-2">\${error.message}</p>
                            </div>
                        \`;
                    }
                }
                
                async function createBot() {
                    const name = document.getElementById('bot-name').value;
                    const token = document.getElementById('bot-token').value;
                    const jsonText = document.getElementById('json-editor').value;
                    
                    if (!token) {
                        showAlert('Insira o token do bot', 'warning');
                        return;
                    }
                    
                    try {
                        const config = JSON.parse(jsonText);
                        config.bot.name = name || config.bot.name;
                        config.bot.token = token;
                        
                        const response = await fetch('/api/bots', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(config)
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showAlert(\`✅ Bot criado! ID: \${data.botId.substring(0, 8)}...\`, 'success');
                            clearJSON();
                            loadBots();
                        } else {
                            showAlert('Erro: ' + data.error, 'danger');
                        }
                        
                    } catch (error) {
                        showAlert('Erro no JSON: ' + error.message, 'danger');
                    }
                }
                
                function showAlert(message, type) {
                    // Criar alerta temporário
                    const alert = document.createElement('div');
                    alert.className = \`alert alert-\${type} alert-dismissible fade show position-fixed\`;
                    alert.style.top = '20px';
                    alert.style.right = '20px';
                    alert.style.zIndex = '9999';
                    alert.style.minWidth = '300px';
                    alert.innerHTML = \`
                        \${message}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    \`;
                    
                    document.body.appendChild(alert);
                    
                    // Remover após 5 segundos
                    setTimeout(() => {
                        alert.remove();
                    }, 5000);
                }
            </script>
        </body>
        </html>
    `);
});

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║         🤖 BOT PLATFORM WEBHOOK          ║
║                                          ║
║  🌐 Servidor: http://localhost:${PORT}      ║
║  🔗 Base URL: ${BASE_URL}                ║
║  ⚡ Webhook ativado                      ║
║  🚀 Sistema pronto para uso!            ║
╚══════════════════════════════════════════╝
    `);
});