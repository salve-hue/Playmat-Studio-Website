/**
 * Playmat Studio — Contact Form Worker
 * Deploy to: contact.playmatstudio.com (Cloudflare Workers)
 *
 * Environment variable required:
 *   RESEND_API_KEY  — set in Cloudflare dashboard → Workers → Settings → Variables
 *
 * The API key below is the default fallback only; use the env var in production.
 */

const TO_EMAIL   = 'support@rubicongamesupplies.com';
const FROM_EMAIL = 'Playmat Studio <noreply@playmatstudio.com>';

const ALLOWED_ORIGINS = [
  'https://playmatstudio.com',
  'https://www.playmatstudio.com',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    // Parse body
    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, origin);
    }

    const name    = (data.name    ?? '').toString().slice(0, 200).trim();
    const email   = (data.email   ?? '').toString().slice(0, 200).trim();
    const message = (data.message ?? '').toString().slice(0, 4000).trim();

    if (!name || !email || !message) {
      return json({ error: 'name, email, and message are required' }, 400, origin);
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid email address' }, 400, origin);
    }

    const apiKey = env.RESEND_API_KEY ?? 're_PVNYdB3i_3mhFGFE4a2UXw1a9kFfij9oz';

    const resendPayload = {
      from:     FROM_EMAIL,
      to:       [TO_EMAIL],
      reply_to: email,
      subject:  `Playmat Studio contact form — ${name}`,
      text:     `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html:     `<p><strong>Name:</strong> ${escHtml(name)}</p>
<p><strong>Email:</strong> <a href="mailto:${escHtml(email)}">${escHtml(email)}</a></p>
<hr/>
<p style="white-space:pre-wrap">${escHtml(message)}</p>`,
    };

    let resendRes;
    try {
      resendRes = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(resendPayload),
      });
    } catch (err) {
      return json({ error: 'Failed to reach mail service' }, 502, origin);
    }

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => '');
      console.error('Resend error', resendRes.status, detail);
      return json({ error: 'Mail service error' }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
