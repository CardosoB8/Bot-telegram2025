/**
 * Substitui placeholders dinâmicos por dados reais do contexto do Telegram
 */
const parseMessage = (text, ctx, botName) => {
    if (!text) return "";
    
    const replacements = {
        '{user_name}': ctx.from.username || ctx.from.first_name,
        '{first_name}': ctx.from.first_name,
        '{bot_name}': botName,
        '{chat_id}': ctx.chat.id
    };

    let formatted = text;
    for (const [key, value] of Object.entries(replacements)) {
        formatted = formatted.split(key).join(value);
    }
    return formatted;
};

module.exports = { parseMessage };