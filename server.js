require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados em memória
const botsDB = new Map();
const botInstances = new Map();

// ==================== SISTEMA DE WEBHOOK ====================

/**
 * Configura webhook para um bot
 */
async function setupWebhook(botToken, botId) {
    try {
        const webhookUrl = `${BASE_URL}/webhook/${botId}`;
        console.log(`🔗 Configurando webhook para bot ${botId}: ${webhookUrl}`);
        
        const response = await axios.post(
            `https://api.telegram.org/bot${botToken}/setWebhook`,
            { url: webhookUrl }
        );
        
        return response.data.ok;
    } catch (error) {
        console.error(`❌ Erro ao configurar webhook:`, error.message);
        return false;
    }
}

/**
 * Remove webhook de um bot
 */
async function removeWebhook(botToken) {
    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
        return true;
    } catch (error) {
        console.error('Erro ao remover webhook:', error.message);
        return false;
    }
}

// ==================== INTERPRETADOR DE JSON ====================

class JSONInterpreter {
    static validateConfig(config) {
        const errors = [];
        const warnings = [];

        // Validações básicas
        if (!config.bot?.token) {
            errors.push('Token do bot é obrigatório');
        }

        if (!config.bot?.name) {
            warnings.push('Nome do bot não especificado - usando padrão');
        }

        // Valida comandos
        if (config.commands) {
            Object.entries(config.commands).forEach(([cmd, data]) => {
                if (!data.message && !data.text && !data.image) {
                    warnings.push(`Comando "${cmd}" não tem conteúdo definido`);
                }
            });
        }

        return { errors, warnings };
    }

    static createBotInstance(config, botId) {
        const bot = new Telegraf(config.bot.token);
        const tasks = [];
        
        // Configurar comandos básicos
        if (config.commands) {
            this.setupCommands(bot, config.commands);
        }

        // Configurar respostas automáticas
        if (config.auto_responses) {
            this.setupAutoResponses(bot, config.auto_responses);
        }

        // Configurar posts agendados
        if (config.schedule) {
            tasks.push(...this.setupSchedule(bot, config.schedule));
        }

        // Configurar bot Aviator se for do tipo
        if (config.type === 'aviator') {
            tasks.push(...this.setupAviatorBot(bot, config.aviator_config));
        }

        return { bot, tasks };
    }

    static setupCommands(bot, commands) {
        Object.entries(commands).forEach(([command, data]) => {
            const cmd = command.startsWith('/') ? command : `/${command}`;
            
            bot.command(cmd.replace('/', ''), async (ctx) => {
                try {
                    let message = data.message || data.text || '';
                    
                    // Substituir variáveis
                    message = message
                        .replace(/{user_name}/g, ctx.from.first_name)
                        .replace(/{bot_name}/g, 'Bot')
                        .replace(/{date}/g, new Date().toLocaleDateString('pt-BR'));
                    
                    const options = {
                        parse_mode: 'HTML'
                    };

                    // Adicionar botões se existirem
                    if (data.buttons) {
                        options.reply_markup = this.createKeyboard(data.buttons);
                    }

                    if (data.image) {
                        await ctx.replyWithPhoto(data.image, {
                            caption: message,
                            ...options
                        });
                    } else if (data.poll) {
                        await ctx.replyWithPoll(data.poll.question, data.poll.options, {
                            is_anonymous: data.poll.anonymous || false,
                            ...options
                        });
                    } else {
                        await ctx.reply(message, options);
                    }
                } catch (error) {
                    console.error(`Erro no comando ${command}:`, error.message);
                    await ctx.reply('❌ Erro ao processar comando.');
                }
            });
        });
    }

    static setupAutoResponses(bot, responses) {
        Object.entries(responses).forEach(([trigger, response]) => {
            bot.hears(new RegExp(trigger, 'i'), async (ctx) => {
                await ctx.reply(response, { parse_mode: 'HTML' });
            });
        });
    }

    static setupSchedule(bot, schedule) {
        const tasks = [];
        
        schedule.forEach((post, index) => {
            if (!post.time || !post.message) return;

            const [hours, minutes] = post.time.split(':');
            const cronTime = `${minutes} ${hours} * * *`;

            if (cron.validate(cronTime)) {
                const task = cron.schedule(cronTime, async () => {
                    try {
                        const target = post.channel || post.chat_id;
                        if (!target) return;

                        const options = {
                            parse_mode: 'HTML'
                        };

                        if (post.buttons) {
                            options.reply_markup = this.createKeyboard(post.buttons);
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

        return tasks;
    }

    static setupAviatorBot(bot, config) {
        const tasks = [];
        
        if (!config) return tasks;

        let currentLinkIndex = 0;
        let counters = { purple: 0, pink: 0 };

        // Função para enviar sinal
        const sendSignal = async () => {
            try {
                const links = config.links || [];
                const brands = config.brands || {};
                const channel = config.channel || '@sinaisaviatormoza';
                const image = config.image || 'https://imgur.com/a/uYNMXKF';

                // Selecionar link atual
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

                // Aguardar 2 segundos
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

        // Agendar envio de sinais
        const interval = config.interval || 180; // 3 minutos por padrão
        const task = setInterval(sendSignal, interval * 1000);
        tasks.push({ stop: () => clearInterval(task) });

        // Iniciar imediatamente
        setTimeout(sendSignal, 5000);

        return tasks;
    }

    static createKeyboard(buttons) {
        if (!Array.isArray(buttons)) return {};

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

        return { inline_keyboard: inlineKeyboard };
    }
}

// ==================== API ENDPOINTS ====================

// Criar novo bot
app.post('/api/bots', async (req, res) => {
    try {
        const config = req.body;
        const botId = `bot_${Date.now()}_${uuidv4().split('-')[0]}`;

        // Validar configuração
        const validation = JSONInterpreter.validateConfig(config);
        
        if (validation.errors.length > 0) {
            return res.status(400).json({
                success: false,
                errors: validation.errors,
                warnings: validation.warnings
            });
        }

        // Criar instância do bot
        const { bot, tasks } = JSONInterpreter.createBotInstance(config, botId);

        // Configurar webhook
        const webhookSetup = await setupWebhook(config.bot.token, botId);
        
        if (!webhookSetup) {
            return res.status(500).json({
                success: false,
                error: 'Falha ao configurar webhook'
            });
        }

        // Iniciar bot
        await bot.launch({
            webhook: {
                domain: BASE_URL,
                port: PORT,
                path: `/webhook/${botId}`
            }
        });

        // Armazenar no banco de dados
        botsDB.set(botId, {
            id: botId,
            name: config.bot.name || 'Bot sem nome',
            token: config.bot.token,
            config: config,
            type: config.type || 'simple',
            status: 'running',
            tasks: tasks,
            created: new Date(),
            webhook: `${BASE_URL}/webhook/${botId}`
        });

        botInstances.set(botId, bot);

        res.json({
            success: true,
            botId: botId,
            name: config.bot.name,
            type: config.type || 'simple',
            webhook: `${BASE_URL}/webhook/${botId}`,
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

// Listar todos os bots
app.get('/api/bots', (req, res) => {
    const bots = Array.from(botsDB.values()).map(bot => ({
        id: bot.id,
        name: bot.name,
        type: bot.type,
        status: bot.status,
        created: bot.created,
        channel: bot.config.bot?.channel || bot.config.aviator_config?.channel,
        commands: Object.keys(bot.config.commands || {}).length,
        scheduled: (bot.config.schedule || []).length
    }));

    res.json({
        success: true,
        count: bots.length,
        bots: bots
    });
});

// Controlar bot (start/stop)
app.post('/api/bots/:id/control', async (req, res) => {
    try {
        const botId = req.params.id;
        const { action } = req.body;

        const botData = botsDB.get(botId);
        if (!botData) {
            return res.status(404).json({
                success: false,
                error: 'Bot não encontrado'
            });
        }

        const bot = botInstances.get(botId);

        switch (action) {
            case 'stop':
                if (bot) {
                    bot.stop();
                    botInstances.delete(botId);
                }
                botData.status = 'stopped';
                botData.tasks.forEach(task => task.stop());
                break;

            case 'start':
                if (!bot) {
                    const { bot: newBot, tasks } = JSONInterpreter.createBotInstance(botData.config, botId);
                    await newBot.launch({
                        webhook: {
                            domain: BASE_URL,
                            port: PORT,
                            path: `/webhook/${botId}`
                        }
                    });
                    botInstances.set(botId, newBot);
                    botData.tasks = tasks;
                }
                botData.status = 'running';
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Ação inválida'
                });
        }

        botsDB.set(botId, botData);

        res.json({
            success: true,
            action: action,
            status: botData.status
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
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
            if (bot) {
                bot.stop();
                botInstances.delete(botId);
            }

            // Parar tarefas
            botData.tasks.forEach(task => task.stop());

            // Remover webhook
            await removeWebhook(botData.token);

            // Remover do banco de dados
            botsDB.delete(botId);
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

// Endpoint de webhook
app.post('/webhook/:botId', async (req, res) => {
    try {
        const botId = req.params.botId;
        const bot = botInstances.get(botId);

        if (bot) {
            bot.handleUpdate(req.body);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.sendStatus(200); // Sempre responde 200 para o Telegram
    }
});

// Validação de JSON
app.post('/api/validate', (req, res) => {
    try {
        const config = req.body;
        const validation = JSONInterpreter.validateConfig(config);

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
            error: 'JSON inválido: ' + error.message
        });
    }
});

// ==================== INTERFACE WEB ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
║  🎨 Interface moderna                    ║
║  🚀 Multi-bot simultâneo                 ║
╚══════════════════════════════════════════╝
    `);
});