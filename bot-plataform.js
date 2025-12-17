// ============================================
// BOT PLATFORM - Versão Corrigida e Simplificada
// ============================================

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

// ==================== CONFIGURAÇÃO ====================
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// Armazenamento em memória
const bots = new Map();
const botConfigs = new Map();

// ==================== CLASSE BOT SIMPLIFICADA ====================
class SimpleBot {
    constructor(config) {
        this.config = config;
        this.bot = null;
        this.tasks = [];
        this.isRunning = false;
        this.lastMessages = new Map(); // Para deletar comandos
    }

    async start() {
        try {
            console.log(`🤖 Iniciando bot: ${this.config.bot?.name || 'Sem nome'}`);
            
            if (!this.config.bot?.token) {
                throw new Error('Token do bot é obrigatório');
            }

            // Criar instância do bot
            this.bot = new TelegramBot(this.config.bot.token, { 
                polling: true
            });

            this.isRunning = true;
            
            // Configurar funcionalidades básicas
            this.setupBasicCommands();
            this.setupScheduledPosts();
            
            // Se for bot especial (aviator), configurar
            if (this.config.type === 'aviator_signals') {
                this.setupAviatorBot();
            }

            console.log(`✅ Bot "${this.config.bot.name}" iniciado!`);
            return true;

        } catch (error) {
            console.error(`❌ Erro ao iniciar bot:`, error.message);
            return false;
        }
    }

    setupBasicCommands() {
        if (!this.config.commands) return;

        // Comando /start
        if (this.config.commands.start) {
            this.bot.onText(/\/start/, async (msg) => {
                await this.sendCommandResponse('start', msg);
            });
        }

        // Comando /ajuda ou /help
        if (this.config.commands.help || this.config.commands.ajuda) {
            this.bot.onText(/\/(ajuda|help)/, async (msg) => {
                await this.sendCommandResponse('help', msg);
            });
        }

        // Comandos personalizados
        Object.keys(this.config.commands).forEach(cmd => {
            if (cmd !== 'start' && cmd !== 'help' && cmd !== 'ajuda') {
                const regex = new RegExp(`^\/${cmd}(?:@\\w+)?$`);
                this.bot.onText(regex, async (msg) => {
                    await this.sendCommandResponse(cmd, msg);
                });
            }
        });

        // Callbacks de botões
        this.bot.on('callback_query', async (query) => {
            await this.handleButtonClick(query);
        });
    }

    async sendCommandResponse(command, msg) {
        const chatId = msg.chat.id;
        const commandData = this.config.commands[command];
        
        if (!commandData) return;

        try {
            let message = commandData.message || commandData.text || '';
            message = this.replaceVariables(message, msg);

            const options = {
                parse_mode: 'HTML',
                disable_web_page_preview: commandData.disable_preview || false
            };

            // Adicionar teclado se houver botões
            if (commandData.buttons && commandData.buttons.length > 0) {
                options.reply_markup = this.createKeyboard(commandData.buttons);
            }

            if (commandData.image) {
                await this.bot.sendPhoto(chatId, commandData.image, {
                    caption: message,
                    ...options
                });
            } else {
                await this.bot.sendMessage(chatId, message, options);
            }

            // Apagar comando original após 1 segundo
            setTimeout(async () => {
                try {
                    await this.bot.deleteMessage(chatId, msg.message_id);
                } catch (e) {
                    // Ignora erros ao deletar
                }
            }, 1000);

        } catch (error) {
            console.error(`Erro no comando ${command}:`, error.message);
            try {
                await this.bot.sendMessage(chatId, "❌ Erro ao processar comando.");
            } catch (e) {
                // Não consegue enviar mensagem de erro
            }
        }
    }

    async handleButtonClick(query) {
        try {
            // Responder ao callback para remover o "relógio"
            await this.bot.answerCallbackQuery(query.id);
            
            const chatId = query.message.chat.id;
            const data = query.data;
            
            // Verificar se é um callback definido
            if (this.config.callbacks && this.config.callbacks[data]) {
                const callbackData = this.config.callbacks[data];
                await this.bot.sendMessage(chatId, callbackData.message, {
                    parse_mode: 'HTML',
                    reply_markup: this.createKeyboard(callbackData.buttons)
                });
            }
        } catch (error) {
            console.error('Erro no callback:', error.message);
        }
    }

    setupScheduledPosts() {
        if (!this.config.schedule) return;

        this.config.schedule.forEach((post, index) => {
            if (!post.time || !post.message) return;

            const [hours, minutes] = post.time.split(':');
            const cronTime = `${minutes} ${hours} * * *`;

            if (cron.validate(cronTime)) {
                const task = cron.schedule(cronTime, async () => {
                    console.log(`📅 Post agendado: ${post.time}`);
                    
                    try {
                        const target = post.channel || post.chat || this.config.bot?.channel;
                        if (!target) return;

                        const options = {
                            parse_mode: 'HTML'
                        };

                        if (post.buttons && post.buttons.length > 0) {
                            options.reply_markup = this.createKeyboard(post.buttons);
                        }

                        if (post.image) {
                            await this.bot.sendPhoto(target, post.image, {
                                caption: post.message,
                                ...options
                            });
                        } else {
                            await this.bot.sendMessage(target, post.message, options);
                        }
                    } catch (error) {
                        console.error('Erro no post agendado:', error.message);
                    }
                });

                this.tasks.push(task);
            }
        });
    }

    setupAviatorBot() {
        if (this.config.type !== 'aviator_signals') return;

        console.log('🚀 Configurando bot Aviator...');
        
        // Configurações do Aviator
        const config = this.config.aviator_config || {
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
            signals: {
                purple: { weight: 75, target_min: 2, target_max: 6 },
                pink: { weight: 25, target_min: 10, target_max: 20 }
            },
            intervals: {
                between_signals: 180, // 3 minutos
                between_cycles: 10    // 10 segundos
            }
        };

        let currentLink = config.links[0];
        let currentBrand = config.brands[currentLink];
        let counters = { purple: 0, pink: 0 };

        // Função para gerar sinal
        const generateSignal = () => {
            const weights = [config.signals.purple.weight, config.signals.pink.weight];
            const types = ['purple', 'pink'];
            
            const random = Math.random() * 100;
            const type = random < weights[0] ? 'purple' : 'pink';
            
            counters[type]++;
            const target = Math.floor(Math.random() * 
                (config.signals[type].target_max - config.signals[type].target_min + 1)) + 
                config.signals[type].target_min;
            
            return {
                type: type,
                target: target,
                message: `🚀 <b>ENTRADA CONFIRMADA</b> 🚀\n\n📱 <b>Site:</b> ${currentBrand}\n💰 <b>Sair até:</b> ${target}X\n\n🔄 Realize até 2 proteções.`
            };
        };

        // Função para gerar análise
        const generateAnalysis = () => {
            return `📊 <b>ANÁLISE</b>\n━━━━━━━━━━━━━━━━━━\n🟣: ${counters.purple} | 🌹: ${counters.pink}\n━━━━━━━━━━━━━━━━━━\nBateu meta? Partilha!`;
        };

        // Criar teclado
        const createKeyboard = (link) => {
            return {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "🎮 JOGUE AQUI!", url: link }
                    ]]
                }
            };
        };

        // Ciclo principal
        const startCycle = async () => {
            if (!this.isRunning) return;

            try {
                // Enviar sinal
                const signal = generateSignal();
                await this.bot.sendPhoto(config.channel, config.image, {
                    caption: signal.message,
                    parse_mode: 'HTML',
                    ...createKeyboard(currentLink)
                });

                // Pequena pausa
                await this.sleep(2000);

                // Enviar análise
                const analysis = generateAnalysis();
                await this.bot.sendMessage(config.channel, analysis, {
                    parse_mode: 'HTML'
                });

                // Trocar link periodicamente (a cada 4 sinais)
                if ((counters.purple + counters.pink) % 4 === 0) {
                    const newLink = config.links[Math.floor(Math.random() * config.links.length)];
                    currentLink = newLink;
                    currentBrand = config.brands[newLink];
                    
                    await this.sleep(1000);
                    await this.bot.sendMessage(config.channel, 
                        `🏠 <b>CASA ALTERADA!</b>\nNovo link: ${currentBrand}`, {
                        parse_mode: 'HTML',
                        ...createKeyboard(currentLink)
                    });
                }

                // Agendar próximo ciclo
                setTimeout(() => {
                    startCycle();
                }, config.intervals.between_signals * 1000);

            } catch (error) {
                console.error('Erro no ciclo Aviator:', error.message);
                
                // Tentar novamente após 30 segundos
                if (this.isRunning) {
                    setTimeout(() => {
                        startCycle();
                    }, 30000);
                }
            }
        };

        // Iniciar ciclo após 5 segundos
        setTimeout(() => {
            startCycle();
        }, 5000);
    }

    createKeyboard(buttons) {
        if (!buttons || !Array.isArray(buttons)) return {};

        const inlineKeyboard = buttons.map(row => {
            if (Array.isArray(row)) {
                return row.map(btn => {
                    if (btn.url) {
                        return { text: btn.text || "🔗", url: btn.url };
                    } else if (btn.callback) {
                        return { text: btn.text || "📌", callback_data: btn.callback };
                    }
                    return { text: btn.text || "❓" };
                }).filter(btn => btn);
            } else {
                const btn = row;
                if (btn.url) {
                    return [{ text: btn.text || "🔗", url: btn.url }];
                } else if (btn.callback) {
                    return [{ text: btn.text || "📌", callback_data: btn.callback }];
                }
                return [{ text: btn.text || "❓" }];
            }
        }).filter(row => row && row.length > 0);

        if (inlineKeyboard.length > 0) {
            return { reply_markup: { inline_keyboard: inlineKeyboard } };
        }

        return {};
    }

    replaceVariables(text, msg) {
        if (!text || !msg) return text;

        return text
            .replace(/{user_name}/g, msg.from?.first_name || 'Usuário')
            .replace(/{user_id}/g, msg.from?.id || '')
            .replace(/{chat_title}/g, msg.chat?.title || 'Chat')
            .replace(/{bot_name}/g, this.config.bot?.name || 'Bot')
            .replace(/{date}/g, new Date().toLocaleDateString('pt-BR'))
            .replace(/{time}/g, new Date().toLocaleTimeString('pt-BR'));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async stop() {
        console.log(`🛑 Parando bot...`);
        
        this.isRunning = false;
        
        // Parar tarefas agendadas
        this.tasks.forEach(task => task.stop());
        this.tasks = [];

        // Parar bot
        if (this.bot) {
            this.bot.stopPolling();
            this.bot = null;
        }

        console.log(`✅ Bot parado.`);
    }

    getStatus() {
        return {
            running: this.isRunning,
            name: this.config.bot?.name,
            type: this.config.type || 'simple',
            started: this.isRunning
        };
    }
}

// ==================== API ENDPOINTS ====================
app.post('/api/bots', async (req, res) => {
    try {
        const config = req.body;
        const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Validar token
        if (!config.bot?.token) {
            return res.status(400).json({
                success: false,
                error: 'Token do bot é obrigatório'
            });
        }

        // Criar e iniciar bot
        const bot = new SimpleBot(config);
        const started = await bot.start();

        if (!started) {
            return res.status(500).json({
                success: false,
                error: 'Falha ao iniciar bot'
            });
        }

        // Armazenar
        bots.set(botId, bot);
        botConfigs.set(botId, config);

        res.json({
            success: true,
            botId: botId,
            name: config.bot?.name || 'Bot',
            type: config.type || 'simple',
            message: 'Bot criado e iniciado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao criar bot:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/bots', (req, res) => {
    const botList = [];
    
    bots.forEach((bot, botId) => {
        const config = botConfigs.get(botId);
        const status = bot.getStatus();
        
        botList.push({
            id: botId,
            name: config?.bot?.name || 'Bot',
            type: config?.type || 'simple',
            running: status.running,
            channel: config?.bot?.channel || config?.aviator_config?.channel
        });
    });

    res.json({
        success: true,
        count: botList.length,
        bots: botList
    });
});

app.post('/api/bots/:id/control', async (req, res) => {
    try {
        const botId = req.params.id;
        const { action } = req.body;

        const bot = bots.get(botId);
        if (!bot) {
            return res.status(404).json({
                success: false,
                error: 'Bot não encontrado'
            });
        }

        if (action === 'stop') {
            await bot.stop();
        } else if (action === 'restart') {
            await bot.stop();
            const config = botConfigs.get(botId);
            const newBot = new SimpleBot(config);
            await newBot.start();
            bots.set(botId, newBot);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Ação inválida'
            });
        }

        res.json({
            success: true,
            action: action
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/bots/:id', async (req, res) => {
    try {
        const botId = req.params.id;
        const bot = bots.get(botId);

        if (bot) {
            await bot.stop();
            bots.delete(botId);
            botConfigs.delete(botId);
        }

        res.json({
            success: true,
            message: 'Bot removido'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/validate', (req, res) => {
    try {
        const config = req.body;
        
        const errors = [];
        const warnings = [];

        // Validações básicas
        if (!config.bot?.token) errors.push('Token é obrigatório');
        if (!config.bot?.name) warnings.push('Nome do bot não especificado');
        
        // Verificar comandos
        if (config.commands) {
            Object.entries(config.commands).forEach(([cmd, data]) => {
                if (!data.message && !data.text) {
                    warnings.push(`Comando ${cmd} sem mensagem`);
                }
            });
        }

        res.json({
            success: errors.length === 0,
            errors,
            warnings
        });

    } catch (error) {
        res.json({
            success: false,
            error: 'JSON inválido'
        });
    }
});

// ==================== INTERFACE WEB SIMPLIFICADA ====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bot Platform Simples</title>
            <style>
                body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
                .bot-card { border: 1px solid #ccc; padding: 15px; margin: 10px 0; border-radius: 5px; }
                .bot-running { border-left: 5px solid green; }
                .bot-stopped { border-left: 5px solid red; }
                button { margin: 5px; padding: 8px 15px; }
            </style>
        </head>
        <body>
            <h1>🤖 Bot Platform Simples</h1>
            
            <div>
                <button onclick="showCreateForm()">➕ Novo Bot</button>
                <button onclick="loadBots()">🔄 Atualizar</button>
            </div>
            
            <div id="bots-list"></div>
            
            <div id="create-form" style="display:none; margin-top:20px; padding:20px; border:1px solid #ccc;">
                <h3>Criar Bot</h3>
                <div>
                    <label>Nome:</label>
                    <input type="text" id="bot-name" placeholder="Meu Bot">
                </div>
                <div>
                    <label>Token:</label>
                    <input type="text" id="bot-token" placeholder="1234567890:ABC...">
                </div>
                <div>
                    <label>Tipo:</label>
                    <select id="bot-type" onchange="changeBotType()">
                        <option value="simple">Bot Simples</option>
                        <option value="aviator">Bot Aviator</option>
                    </select>
                </div>
                
                <div id="config-area">
                    <textarea id="bot-config" rows="10" cols="60"></textarea>
                </div>
                
                <button onclick="createBot()">Criar</button>
                <button onclick="hideCreateForm()">Cancelar</button>
                <button onclick="loadExample()">Exemplo</button>
            </div>
            
            <script>
                function showCreateForm() {
                    document.getElementById('create-form').style.display = 'block';
                    changeBotType();
                }
                
                function hideCreateForm() {
                    document.getElementById('create-form').style.display = 'none';
                }
                
                function changeBotType() {
                    const type = document.getElementById('bot-type').value;
                    let example = '';
                    
                    if (type === 'simple') {
                        example = JSON.stringify({
                            bot: {
                                name: "Meu Bot",
                                token: "SEU_TOKEN_AQUI",
                                channel: "@meucanal"
                            },
                            commands: {
                                start: {
                                    message: "👋 Olá! Eu sou o {bot_name}\\n\\nComandos:\\n/start - Iniciar\\n/ajuda - Ajuda",
                                    buttons: [
                                        { text: "🌐 Site", url: "https://google.com" },
                                        { text: "📞 Contato", callback: "contato" }
                                    ]
                                },
                                ajuda: {
                                    message: "🤖 Como usar:\\n\\n• /start - Iniciar\\n• /ajuda - Esta mensagem"
                                }
                            },
                            callbacks: {
                                contato: {
                                    message: "📞 Entre em contato:\\n\\nEmail: contato@site.com\\nTelefone: +258 84 123 4567"
                                }
                            },
                            schedule: [
                                {
                                    time: "09:00",
                                    message: "☀️ Bom dia!",
                                    channel: "@meucanal"
                                }
                            ]
                        }, null, 2);
                    } else {
                        example = JSON.stringify({
                            bot: {
                                name: "Bot Aviator",
                                token: "SEU_TOKEN_AQUI"
                            },
                            type: "aviator_signals",
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
                                intervals: {
                                    between_signals: 180,
                                    between_cycles: 10
                                }
                            }
                        }, null, 2);
                    }
                    
                    document.getElementById('bot-config').value = example;
                }
                
                async function loadBots() {
                    const res = await fetch('/api/bots');
                    const data = await res.json();
                    
                    const container = document.getElementById('bots-list');
                    container.innerHTML = '';
                    
                    data.bots.forEach(bot => {
                        const div = document.createElement('div');
                        div.className = 'bot-card ' + (bot.running ? 'bot-running' : 'bot-stopped');
                        div.innerHTML = \`
                            <h3>\${bot.name} (\${bot.type})</h3>
                            <p>ID: \${bot.id}</p>
                            <p>Status: \${bot.running ? '✅ Online' : '⛔ Offline'}</p>
                            <p>Canal: \${bot.channel || 'Não especificado'}</p>
                            <button onclick="controlBot('\${bot.id}', 'stop')" \${!bot.running ? 'disabled' : ''}>⏹️ Parar</button>
                            <button onclick="controlBot('\${bot.id}', 'restart')" \${bot.running ? 'disabled' : ''}>🔄 Reiniciar</button>
                            <button onclick="deleteBot('\${bot.id}')">🗑️ Remover</button>
                        \`;
                        container.appendChild(div);
                    });
                }
                
                async function controlBot(botId, action) {
                    await fetch(\`/api/bots/\${botId}/control\`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action })
                    });
                    loadBots();
                }
                
                async function deleteBot(botId) {
                    if (confirm('Remover este bot?')) {
                        await fetch(\`/api/bots/\${botId}\`, { method: 'DELETE' });
                        loadBots();
                    }
                }
                
                async function createBot() {
                    const name = document.getElementById('bot-name').value;
                    const token = document.getElementById('bot-token').value;
                    const configText = document.getElementById('bot-config').value;
                    
                    if (!name || !token) {
                        alert('Preencha nome e token');
                        return;
                    }
                    
                    try {
                        const config = JSON.parse(configText);
                        config.bot.name = name;
                        config.bot.token = token;
                        
                        // Validar primeiro
                        const validateRes = await fetch('/api/validate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(config)
                        });
                        
                        const validateData = await validateRes.json();
                        
                        if (!validateData.success) {
                            alert('Erros:\\n' + validateData.errors.join('\\n'));
                            return;
                        }
                        
                        // Criar bot
                        const res = await fetch('/api/bots', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(config)
                        });
                        
                        const data = await res.json();
                        
                        if (data.success) {
                            alert('✅ Bot criado!');
                            hideCreateForm();
                            loadBots();
                        } else {
                            alert('Erro: ' + data.error);
                        }
                        
                    } catch (e) {
                        alert('Erro no JSON: ' + e.message);
                    }
                }
                
                function loadExample() {
                    changeBotType();
                }
                
                // Carregar bots ao iniciar
                loadBots();
            </script>
        </body>
        </html>
    `);
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════╗
║      🤖 BOT PLATFORM SIMPLES     ║
║                                  ║
║  🌐 http://localhost:${PORT}      ║
║  ✅ Sistema pronto!              ║
║  🚀 Multi-bot simultâneo         ║
║  📱 JSON simplificado            ║
╚══════════════════════════════════╝
    `);
});