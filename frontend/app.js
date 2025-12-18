class BotBuilder {
    constructor() {
        this.config = {
            bot: { name: '', token: '', default_channel: '' },
            commands: {},
            auto_messages: []
        };
        
        this.init();
    }
    
    async init() {
        this.loadConfig();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.renderBlocks();
    }
    
    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            this.config = await response.json();
            this.updateJsonEditor();
            this.renderPreview();
        } catch (error) {
            console.error('Erro ao carregar configuração:', error);
        }
    }
    
    setupEventListeners() {
        // Botões principais
        document.getElementById('saveConfig').addEventListener('click', () => this.saveConfig());
        document.getElementById('restartBot').addEventListener('click', () => this.restartBot());
        document.getElementById('testMessage').addEventListener('click', () => this.showTestModal());
        document.getElementById('applyJson').addEventListener('click', () => this.applyJson());
        
        // Modal de teste
        document.getElementById('sendTest').addEventListener('click', () => this.sendTestMessage());
        document.getElementById('closeTest').addEventListener('click', () => this.hideTestModal());
        
        // Fechar modal ao clicar fora
        document.getElementById('testModal').addEventListener('click', (e) => {
            if (e.target.id === 'testModal') {
                this.hideTestModal();
            }
        });
    }
    
    setupDragAndDrop() {
        const draggables = document.querySelectorAll('.draggable');
        const container = document.getElementById('blocksContainer');
        
        draggables.forEach(draggable => {
            draggable.addEventListener('dragstart', () => {
                draggable.classList.add('dragging');
                container.classList.add('drag-over');
            });
            
            draggable.addEventListener('dragend', () => {
                draggable.classList.remove('dragging');
                container.classList.remove('drag-over');
            });
        });
        
        container.addEventListener('dragover', e => {
            e.preventDefault();
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                container.appendChild(draggable.cloneNode(true));
            }
        });
    }
    
    renderBlocks() {
        const container = document.getElementById('blocksContainer');
        container.innerHTML = '';
        
        // Bot Info
        const botInfoBlock = this.createBlock('bot-info', 'Informações do Bot');
        botInfoBlock.innerHTML += `
            <div class="block-content">
                <div class="form-group">
                    <label>Nome do Bot</label>
                    <input type="text" class="bot-name" value="${this.config.bot?.name || ''}" 
                           placeholder="Meu Bot Incrível">
                </div>
                <div class="form-group">
                    <label>Token do Bot</label>
                    <input type="text" class="bot-token" value="${this.config.bot?.token || ''}" 
                           placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11">
                </div>
                <div class="form-group">
                    <label>Canal Padrão</label>
                    <input type="text" class="bot-channel" value="${this.config.bot?.default_channel || ''}" 
                           placeholder="@meucanal">
                </div>
            </div>
        `;
        container.appendChild(botInfoBlock);
        
        // Comandos
        Object.entries(this.config.commands || {}).forEach(([command, config]) => {
            const commandBlock = this.createBlock('command', `Comando /${command}`);
            commandBlock.innerHTML += `
                <div class="block-content">
                    <div class="form-group">
                        <label>Comando (sem /)</label>
                        <input type="text" class="command-name" value="${command}" placeholder="start">
                    </div>
                    <div class="form-group">
                        <label>Mensagem</label>
                        <textarea class="command-message" placeholder="Digite a mensagem...">${config.message || ''}</textarea>
                        <small>Variáveis: {user_name}, {first_name}, {bot_name}, {chat_id}</small>
                    </div>
                    <div class="buttons-container">
                        ${(config.buttons || []).map((btn, i) => `
                            <div class="button-item" data-index="${i}">
                                <input type="text" class="button-text" value="${btn.text}" placeholder="Texto do botão">
                                <input type="text" class="button-url" value="${btn.url}" placeholder="URL">
                                <button class="remove-button"><i class="fas fa-trash"></i></button>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-sm add-button"><i class="fas fa-plus"></i> Adicionar Botão</button>
                </div>
            `;
            container.appendChild(commandBlock);
        });
        
        // Mensagens agendadas
        (this.config.auto_messages || []).forEach((msg, index) => {
            if (msg.type === 'schedule') {
                const scheduleBlock = this.createBlock('schedule', `Agendamento ${index + 1}`);
                scheduleBlock.innerHTML += `
                    <div class="block-content">
                        <div class="form-group">
                            <label>Horário (HH:MM)</label>
                            <input type="time" class="schedule-time" value="${msg.time || '09:00'}">
                        </div>
                        <div class="form-group">
                            <label>Mensagem</label>
                            <textarea class="schedule-message" placeholder="Mensagem agendada...">${msg.message || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Destino</label>
                            <input type="text" class="schedule-target" value="${msg.target || ''}" 
                                   placeholder="@canal ou chat_id">
                        </div>
                    </div>
                `;
                container.appendChild(scheduleBlock);
            }
        });
        
        // Adicionar eventos aos blocos dinamicamente
        this.setupBlockEvents();
    }
    
    createBlock(type, title) {
        const block = document.createElement('div');
        block.className = 'block';
        block.dataset.type = type;
        block.innerHTML = `
            <div class="block-header">
                <h4><i class="fas fa-${this.getBlockIcon(type)}"></i> ${title}</h4>
                <button class="remove-block"><i class="fas fa-trash"></i></button>
            </div>
        `;
        return block;
    }
    
    getBlockIcon(type) {
        const icons = {
            'bot-info': 'info-circle',
            'command': 'terminal',
            'message': 'envelope',
            'buttons': 'th-large',
            'schedule': 'clock'
        };
        return icons[type] || 'cube';
    }
    
    setupBlockEvents() {
        // Remover blocos
        document.querySelectorAll('.remove-block').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.block').remove();
                this.updateConfigFromUI();
            });
        });
        
        // Adicionar botões
        document.querySelectorAll('.add-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const container = e.target.previousElementSibling;
                const buttonItem = document.createElement('div');
                buttonItem.className = 'button-item';
                buttonItem.innerHTML = `
                    <input type="text" class="button-text" placeholder="Texto do botão">
                    <input type="text" class="button-url" placeholder="URL">
                    <button class="remove-button"><i class="fas fa-trash"></i></button>
                `;
                container.appendChild(buttonItem);
                
                // Adicionar evento para remover botão
                buttonItem.querySelector('.remove-button').addEventListener('click', () => {
                    buttonItem.remove();
                    this.updateConfigFromUI();
                });
                
                // Adicionar eventos de input
                buttonItem.querySelectorAll('input').forEach(input => {
                    input.addEventListener('input', () => this.updateConfigFromUI());
                });
            });
        });
        
        // Input listeners
        document.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => this.updateConfigFromUI());
        });
    }
    
    updateConfigFromUI() {
        // Atualizar informações do bot
        const botName = document.querySelector('.bot-name')?.value || '';
        const botToken = document.querySelector('.bot-token')?.value || '';
        const botChannel = document.querySelector('.bot-channel')?.value || '';
        
        this.config.bot = {
            name: botName,
            token: botToken,
            default_channel: botChannel
        };
        
        // Atualizar comandos
        this.config.commands = {};
        document.querySelectorAll('.block[data-type="command"]').forEach(block => {
            const command = block.querySelector('.command-name')?.value;
            const message = block.querySelector('.command-message')?.value;
            
            if (command && message) {
                const buttons = [];
                block.querySelectorAll('.button-item').forEach(item => {
                    const text = item.querySelector('.button-text')?.value;
                    const url = item.querySelector('.button-url')?.value;
                    if (text && url) {
                        buttons.push({ text, url });
                    }
                });
                
                this.config.commands[command] = {
                    message,
                    buttons: buttons.length > 0 ? buttons : undefined
                };
            }
        });
        
        // Atualizar mensagens agendadas
        this.config.auto_messages = [];
        document.querySelectorAll('.block[data-type="schedule"]').forEach(block => {
            const time = block.querySelector('.schedule-time')?.value;
            const message = block.querySelector('.schedule-message')?.value;
            const target = block.querySelector('.schedule-target')?.value;
            
            if (time && message && target) {
                this.config.auto_messages.push({
                    type: 'schedule',
                    time,
                    message,
                    target
                });
            }
        });
        
        // Atualizar visualização
        this.updateJsonEditor();
        this.renderPreview();
    }
    
    updateJsonEditor() {
        document.getElementById('jsonEditor').value = JSON.stringify(this.config, null, 2);
    }
    
    async applyJson() {
        try {
            const jsonText = document.getElementById('jsonEditor').value;
            const newConfig = JSON.parse(jsonText);
            this.config = newConfig;
            this.renderBlocks();
            this.renderPreview();
            alert('JSON aplicado com sucesso!');
        } catch (error) {
            alert('Erro: JSON inválido!');
        }
    }
    
    renderPreview() {
        // Atualizar pré-visualização da mensagem
        const preview = document.getElementById('messagePreview');
        const firstCommand = Object.values(this.config.commands || {})[0];
        
        if (firstCommand?.message) {
            preview.innerHTML = firstCommand.message
                .replace(/{user_name}/g, '@usuário')
                .replace(/{first_name}/g, 'João')
                .replace(/{bot_name}/g, this.config.bot?.name || 'Bot')
                .replace(/{chat_id}/g, '123456789');
        } else {
            preview.textContent = 'Nenhuma mensagem configurada';
        }
        
        // Atualizar botões
        const buttonsContainer = document.getElementById('buttonsPreview');
        buttonsContainer.innerHTML = '';
        
        if (firstCommand?.buttons) {
            firstCommand.buttons.forEach(btn => {
                const button = document.createElement('a');
                button.className = 'message-button';
                button.href = '#';
                button.textContent = btn.text;
                buttonsContainer.appendChild(button);
            });
        }
    }
    
    async saveConfig() {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.config)
            });
            
            const result = await response.json();
            alert(result.message || 'Configuração salva com sucesso!');
        } catch (error) {
            alert('Erro ao salvar configuração: ' + error.message);
        }
    }
    
    async restartBot() {
        try {
            const response = await fetch('/api/restart-bot', {
                method: 'POST'
            });
            
            const result = await response.json();
            alert(result.message || 'Bot reiniciado!');
        } catch (error) {
            alert('Erro ao reiniciar bot: ' + error.message);
        }
    }
    
    showTestModal() {
        document.getElementById('testModal').classList.add('active');
    }
    
    hideTestModal() {
        document.getElementById('testModal').classList.remove('active');
    }
    
    async sendTestMessage() {
        const chatId = document.getElementById('testChatId').value;
        const message = document.getElementById('testMessageText').value;
        
        if (!chatId || !message) {
            alert('Preencha todos os campos!');
            return;
        }
        
        try {
            const response = await fetch('/api/send-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message })
            });
            
            const result = await response.json();
            if (result.success) {
                alert('✅ Mensagem de teste enviada!');
                this.hideTestModal();
            } else {
                alert('❌ Erro: ' + result.error);
            }
        } catch (error) {
            alert('Erro ao enviar mensagem: ' + error.message);
        }
    }
}

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', () => {
    new BotBuilder();
});