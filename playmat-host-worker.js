// ============================================================
// PS File Hosting Worker
// Hosts images in R2 for 7 days, then lazily deletes them
// on next access.
//
// DEPLOY INSTRUCTIONS (Cloudflare Dashboard):
//   1. Workers & Pages → Create Worker → give it a name
//      e.g. "playmat-image-host"
//   2. Paste this entire file as the worker code
//   3. Settings → Bindings → Add binding:
//        Type:          R2 bucket
//        Variable name: BUCKET1
//        Bucket:        playmat-studio-hosting-files
//   4. Deploy → copy the worker URL
//   5. Paste the URL into tool.js as CLOUDFLARE_HOST_URL
// ============================================================

const TTL_MS   = 7 * 24 * 60 * 60 * 1000; // 7 days
const PREFIX   = 'PS File Hosting/';
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'image/gif',  'image/avif', 'image/tiff', 'image/bmp',
]);

const EXT_MAP = {
    'image/jpeg': 'jpg',  'image/png':  'png',  'image/webp': 'webp',
    'image/gif':  'gif',  'image/avif': 'avif', 'image/tiff': 'tiff',
    'image/bmp':  'bmp',
};

function cors() {
    return {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors() },
    });
}

function uid() {
    return Array.from(crypto.getRandomValues(new Uint8Array(9)))
        .map(b => b.toString(36).padStart(2, '0'))
        .join('')
        .slice(0, 12);
}

export default {
    async fetch(request, env) {
        const { method } = request;
        const path = new URL(request.url).pathname;

        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors() });
        }

        if (method === 'POST') {
            return handleUpload(request, env);
        }

        if (method === 'GET' && path.length > 1) {
            return handleServe(path.slice(1), env);
        }

        if (method === 'DELETE' && path.length > 1) {
            await env.BUCKET1.delete(PREFIX + path.slice(1));
            return json({ ok: true });
        }

        return json({ error: 'Not found' }, 404);
    },
};

async function handleUpload(request, env) {
    let form;
    try { form = await request.formData(); }
    catch { return json({ error: 'Invalid form data' }, 400); }

    const file = form.get('file') || form.get('image');
    if (!file || typeof file === 'string') {
        return json({ error: 'No file provided. Use field name "file".' }, 400);
    }

    const mime = file.type || '';
    if (!ALLOWED_TYPES.has(mime)) {
        return json({ error: 'Unsupported type: ' + mime + '. Allowed: JPG, PNG, WEBP, GIF, AVIF, TIFF, BMP.' }, 400);
    }

    const buf = await file.arrayBuffer();
    if (buf.byteLength > MAX_SIZE) {
        return json({ error: 'File exceeds the 50 MB limit.' }, 413);
    }

    const ext       = EXT_MAP[mime] || 'bin';
    const id        = uid() + '.' + ext;
    const key       = PREFIX + id;
    const now       = new Date().toISOString();
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    await env.BUCKET1.put(key, buf, {
        httpMetadata: { contentType: mime },
        customMetadata: { uploadedAt: now, originalName: file.name || 'upload' },
    });

    const fileUrl = new URL('/' + id, request.url).href;
    return json({ ok: true, url: fileUrl, id, expires: expiresAt });
}

async function handleServe(id, env) {
    if (!/^[\w.-]{1,80}$/.test(id)) {
        return json({ error: 'Invalid file id' }, 400);
    }

    const obj = await env.BUCKET1.get(PREFIX + id);
    if (!obj) return json({ error: 'File not found' }, 404);

    const { uploadedAt } = obj.customMetadata || {};
    if (uploadedAt && Date.now() - new Date(uploadedAt).getTime() > TTL_MS) {
        await env.BUCKET1.delete(PREFIX + id);
        return json({ error: 'This file has expired and been deleted.' }, 410);
    }

    const expires = uploadedAt
        ? new Date(new Date(uploadedAt).getTime() + TTL_MS).toUTCString()
        : '';

    return new Response(obj.body, {
        headers: {
            'Content-Type':  obj.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
            ...(expires ? { 'Expires': expires } : {}),
            ...cors(),
        },
    });
}
