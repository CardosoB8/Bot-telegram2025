const cron = require('node-cron');

let jobs = [];

const setupScheduler = (config, bot) => {
    // Limpar agendamentos antigos
    jobs.forEach(job => job.stop());
    jobs = [];

    if (!bot || !config.auto_messages) return;

    config.auto_messages.forEach(msg => {
        if (msg.type === 'schedule') {
            const [hour, minute] = msg.time.split(':');
            // Formato Cron: Minuto Hora * * *
            const cronTime = `${minute} ${hour} * * *`;

            const job = cron.schedule(cronTime, () => {
                bot.telegram.sendMessage(msg.target, msg.message);
                console.log(`[Agendamento] Mensagem enviada para ${msg.target}`);
            });
            jobs.push(job);
        }
    });
    console.log(`⏰ ${jobs.length} agendamentos ativos.`);
};

module.exports = { setupScheduler };