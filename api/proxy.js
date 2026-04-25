const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing ?url= parameter' });
    }

    try {
        const target = new URL(targetUrl);
        const isHttps = target.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const options = {
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
            },
        };

        if (req.headers['authorization']) {
            options.headers['Authorization'] = req.headers['authorization'];
        }

        const proxyReq = httpModule.request(targetUrl, options, (proxyRes) => {
            // Forward status and headers
            res.status(proxyRes.statusCode);
            
            const contentType = proxyRes.headers['content-type'];
            if (contentType) res.setHeader('Content-Type', contentType);
            
            if (contentType && contentType.includes('text/event-stream')) {
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
            }

            // Pipe the response
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err);
            if (!res.headersSent) {
                res.status(502).json({ error: 'Proxy error: ' + err.message });
            }
        });

        // Forward request body if it exists
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            proxyReq.write(body);
        }
        
        proxyReq.end();
    } catch (err) {
        console.error('Handler error:', err);
        res.status(500).json({ error: 'Internal error: ' + err.message });
    }
};
