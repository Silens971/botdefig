const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const ffmpeg = require('@ffmpeg-installer/ffmpeg');

// Inicializa o cliente guardando a sessão (assim não precisa ler o QR Code toda vez que reiniciar)
const client = new Client({
    authStrategy: new LocalAuth(),
    ffmpegPath: ffmpeg.path
});

// Gera o QR Code no terminal para você escanear com o celular do bot
client.on('qr', (qr) => {
    console.log('\n==================================================');
    console.log('🤖 Use o WhatsApp do número do bot para escanear:');
    console.log('==================================================\n');
    qrcode.generate(qr, { small: true });
});

// Avisa quando conectou com sucesso
client.on('ready', () => {
    console.log('\n==================================================');
    console.log('✅ Bot conectado e pronto para criar figurinhas!');
    console.log('==================================================\n');
});

// Escuta apenas mensagens recebidas (ignora as que o próprio bot envia)
client.on('message', async msg => {
    // Verifica se a mensagem tem alguma mídia (foto, vídeo, gif)
    if (msg.hasMedia) {
        try {
            console.log(`Recebi uma mídia de ${msg.from}. Baixando...`);
            // Baixa a foto ou vídeo
            const media = await msg.downloadMedia();
            
            if (media) {
                console.log('Mídia baixada! Convertendo e enviando como figurinha...');
                // Envia de volta no mesmo chat como figurinha
                await client.sendMessage(msg.from, media, { 
                    sendMediaAsSticker: true,
                    stickerName: 'Figurinha', // Nome que aparece na figurinha
                    stickerAuthor: 'Meu Bot'         // Autor da figurinha
                });
            }
        } catch (error) {
            console.error('Erro ao fazer a figurinha:', error);
            msg.reply('Ops! Deu um erro ao tentar criar a figurinha. Certifique-se de que o FFMPEG está instalado no seu computador.');
        }
    } else {
        // Se a pessoa só mandou texto, responde com as instruções curtas
        msg.reply('🤖 *Olá! Eu sou um bot criador de figurinhas.*\n\n*Como usar:* É só me enviar qualquer imagem, vídeo curto ou GIF e eu devolvo como figurinha na mesma hora, sem precisar de comandos!');
    }
});

// Dá a partida no bot
client.initialize();
