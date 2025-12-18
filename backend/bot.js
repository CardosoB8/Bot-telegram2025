const { Telegraf, Markup } = require('telegraf');

let botInstance = null;

const parseMessage = (text, ctx, botName) => {
    if (!text) return "";
    return text
        .replace(/{user_name}/g, ctx.from.username || ctx.from.first_name)
        .replace(/{first_name}/g, ctx.from.first_name)
        .replace(/{bot_name}/g, botName)
        .replace(/{chat_id}/g, ctx.chat.id);
};

const createButtons = (buttons) => {
    if (!buttons || buttons.length === 0) return null;
    return Markup.inlineKeyboard(
        buttons.map(btn => [Markup.button.url(btn.text, btn.url)])
    );
};

const setupBot = (config) => {
    if (botInstance) {
        botInstance.stop('RELOAD');
    }

    if (!config.bot.token) return null;

    const bot = new Telegraf(config.bot.token);
    const botName = config.bot.name;

    // Registrar Comandos Dinamicamente
    Object.keys(config.commands).forEach(cmd => {
        bot.command(cmd, (ctx) => {
            const cmdData = config.commands[cmd];
            const message = parseMessage(cmdData.message, ctx, botName);
            const buttons = createButtons(cmdData.buttons);
            
            ctx.reply(message, buttons);
        });
    });

    bot.launch();
    botInstance = bot;
    console.log(`✅ Bot ${botName} online!`);
    return bot;
};

module.exports = { setupBot, parseMessage, createButtons };