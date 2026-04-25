// Vercel Serverless Function: CORS Proxy for LM Studio API
// Handles both regular and streaming responses

export default async function handler(req, res) {
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
        const headers = { 'Content-Type': 'application/json' };
        if (req.headers['authorization']) {
            headers['Authorization'] = req.headers['authorization'];
        }

        const fetchOptions = {
            method: req.method,
            headers,
        };

        if (req.method === 'POST' && req.body) {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);

        // Check if streaming response
        const contentType = response.headers.get('content-type') || '';
        const isStream = contentType.includes('text/event-stream');

        // Forward status
        res.status(response.status);
        res.setHeader('Content-Type', contentType || 'application/json');

        if (isStream) {
            // Stream the response
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Transfer-Encoding', 'chunked');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    res.write(chunk);
                }
            } catch (e) {
                // Client disconnected or stream error
            } finally {
                res.end();
            }
        } else {
            const data = await response.text();
            res.send(data);
        }
    } catch (err) {
        res.status(502).json({ error: 'Proxy error: ' + err.message });
    }
}
