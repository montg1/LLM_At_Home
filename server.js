const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
    // CORS proxy: /proxy?url=<encoded_url>
    if (req.url.startsWith('/proxy')) {
        return handleProxy(req, res);
    }

    // Static file serving
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

function handleProxy(req, res) {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    const targetUrl = reqUrl.searchParams.get('url');

    if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('Missing ?url= parameter');
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const target = new URL(targetUrl);
    const isHttps = target.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    // Collect request body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const options = {
            hostname: target.hostname,
            port: target.port || (isHttps ? 443 : 80),
            path: target.pathname + target.search,
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
            },
        };

        // Forward auth header
        if (req.headers['authorization']) {
            options.headers['Authorization'] = req.headers['authorization'];
        }

        const proxyReq = httpModule.request(options, (proxyRes) => {
            // Check if client wants streaming
            const isStream = req.headers['accept'] === 'text/event-stream' ||
                             proxyRes.headers['content-type']?.includes('text/event-stream');

            const responseHeaders = {
                'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                'Access-Control-Allow-Origin': '*',
            };

            if (isStream) {
                responseHeaders['Cache-Control'] = 'no-cache';
                responseHeaders['Connection'] = 'keep-alive';
            }

            res.writeHead(proxyRes.statusCode, responseHeaders);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err.message);
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
    });
}

server.listen(PORT, () => {
    console.log(`\n  ⚡ LLM At Home server running!\n`);
    console.log(`  🌐 Open: http://localhost:${PORT}`);
    console.log(`  📡 CORS proxy: http://localhost:${PORT}/proxy?url=<your_api_url>`);
    console.log(`\n  Press Ctrl+C to stop.\n`);
});
