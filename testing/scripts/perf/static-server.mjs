// Serves docs/ the way GitHub Pages does, to test the production build as deployed:
// static files only, Access-Control-Allow-Origin: *, Cache-Control: max-age=600,
// directory → index.html, unknown path → 404.html with status 404.
// Usage: node testing/scripts/perf/static-server.mjs [port=8090]
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, normalize, extname } from 'path';

const ROOT = join(process.cwd(), 'docs');
const PORT = Number(process.argv[2] || 8090);
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.run': 'application/octet-stream', '.zip': 'application/zip', '.mp3': 'audio/mpeg',
};

const send = async (res, file, status = 200) => {
    const body = await readFile(file);
    res.writeHead(status, {
        'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=600',
    });
    res.end(body);
};

createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = normalize(join(ROOT, path));
        if (!file.startsWith(ROOT)) throw new Error('outside root');
        const s = await stat(file).catch(() => null);
        if (s?.isDirectory()) file = join(file, 'index.html');
        if (s || (await stat(file).catch(() => null))) return await send(res, file);
        return await send(res, join(ROOT, '404.html'), 404);
    } catch (_) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end('Not found');
    }
}).listen(PORT, () => console.log(`serving docs/ on http://localhost:${PORT}`));
