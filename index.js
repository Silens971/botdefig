const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

async function startBot() {
    // Guarda a sessão em disco para não precisar escanear o QR Code toda vez
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Vamos gerar o QR manualmente com qrcode-terminal
    });

    // Salva as credenciais sempre que atualizar
    sock.ev.on('creds.update', saveCreds);

    // Gerencia a conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Quando o QR Code estiver disponível, mostra no terminal
        if (qr) {
            console.log('\n==================================================');
            console.log('🤖 Use o WhatsApp do número do bot para escanear:');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;

            console.log('🔴 Conexão encerrada. Reconectando...', shouldReconnect);

            if (shouldReconnect) {
                startBot(); // Tenta reconectar automaticamente
            } else {
                console.log('❌ Sessão encerrada. Apague a pasta auth_session e reinicie.');
            }
        } else if (connection === 'open') {
            console.log('\n==================================================');
            console.log('✅ Bot conectado e pronto para criar figurinhas!');
            console.log('==================================================\n');
        }
    });

    // Variável para armazenar o "tempo de espera" (cooldown) de cada usuário
    const userCooldowns = new Map();

    // Escuta as mensagens recebidas
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Ignora mensagens enviadas pelo próprio bot
            if (msg.key.fromMe) continue;

            const from = msg.key.remoteJid;

            // 1. ESCUDO: Ignora grupos (evita spam e banimento)
            if (from.endsWith('@g.us')) continue;

            // 2. ESCUDO: Rate Limit (Cooldown)
            // Impede que a pessoa mande 50 vídeos seguidos e trave a AWS
            const now = Date.now();
            const userLastMessageTime = userCooldowns.get(from) || 0;
            const cooldownAmount = 10000; // 10 segundos de espera entre mensagens

            if (now - userLastMessageTime < cooldownAmount) {
                // Se a pessoa mandar muito rápido, avisa (apenas 1 vez para não floodar)
                const timeLeft = ((cooldownAmount - (now - userLastMessageTime)) / 1000).toFixed(1);
                console.log(`⏳ Usuário ${from} está em cooldown. Tentou mandar rápido demais.`);
                continue; // Simplesmente ignora o processo para proteger a máquina
            }

            // Atualiza o tempo da pessoa
            userCooldowns.set(from, now);

            const messageContent = msg.message;

            // Detecta se a mensagem tem imagem, vídeo ou GIF (sticker animado)
            const imageMsg = messageContent?.imageMessage;
            const videoMsg = messageContent?.videoMessage;
            const stickerMsg = messageContent?.stickerMessage;

            if (imageMsg || videoMsg) {
                try {
                    console.log(`Recebi uma mídia de ${from}. Processando...`);

                    const mediaType = imageMsg ? 'image' : 'video';
                    const mediaMsg = imageMsg || videoMsg;

                    // Baixa a mídia
                    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    console.log('Convertendo para o formato correto de figurinha...');
                    // Usa a biblioteca especializada para converter perfeitamente
                    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
                    const sticker = new Sticker(buffer, {
                        pack: 'Meu Bot', // Nome do pacote
                        author: 'Figurinhas', // Autor
                        type: StickerTypes.CROPPED, // Corta quadrado para o vídeo ficar menor e leve
                        quality: videoMsg ? 15 : 60, // Baixa bem a qualidade do vídeo para não passar de 1MB!
                    });

                    const stickerBuffer = await sticker.toBuffer();

                    // Envia de volta como figurinha
                    await sock.sendMessage(from, {
                        sticker: stickerBuffer,
                    });

                    console.log('Figurinha enviada com sucesso!');
                } catch (err) {
                    console.error('Erro ao criar figurinha:', err);
                    await sock.sendMessage(from, { text: 'Ops! Deu um erro ao tentar criar a figurinha. 😅' });
                }
            } else {
                // Se for texto, responde com as instruções
                await sock.sendMessage(from, {
                    text: '🤖 *Olá! Eu sou um bot criador de figurinhas.*\n\n*Como usar:* É só me enviar qualquer imagem ou vídeo curto e eu devolvo como figurinha na mesma hora, sem precisar de comandos!'
                });
            }
        }
    });
}

startBot();
