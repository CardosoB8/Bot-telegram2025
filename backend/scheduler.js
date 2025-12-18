const cron = require('node-cron');
let scheduledJobs = [];

function initScheduler(config) {
    // Limpar jobs anteriores
    scheduledJobs.forEach(job => job.stop());
    scheduledJobs = [];
    
    if (!config.auto_messages || !Array.isArray(config.auto_messages)) {
        return;
    }
    
    const { getBot } = require('./bot');
    
    config.auto_messages.forEach((msg, index) => {
        if (msg.type === 'schedule' && msg.time && msg.message && msg.target) {
            try {
                // Converter formato HH:MM para cron expression
                const [hour, minute] = msg.time.split(':');
                const cronExpression = `${minute} ${hour} * * *`;
                
                const job = cron.schedule(cronExpression, async () => {
                    const bot = getBot();
                    if (bot) {
                        try {
                            await bot.telegram.sendMessage(msg.target, msg.message);
                            console.log(`📅 Mensagem agendada enviada para ${msg.target}`);
                        } catch (error) {
                            console.error(`❌ Erro ao enviar mensagem agendada:`, error.message);
                        }
                    }
                });
                
                scheduledJobs.push(job);
                console.log(`⏰ Agendamento ${index + 1} configurado para ${msg.time}`);
            } catch (error) {
                console.error(`❌ Erro ao configurar agendamento ${index + 1}:`, error.message);
            }
        }
    });
}

module.exports = {
    initScheduler
};