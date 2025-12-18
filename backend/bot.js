const { Telegraf } = require('telegraf');
const path = require('path');

let bot = null;
let currentConfig = {};

function replaceVariables(text, context) {
    if (!text) return '';
    
    const variables = {
        '{user_name}': context.username || context.first_name || 'Usuário',
        '{first_name}': context.first_name || 'Usuário',
        '{bot_name}': currentConfig.bot?.name || 'Bot',
        '{chat_id}': context.chatId || '',
    };
    
    return text.replace(/{(\w+)}/g, (match, key) => {
        const varName = `{${key}}`;
        return variables[varName] !== undefined ? variables[varName] : match;
    });
}

async function initBot(config) {
    currentConfig = config;
    
    // Parar bot anterior se existir
    if (bot) {
        bot.stop();
    }
    
    // Verificar se token existe
    if (!config.bot?.token) {
        console.log('⚠️ Token não configurado. Bot não iniciado.');
        return null;
    }
    
    try {
        bot = new Telegraf(config.bot.token);
        
        // Configurar comandos
        setupCommands(bot, config);
        
        // Iniciar bot
        await bot.launch();
        console.log('🤖 Bot iniciado com sucesso!');
        
        return bot;
    } catch (error) {
        console.error('❌ Erro ao iniciar bot:', error.message);
        return null;
    }
}

function setupCommands(botInstance, config) {
    // Comando /start padrão
    botInstance.start((ctx) => {
        const command = config.commands?.start;
        if (command) {
            const message = replaceVariables(command.message, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                chatId: ctx.chat.id
            });
            
            if (command.buttons && command.buttons.length > 0) {
                const buttons = command.buttons.map(btn => {
                    return [{ text: btn.text, url: btn.url }];
                });
                
                return ctx.reply(message, {
                    reply_markup: {
                        inline_keyboard: buttons
                    }
                });
            }
            
            return ctx.reply(message);
        }
    });
    
    // Outros comandos
    if (config.commands) {
        Object.entries(config.commands).forEach(([command, config]) => {
            if (command !== 'start') {
                botInstance.command(command, (ctx) => {
                    const message = replaceVariables(config.message, {
                        username: ctx.from.username,
                        first_name: ctx.from.first_name,
                        chatId: ctx.chat.id
                    });
                    
                    if (config.buttons && config.buttons.length > 0) {
                        const buttons = config.buttons.map(btn => {
                            return [{ text: btn.text, url: btn.url }];
                        });
                        
                        return ctx.reply(message, {
                            reply_markup: {
                                inline_keyboard: buttons
                            }
                        });
                    }
                    
                    return ctx.reply(message);
                });
            }
        });
    }
    
    // Middleware para logging
    botInstance.use((ctx, next) => {
        console.log(`📨 Nova mensagem de ${ctx.from?.username || ctx.from?.id}: ${ctx.message?.text}`);
        return next();
    });
}

async function updateBotConfig(newConfig) {
    currentConfig = newConfig;
    
    // Reiniciar bot com nova configuração
    if (newConfig.bot?.token) {
        return initBot(newConfig);
    }
    
    return null;
}

async function sendTestMessage(chatId, message) {
    if (!bot) {
        return { success: false, error: 'Bot não inicializado' };
    }
    
    try {
        await bot.telegram.sendMessage(chatId, message);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function restartBot() {
    if (bot) {
        bot.stop();
    }
    
    if (currentConfig.bot?.token) {
        return initBot(currentConfig);
    }
    
    return null;
}

module.exports = {
    initBot,
    updateBotConfig,
    sendTestMessage,
    restartBot,
    getBot: () => bot
};