let config = {};

// Carregar dados da API
async function loadConfig() {
    const response = await fetch('/config');
    config = await response.json();
    renderUI();
}

function renderUI() {
    document.getElementById('bot_name').value = config.bot.name;
    document.getElementById('bot_token').value = config.bot.token;
    document.getElementById('bot_channel').value = config.bot.default_channel;

    // Renderizar Comandos
    const cmdList = document.getElementById('commands-list');
    cmdList.innerHTML = '';
    Object.keys(config.commands).forEach(key => {
        const cmd = config.commands[key];
        cmdList.innerHTML += `
            <div class="block">
                <input type="text" value="${key}" placeholder="comando" onchange="updateCmdKey('${key}', this.value)">
                <textarea onchange="config.commands['${key}'].message = this.value">${cmd.message}</textarea>
                <button onclick="deleteCommand('${key}')">Remover</button>
            </div>
        `;
    });

    // Renderizar Agendamentos
    const schList = document.getElementById('schedule-list');
    schList.innerHTML = '';
    config.auto_messages.forEach((msg, index) => {
        schList.innerHTML += `
            <div class="block">
                <input type="time" value="${msg.time}" onchange="config.auto_messages[${index}].time = this.value">
                <input type="text" value="${msg.target}" onchange="config.auto_messages[${index}].target = this.value">
                <textarea onchange="config.auto_messages[${index}].message = this.value">${msg.message}</textarea>
                <button onclick="config.auto_messages.splice(${index},1); renderUI()">Remover</button>
            </div>
        `;
    });

    document.getElementById('json-preview').innerText = JSON.stringify(config, null, 2);
}

async function saveConfig() {
    config.bot.name = document.getElementById('bot_name').value;
    config.bot.token = document.getElementById('bot_token').value;
    config.bot.default_channel = document.getElementById('bot_channel').value;

    await fetch('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    alert("Bot Atualizado com Sucesso!");
    loadConfig();
}

function addCommand() {
    config.commands["novo_comando"] = { message: "Olá!", buttons: [] };
    renderUI();
}

function addSchedule() {
    config.auto_messages.push({ type: "schedule", time: "12:00", message: "Mensagem!", target: "@canal" });
    renderUI();
}

loadConfig();