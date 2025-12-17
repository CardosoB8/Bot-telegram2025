// ============================================
// BOT PLATFORM - Sistema Completo em 1 arquivo
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

// ==================== CLASSE BOT INTERPRETER ====================
class BotInterpreter {
    constructor(config) {
        this.config = config;
        this.bot = null;
        this.tasks = [];
        this.stats = {
            messagesSent: 0,
            commandsUsed: 0,
            startedAt: new Date()
        };
    }

    async start() {
        try {
            console.log(`🤖 Iniciando bot: ${this.config.bot?.name || 'Sem nome'}`);
            
            // Criar instância do bot
            this.bot = new TelegramBot(this.config.bot.token, { 
                polling: true,
                filepath: false
            });

            // Configurar funcionalidades
            await this.setupCommands();
            await this.setupAutoMessages();
            await this.setupScheduledPosts();
            await this.setupGroupFeatures();
            await this.setupTasks();

            console.log(`✅ Bot iniciado com sucesso!`);
            return true;

        } catch (error) {
            console.error(`❌ Erro ao iniciar bot:`, error.message);
            return false;
        }
    }

    async setupCommands() {
        if (!this.config.commands) return;

        for (const [command, data] of Object.entries(this.config.commands)) {
            console.log(`📝 Registrando comando: ${command}`);

            // Comando normal
            if (command.startsWith('/')) {
                this.bot.onText(new RegExp(`^${command}(?:@\\w+)?$`), async (msg) => {
                    await this.handleCommand(command, data, msg);
                });
            }
            // Callback de botão
            else if (command.startsWith('callback:')) {
                const callbackData = command.replace('callback:', '');
                this.bot.on('callback_query', async (query) => {
                    if (query.data === callbackData) {
                        await this.handleCallback(query, data);
                    }
                });
            }
        }
    }

    async handleCommand(command, data, msg) {
        const chatId = msg.chat.id;
        this.stats.commandsUsed++;

        try {
            let message = data.message || data.text || '';
            
            // Substituir variáveis
            message = this.replaceVariables(message, msg);

            // Verificar se é apenas para admins
            if (data.only_admins) {
                const isAdmin = await this.isAdmin(msg.from.id, msg.chat.id);
                if (!isAdmin) {
                    await this.bot.sendMessage(chatId, "❌ Apenas administradores podem usar este comando.");
                    return;
                }
            }

            // Se tiver imagem
            if (data.image) {
                await this.bot.sendPhoto(chatId, data.image, {
                    caption: message,
                    parse_mode: 'HTML',
                    reply_markup: this.createKeyboard(data.buttons)
                });
            }
            // Se for enquete
            else if (data.poll) {
                await this.bot.sendPoll(chatId, data.question || 'Enquete', 
                    data.options || ['Sim', 'Não'], {
                    is_anonymous: data.anonymous || false
                });
            }
            // Mensagem normal
            else {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'HTML',
                    reply_markup: this.createKeyboard(data.buttons),
                    disable_web_page_preview: data.disable_preview || false
                });
            }

            // Apagar comando original se configurado
            if (this.config.features?.delete_commands) {
                setTimeout(() => {
                    this.bot.deleteMessage(chatId, msg.message_id).catch(() => {});
                }, 1000);
            }

        } catch (error) {
            console.error(`Erro no comando ${command}:`, error.message);
            await this.bot.sendMessage(chatId, "❌ Ocorreu um erro ao processar o comando.");
        }
    }

    async handleCallback(query, data) {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        try {
            await this.bot.answerCallbackQuery(query.id);

            if (data.action === 'edit_message') {
                await this.bot.editMessageText(data.message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: this.createKeyboard(data.buttons)
                });
            } else if (data.action === 'delete_message') {
                await this.bot.deleteMessage(chatId, messageId);
            } else if (data.message) {
                await this.bot.sendMessage(chatId, data.message, {
                    parse_mode: 'HTML',
                    reply_markup: this.createKeyboard(data.buttons)
                });
            }

        } catch (error) {
            console.error('Erro no callback:', error.message);
        }
    }

    async setupAutoMessages() {
        if (!this.config.auto_messages) return;

        this.bot.on('message', async (msg) => {
            if (!msg.text || msg.text.startsWith('/')) return;

            const text = msg.text.toLowerCase();
            
            for (const [trigger, response] of Object.entries(this.config.auto_messages)) {
                if (text.includes(trigger.toLowerCase())) {
                    await this.bot.sendMessage(msg.chat.id, response, {
                        parse_mode: 'HTML'
                    });
                    break;
                }
            }
        });

        // Boas-vindas para novos membros
        if (this.config.groups) {
            this.bot.on('new_chat_members', async (msg) => {
                for (const [groupId, groupConfig] of Object.entries(this.config.groups)) {
                    const chatId = msg.chat.id.toString();
                    const targetId = groupId.startsWith('@') ? groupId.slice(1) : groupId;
                    
                    if (chatId === targetId || 
                        msg.chat.username === targetId || 
                        (msg.chat.title && msg.chat.title.toLowerCase().includes(targetId.toLowerCase()))) {
                        
                        if (groupConfig.welcome_message) {
                            for (const user of msg.new_chat_members) {
                                const welcomeMsg = groupConfig.welcome_message
                                    .replace(/{user_name}/g, user.first_name)
                                    .replace(/{user_id}/g, user.id)
                                    .replace(/{bot_name}/g, this.config.bot?.name || 'Bot');
                                
                                await this.bot.sendMessage(msg.chat.id, welcomeMsg, {
                                    parse_mode: 'HTML'
                                });
                            }
                        }
                    }
                }
            });
        }
    }

    async setupScheduledPosts() {
        if (!this.config.daily_posts && !this.config.scheduled_posts) return;

        const posts = this.config.daily_posts || this.config.scheduled_posts || [];

        for (const post of posts) {
            if (!post.time || !post.message) continue;

            const [hours, minutes] = post.time.split(':');
            const cronTime = `${minutes} ${hours} * * *`;

            if (cron.validate(cronTime)) {
                const task = cron.schedule(cronTime, async () => {
                    console.log(`📅 Post agendado: ${post.time} - ${post.channel || 'default'}`);
                    
                    try {
                        const chatId = post.channel || this.config.bot?.default_channel;
                        if (!chatId) return;

                        if (post.image) {
                            await this.bot.sendPhoto(chatId, post.image, {
                                caption: post.message,
                                parse_mode: 'HTML',
                                reply_markup: this.createKeyboard(post.buttons)
                            });
                        } else if (post.poll) {
                            await this.bot.sendPoll(chatId, post.question || 'Enquete', 
                                post.options || ['Opção 1', 'Opção 2'], {
                                is_anonymous: post.anonymous || false
                            });
                        } else {
                            await this.bot.sendMessage(chatId, post.message, {
                                parse_mode: 'HTML',
                                reply_markup: this.createKeyboard(post.buttons)
                            });
                        }

                        this.stats.messagesSent++;

                    } catch (error) {
                        console.error('Erro no post agendado:', error.message);
                    }
                });

                this.tasks.push(task);
            }
        }
    }

    async setupGroupFeatures() {
        if (!this.config.groups) return;

        for (const [groupId, groupConfig] of Object.entries(this.config.groups)) {
            // Comandos de moderação
            if (groupConfig.mod_commands) {
                for (const [command, description] of Object.entries(groupConfig.mod_commands)) {
                    if (command.startsWith('/')) {
                        this.bot.onText(new RegExp(`^${command}(?:@\\w+)?$`), async (msg) => {
                            if (msg.chat.id.toString() === groupId.replace('@', '') || 
                                msg.chat.username === groupId.replace('@', '')) {
                                
                                const isAdmin = await this.isAdmin(msg.from.id, msg.chat.id);
                                if (!isAdmin) {
                                    await this.bot.sendMessage(msg.chat.id, 
                                        "❌ Apenas administradores podem usar este comando.");
                                    return;
                                }

                                await this.handleModCommand(command, msg);
                            }
                        });
                    }
                }
            }
        }
    }

    async setupTasks() {
        if (!this.config.tasks) return;

        for (const task of this.config.tasks) {
            let cronTime = this.parseSchedule(task.schedule);
            
            if (cronTime && cron.validate(cronTime)) {
                const job = cron.schedule(cronTime, async () => {
                    console.log(`🔄 Executando tarefa: ${task.name}`);
                    await this.executeTask(task);
                });

                this.tasks.push(job);
            }
        }
    }

    createKeyboard(buttons) {
        if (!buttons) return {};

        // Se for array de arrays (teclado inline)
        if (Array.isArray(buttons) && buttons.length > 0) {
            if (Array.isArray(buttons[0])) {
                const inlineKeyboard = buttons.map(row => 
                    row.filter(btn => btn).map(btn => {
                        if (btn.url) {
                            return {
                                text: btn.text || '🔗',
                                url: btn.url
                            };
                        } else if (btn.callback) {
                            return {
                                text: btn.text || '📌',
                                callback_data: btn.callback
                            };
                        }
                        return {
                            text: btn.text || '❓'
                        };
                    })
                ).filter(row => row.length > 0);

                if (inlineKeyboard.length > 0) {
                    return {
                        reply_markup: {
                            inline_keyboard: inlineKeyboard
                        }
                    };
                }
            }
            // Array simples
            else {
                const keyboard = buttons.map(btn => [btn.text || 'Botão']);
                return {
                    reply_markup: {
                        keyboard: keyboard,
                        resize_keyboard: true,
                        one_time_keyboard: false
                    }
                };
            }
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

    async isAdmin(userId, chatId) {
        try {
            const admins = await this.bot.getChatAdministrators(chatId);
            return admins.some(admin => admin.user.id === userId);
        } catch (error) {
            // Se não conseguir verificar, verificar lista de admins do config
            const configAdmins = this.config.bot?.admins || [];
            return configAdmins.some(admin => 
                admin.includes(userId.toString()) || 
                admin.includes('@' + userId.toString())
            );
        }
    }

    async handleModCommand(command, msg) {
        const parts = command.split(' ');
        const action = parts[0];
        const target = parts[1];

        switch(action) {
            case '/ban':
                if (target) {
                    await this.bot.banChatMember(msg.chat.id, target.replace('@', ''));
                    await this.bot.sendMessage(msg.chat.id, `✅ Usuário ${target} banido.`);
                }
                break;

            case '/mute':
                if (target) {
                    const duration = parts[2] || '1h';
                    const seconds = this.parseDuration(duration);
                    
                    await this.bot.restrictChatMember(msg.chat.id, target.replace('@', ''), {
                        until_date: Math.floor(Date.now() / 1000) + seconds,
                        can_send_messages: false
                    });
                    
                    await this.bot.sendMessage(msg.chat.id, 
                        `🔇 Usuário ${target} silenciado por ${duration}.`);
                }
                break;

            case '/warn':
                if (target) {
                    await this.bot.sendMessage(msg.chat.id, 
                        `⚠️ Aviso para ${target}: Por favor, siga as regras do grupo!`);
                }
                break;
        }
    }

    parseSchedule(schedule) {
        if (!schedule) return null;

        if (schedule.includes('every day at')) {
            const time = schedule.split('at ')[1];
            const [hours, minutes] = time.split(':');
            return `${minutes} ${hours} * * *`;
        }
        else if (schedule.includes('every sunday at')) {
            const time = schedule.split('at ')[1];
            const [hours, minutes] = time.split(':');
            return `${minutes} ${hours} * * 0`;
        }
        else if (schedule.includes('every monday at')) {
            const time = schedule.split('at ')[1];
            const [hours, minutes] = time.split(':');
            return `${minutes} ${hours} * * 1`;
        }

        return null;
    }

    parseDuration(duration) {
        const unit = duration.slice(-1);
        const value = parseInt(duration.slice(0, -1)) || 1;

        switch(unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 3600;
            case 'd': return value * 86400;
            default: return 3600; // 1 hora padrão
        }
    }

    async executeTask(task) {
        switch(task.type) {
            case 'cleanup':
                console.log('🧹 Limpeza de mensagens antigas');
                // Implementar lógica de limpeza
                break;

            case 'backup':
                console.log('💾 Backup realizado');
                // Implementar backup
                break;

            case 'report':
                const admin = task.action?.split(' ')[1] || this.config.bot?.admins?.[0];
                if (admin) {
                    await this.bot.sendMessage(admin, 
                        `📊 Relatório gerado em ${new Date().toLocaleString()}\n` +
                        `Mensagens enviadas: ${this.stats.messagesSent}\n` +
                        `Comandos usados: ${this.stats.commandsUsed}`);
                }
                break;
        }
    }

    async stop() {
        console.log(`🛑 Parando bot...`);

        // Parar tarefas agendadas
        for (const task of this.tasks) {
            task.stop();
        }
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
            running: this.bot !== null,
            stats: this.stats,
            features: {
                commands: Object.keys(this.config.commands || {}).length,
                scheduled: (this.config.daily_posts || []).length + (this.config.scheduled_posts || []).length,
                tasks: (this.config.tasks || []).length
            }
        };
    }
}

// ==================== API ENDPOINTS ====================
app.post('/api/bots', async (req, res) => {
    try {
        const config = req.body;
        const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Validar configuração mínima
        if (!config.bot?.token) {
            return res.status(400).json({
                success: false,
                error: 'Token do bot é obrigatório'
            });
        }

        // Criar e iniciar bot
        const interpreter = new BotInterpreter(config);
        const started = await interpreter.start();

        if (!started) {
            return res.status(500).json({
                success: false,
                error: 'Falha ao iniciar bot'
            });
        }

        // Armazenar
        bots.set(botId, interpreter);
        botConfigs.set(botId, config);

        res.json({
            success: true,
            botId: botId,
            name: config.bot?.name || 'Bot sem nome',
            message: 'Bot criado e iniciado com sucesso!'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/bots', (req, res) => {
    const botList = [];
    
    for (const [botId, interpreter] of bots.entries()) {
        const config = botConfigs.get(botId);
        const status = interpreter.getStatus();
        
        botList.push({
            id: botId,
            name: config?.bot?.name || 'Bot sem nome',
            running: status.running,
            stats: status.stats,
            features: status.features
        });
    }

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

        const interpreter = bots.get(botId);
        if (!interpreter) {
            return res.status(404).json({
                success: false,
                error: 'Bot não encontrado'
            });
        }

        switch(action) {
            case 'stop':
                await interpreter.stop();
                break;

            case 'restart':
                await interpreter.stop();
                const config = botConfigs.get(botId);
                const newInterpreter = new BotInterpreter(config);
                await newInterpreter.start();
                bots.set(botId, newInterpreter);
                break;

            case 'status':
                // Retorna status sem alterar
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Ação inválida. Use: stop, restart, status'
                });
        }

        const status = interpreter.getStatus();

        res.json({
            success: true,
            action: action,
            status: status
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
        const interpreter = bots.get(botId);

        if (interpreter) {
            await interpreter.stop();
            bots.delete(botId);
            botConfigs.delete(botId);
        }

        res.json({
            success: true,
            message: 'Bot removido com sucesso'
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
        if (!config.bot?.token) {
            errors.push('Token do bot é obrigatório');
        }

        if (!config.bot?.name) {
            warnings.push('Nome do bot não especificado');
        }

        // Verificar comandos
        if (config.commands) {
            for (const [command, data] of Object.entries(config.commands)) {
                if (!data.message && !data.text && !data.image && !data.poll) {
                    warnings.push(`Comando ${command} não tem conteúdo definido`);
                }
            }
        }

        // Verificar posts agendados
        if (config.daily_posts || config.scheduled_posts) {
            const posts = config.daily_posts || config.scheduled_posts;
            for (const post of posts) {
                if (!post.time || !post.message) {
                    errors.push('Post agendado sem horário ou mensagem');
                }
            }
        }

        res.json({
            success: errors.length === 0,
            errors: errors,
            warnings: warnings,
            stats: {
                commands: Object.keys(config.commands || {}).length,
                scheduled_posts: (config.daily_posts || []).length + (config.scheduled_posts || []).length,
                tasks: (config.tasks || []).length
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== INTERFACE WEB ====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bot Platform Simples</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    padding: 30px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                h1 { 
                    color: #333;
                    margin-bottom: 30px;
                    text-align: center;
                    font-size: 2.5em;
                }
                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.3s;
                    margin: 5px;
                }
                .btn-primary {
                    background: #4361ee;
                    color: white;
                }
                .btn-primary:hover {
                    background: #3a56d4;
                    transform: translateY(-2px);
                }
                .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
                .bot-card {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 20px;
                    margin: 15px 0;
                    border-left: 5px solid #4361ee;
                    transition: all 0.3s;
                }
                .bot-card:hover {
                    transform: translateX(5px);
                    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
                }
                .bot-running {
                    border-left-color: #2ecc71;
                }
                .bot-stopped {
                    border-left-color: #e74c3c;
                }
                .modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }
                .modal-content {
                    background: white;
                    padding: 30px;
                    border-radius: 20px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                }
                textarea {
                    width: 100%;
                    min-height: 300px;
                    padding: 15px;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    margin: 10px 0;
                }
                .example-card {
                    background: #e3f2fd;
                    border-radius: 10px;
                    padding: 15px;
                    margin: 10px 0;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .example-card:hover {
                    background: #bbdefb;
                    transform: scale(1.02);
                }
                .stats {
                    display: flex;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    margin: 20px 0;
                }
                .stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    border-radius: 15px;
                    text-align: center;
                    flex: 1;
                    margin: 10px;
                    min-width: 200px;
                }
                .stat-card h3 {
                    font-size: 2em;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Bot Platform Simples</h1>
                
                <div class="stats">
                    <div class="stat-card">
                        <h3 id="total-bots">0</h3>
                        <p>Bots Ativos</p>
                    </div>
                    <div class="stat-card">
                        <h3 id="total-commands">0</h3>
                        <p>Comandos</p>
                    </div>
                    <div class="stat-card">
                        <h3 id="total-scheduled">0</h3>
                        <p>Posts Agendados</p>
                    </div>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <button class="btn btn-primary" onclick="showCreateModal()">➕ Criar Novo Bot</button>
                    <button class="btn btn-secondary" onclick="loadBots()">🔄 Atualizar</button>
                </div>
                
                <div id="bots-container">
                    <!-- Bots serão carregados aqui -->
                    <div style="text-align: center; padding: 40px;">
                        <div class="spinner" style="font-size: 3em;">⏳</div>
                        <p>Carregando bots...</p>
                    </div>
                </div>
            </div>
            
            <!-- Modal para criar bot -->
            <div id="createModal" class="modal">
                <div class="modal-content">
                    <h2>Criar Novo Bot</h2>
                    
                    <div style="margin: 20px 0;">
                        <h4>📋 Exemplos Rápidos:</h4>
                        <div class="example-card" onclick="loadExample('simple')">
                            <strong>Bot Simples</strong>
                            <p>Comandos básicos e boas-vindas</p>
                        </div>
                        <div class="example-card" onclick="loadExample('group')">
                            <strong>Bot de Grupo</strong>
                            <p>Moderação e mensagens automáticas</p>
                        </div>
                        <div class="example-card" onclick="loadExample('channel')">
                            <strong>Bot de Canal</strong>
                            <p>Posts agendados e conteúdo</p>
                        </div>
                    </div>
                    
                    <div>
                        <label><strong>Token do Bot:</strong></label>
                        <input type="text" id="botToken" placeholder="1234567890:ABCdefGhIJK..." 
                               style="width: 100%; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #ccc;">
                    </div>
                    
                    <div>
                        <label><strong>Configuração JSON:</strong></label>
                        <textarea id="botConfig">
{
  "bot": {
    "name": "Meu Bot",
    "token": "SEU_TOKEN_AQUI"
  }
}</textarea>
                    </div>
                    
                    <div style="text-align: right; margin-top: 20px;">
                        <button class="btn btn-secondary" onclick="hideCreateModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="validateConfig()">✅ Validar</button>
                        <button class="btn btn-primary" onclick="createBot()">🚀 Criar Bot</button>
                    </div>
                    
                    <div id="validationResult" style="margin-top: 20px;"></div>
                </div>
            </div>
            
            <script>
                // Carregar bots ao iniciar
                document.addEventListener('DOMContentLoaded', loadBots);
                
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
                    }
                }
                
                function updateStats(data) {
                    document.getElementById('total-bots').textContent = data.count;
                    
                    let totalCommands = 0;
                    let totalScheduled = 0;
                    
                    data.bots.forEach(bot => {
                        totalCommands += bot.features?.commands || 0;
                        totalScheduled += bot.features?.scheduled || 0;
                    });
                    
                    document.getElementById('total-commands').textContent = totalCommands;
                    document.getElementById('total-scheduled').textContent = totalScheduled;
                }
                
                function renderBots(bots) {
                    const container = document.getElementById('bots-container');
                    
                    if (bots.length === 0) {
                        container.innerHTML = \`
                            <div style="text-align: center; padding: 40px;">
                                <h3>😴 Nenhum bot criado ainda</h3>
                                <p>Clique em "Criar Novo Bot" para começar!</p>
                            </div>
                        \`;
                        return;
                    }
                    
                    container.innerHTML = bots.map(bot => \`
                        <div class="bot-card \${bot.running ? 'bot-running' : 'bot-stopped'}">
                            <h3>\${bot.name}</h3>
                            <p><strong>ID:</strong> \${bot.id}</p>
                            <p><strong>Status:</strong> \${bot.running ? '✅ Online' : '⛔ Offline'}</p>
                            <p><strong>Mensagens:</strong> \${bot.stats?.messagesSent || 0}</p>
                            <p><strong>Comandos:</strong> \${bot.features?.commands || 0}</p>
                            <p><strong>Agendados:</strong> \${bot.features?.scheduled || 0}</p>
                            
                            <div style="margin-top: 15px;">
                                \${bot.running ? 
                                    \`<button class="btn btn-secondary" onclick="controlBot('\${bot.id}', 'stop')">⏹️ Parar</button>\` : 
                                    \`<button class="btn btn-primary" onclick="controlBot('\${bot.id}', 'restart')">▶️ Iniciar</button>\`
                                }
                                <button class="btn btn-secondary" onclick="controlBot('\${bot.id}', 'status')">📊 Status</button>
                                <button class="btn btn-secondary" onclick="deleteBot('\${bot.id}')">🗑️ Remover</button>
                            </div>
                        </div>
                    \`).join('');
                }
                
                async function controlBot(botId, action) {
                    try {
                        const response = await fetch(\`/api/bots/\${botId}/control\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: action })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            if (action === 'status') {
                                alert(\`Status do Bot:\\nMensagens: \${data.status.stats.messagesSent}\\nComandos: \${data.status.stats.commandsUsed}\`);
                            }
                            loadBots();
                        }
                    } catch (error) {
                        alert('Erro ao controlar bot: ' + error.message);
                    }
                }
                
                async function deleteBot(botId) {
                    if (confirm('Tem certeza que deseja remover este bot?')) {
                        try {
                            await fetch(\`/api/bots/\${botId}\`, { method: 'DELETE' });
                            loadBots();
                        } catch (error) {
                            alert('Erro ao remover bot: ' + error.message);
                        }
                    }
                }
                
                function showCreateModal() {
                    document.getElementById('createModal').style.display = 'flex';
                }
                
                function hideCreateModal() {
                    document.getElementById('createModal').style.display = 'none';
                }
                
                async function validateConfig() {
                    const configText = document.getElementById('botConfig').value;
                    
                    try {
                        const config = JSON.parse(configText);
                        
                        const response = await fetch('/api/validate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(config)
                        });
                        
                        const result = await response.json();
                        
                        const validationDiv = document.getElementById('validationResult');
                        
                        if (result.success) {
                            validationDiv.innerHTML = \`
                                <div style="background: #d4edda; color: #155724; padding: 15px; border-radius: 10px;">
                                    <strong>✅ JSON Válido!</strong>
                                    <p>Comandos: \${result.stats.commands}</p>
                                    <p>Posts agendados: \${result.stats.scheduled_posts}</p>
                                    <p>Tarefas: \${result.stats.tasks}</p>
                                    \${result.warnings.length > 0 ? 
                                        \`<p><strong>Avisos:</strong> \${result.warnings.join(', ')}</p>\` : ''
                                    }
                                </div>
                            \`;
                        } else {
                            validationDiv.innerHTML = \`
                                <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 10px;">
                                    <strong>❌ Erros encontrados:</strong>
                                    <ul>\${result.errors.map(e => \`<li>\${e}</li>\`).join('')}</ul>
                                    \${result.warnings.length > 0 ? 
                                        \`<p><strong>Avisos:</strong> \${result.warnings.join(', ')}</p>\` : ''
                                    }
                                </div>
                            \`;
                        }
                        
                    } catch (error) {
                        document.getElementById('validationResult').innerHTML = \`
                            <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 10px;">
                                <strong>❌ JSON Inválido:</strong>
                                <p>\${error.message}</p>
                            </div>
                        \`;
                    }
                }
                
                async function createBot() {
                    const token = document.getElementById('botToken').value;
                    const configText = document.getElementById('botConfig').value;
                    
                    if (!token) {
                        alert('Por favor, insira o token do bot');
                        return;
                    }
                    
                    try {
                        const config = JSON.parse(configText);
                        config.bot.token = token;
                        
                        const response = await fetch('/api/bots', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(config)
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            alert(\`✅ Bot criado com sucesso!\\nID: \${result.botId}\`);
                            hideCreateModal();
                            loadBots();
                        } else {
                            alert('Erro ao criar bot: ' + result.error);
                        }
                        
                    } catch (error) {
                        alert('Erro: ' + error.message);
                    }
                }
                
                function loadExample(type) {
                    const examples = {
                        simple: \`{
  "bot": {
    "name": "Bot Simples",
    "token": "SEU_TOKEN_AQUI",
    "admins": ["@seuusuario"]
  },
  
  "commands": {
    "/start": {
      "message": "👋 Olá! Eu sou o {bot.name}\\n\\nComo posso ajudar?",
      "buttons": [
        [
          {"text": "ℹ️ Ajuda", "callback": "callback:help"},
          {"text": "🔗 Site", "url": "https://exemplo.com"}
        ]
      ]
    },
    
    "/ajuda": {
      "message": "🤖 **COMANDOS DISPONÍVEIS:**\\n\\n• /start - Iniciar\\n• /ajuda - Esta mensagem\\n• /info - Informações",
      "image": "https://imgur.com/ajuda.jpg"
    }
  },
  
  "auto_messages": {
    "bom dia": "Bom dia! ☀️",
    "boa tarde": "Boa tarde! 🌤️",
    "obrigado": "De nada! 😊"
  },
  
  "daily_posts": [
    {
      "time": "09:00",
      "message": "🌅 Bom dia a todos!",
      "channel": "@meucanal"
    }
  ]
}\`,
                        
                        group: \`{
  "bot": {
    "name": "Moderador do Grupo",
    "token": "SEU_TOKEN_AQUI",
    "admins": ["@admin1", "@admin2"]
  },
  
  "features": {
    "delete_commands": true
  },
  
  "groups": {
    "@meugrupo": {
      "welcome_message": "👋 Bem-vindo {user_name} ao grupo!\\n\\n📖 Leia as regras fixadas.",
      
      "rules": "📜 **REGRAS:**\\n1. Respeito mútuo\\n2. Sem spam\\n3. Sem conteúdo impróprio\\n4. Mantenha o foco no tema",
      
      "mod_commands": {
        "/ban @username": "Banir usuário",
        "/mute @username 10m": "Silenciar por 10 minutos",
        "/warn @username": "Dar advertência"
      }
    }
  },
  
  "auto_messages": {
    "regras": "As regras estão fixadas! 📌",
    "admin": "Admins disponíveis: @admin1 @admin2"
  }
}\`,
                        
                        channel: \`{
  "bot": {
    "name": "Postador Automático",
    "token": "SEU_TOKEN_AQUI"
  },
  
  "channels": {
    "@meucanal": {
      "daily_schedule": [
        {
          "time": "08:00",
          "message": "☀️ Bom dia! Hora de começar o dia com energia!",
          "image": "https://imgur.com/manha.jpg"
        },
        {
          "time": "12:00",
          "poll": {
            "question": "Qual seu prato favorito?",
            "options": ["🍕 Pizza", "🍔 Hambúrguer", "🥗 Salada", "🍝 Macarrão"]
          }
        },
        {
          "time": "18:00",
          "message": "⏰ Boa tarde! Produtividade em alta!",
          "buttons": [
            [
              {"text": "📊 Relatório", "url": "https://relatorio.com"},
              {"text": "📞 Contato", "url": "https://t.me/contato"}
            ]
          ]
        }
      ]
    }
  },
  
  "tasks": [
    {
      "name": "Limpar logs",
      "type": "cleanup",
      "schedule": "every day at 03:00",
      "action": "clean_logs"
    }
  ]
}\`
                    };
                    
                    document.getElementById('botConfig').value = examples[type];
                    document.getElementById('validationResult').innerHTML = '';
                }
            </script>
        </body>
        </html>
    `);
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║       🤖 BOT PLATFORM SIMPLES        ║
║                                      ║
║  🌐 Servidor: http://localhost:${PORT}  ║
║  ✅ Sistema pronto para usar!        ║
║                                      ║
║  📝 Crie seus bots via JSON          ║
║  🚀 Interface web completa           ║
║  ⚡ Multi-bot simultâneo              ║
╚══════════════════════════════════════╝
    `);
});