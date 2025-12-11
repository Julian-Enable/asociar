const https = require('https');

const visitedIPs = new Map();
const IP_CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_IP_CACHE = 200;

function cleanIPCache() {
    const now = Date.now();
    for (const [ip, timestamp] of visitedIPs.entries()) {
        if (now - timestamp > IP_CACHE_DURATION_MS) {
            visitedIPs.delete(ip);
        }
    }

    if (visitedIPs.size > MAX_IP_CACHE) {
        const entries = Array.from(visitedIPs.entries());
        entries.sort((a, b) => a[1] - b[1]);
        const toDelete = entries.slice(0, entries.length - MAX_IP_CACHE);
        toDelete.forEach(([ip]) => visitedIPs.delete(ip));
    }
}

function hasVisited(ip) {
    cleanIPCache();
    return visitedIPs.has(ip);
}

function markVisited(ip) {
    visitedIPs.set(ip, Date.now());
}

function getLocation(ip) {
    return new Promise((resolve, reject) => {
        if (!ip || ip === 'unknown') {
            reject(new Error('Invalid IP'));
            return;
        }

        const options = {
            hostname: 'ipapi.co',
            path: `/${ip}/json/`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    console.log('Location API response:', parsed);
                    resolve(parsed);
                } catch (e) {
                    console.error('Parse error:', e);
                    reject(e);
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            reject(error);
        });

        req.setTimeout(8000, () => {
            req.abort();
            reject(new Error('Timeout'));
        });

        req.end();
    });
}

function sendToTelegram(botToken, chatId, message) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
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
                if (res.statusCode === 200) {
                    resolve(response);
                } else {
                    reject(new Error(`Telegram error: ${response}`));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

        console.log('Extracted IP:', ip);

        if (hasVisited(ip)) {
            console.log('IP already tracked, skipping:', ip);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, cached: true })
            };
        }

        const TRACKING_BOT_TOKEN = process.env.TRACKING_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!TRACKING_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            console.error('Missing environment variables');
            return { statusCode: 200, headers, body: JSON.stringify({ success: false }) };
        }

        let locationData = {
            city: 'Unknown',
            country_name: 'Unknown',
            latitude: null,
            longitude: null
        };

        try {
            const apiData = await getLocation(ip);
            locationData = {
                city: apiData.city || 'Unknown',
                country_name: apiData.country_name || 'Unknown',
                latitude: apiData.latitude || null,
                longitude: apiData.longitude || null,
                region: apiData.region || '',
                org: apiData.org || ''
            };
        } catch (error) {
            console.error('Location API error:', error.message);
        }

        const fecha = new Date().toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires'
        });

        let message = `🌍 <b>NUEVO VISITANTE</b>

📍 <b>IP:</b> ${ip}
🏙️ <b>Ciudad:</b> ${locationData.city}
🌎 <b>País:</b> ${locationData.country_name}`;

        if (locationData.latitude && locationData.longitude) {
            message += `
📌 <b>Coordenadas:</b> ${locationData.latitude}, ${locationData.longitude}`;
        }

        if (locationData.org) {
            message += `
🏢 <b>ISP:</b> ${locationData.org}`;
        }

        message += `
🕐 <b>Fecha:</b> ${fecha}`;

        if (locationData.latitude && locationData.longitude) {
            message += `

🗺️ <a href="https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}">Ver en Google Maps</a>`;
        }

        console.log('Sending message to Telegram...');
        await sendToTelegram(TRACKING_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
        console.log('Message sent successfully');

        markVisited(ip);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error('Handler error:', error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
