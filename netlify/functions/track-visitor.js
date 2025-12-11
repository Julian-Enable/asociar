const https = require('https');

function getLocation(ip) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'ipapi.co',
            path: `/${ip}/json/`,
            method: 'GET'
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
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
        const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';

        const TRACKING_BOT_TOKEN = process.env.TRACKING_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!TRACKING_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            console.error('Missing environment variables');
            return { statusCode: 200, headers, body: JSON.stringify({ success: false }) };
        }

        let locationData;
        try {
            locationData = await getLocation(ip);
        } catch (error) {
            console.error('Location error:', error);
            locationData = { city: 'Unknown', country_name: 'Unknown', latitude: 0, longitude: 0 };
        }

        const fecha = new Date().toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires'
        });

        const message = `🌍 <b>NUEVO VISITANTE</b>

📍 <b>IP:</b> ${ip}
🏙️ <b>Ciudad:</b> ${locationData.city || 'Unknown'}
🌎 <b>País:</b> ${locationData.country_name || 'Unknown'}
📌 <b>Coordenadas:</b> ${locationData.latitude}, ${locationData.longitude}
🕐 <b>Fecha:</b> ${fecha}

${locationData.latitude && locationData.longitude ? `🗺️ <a href="https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}">Ver en Google Maps</a>` : ''}`;

        await sendToTelegram(TRACKING_BOT_TOKEN, TELEGRAM_CHAT_ID, message);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: false })
        };
    }
};
