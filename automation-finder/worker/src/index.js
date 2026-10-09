/* Cloudflare Worker: proxies the Fuse Hub automation tools to their Power
   Automate flows, the same way bullhorn-category-proxy does for Bullhorn
   Categorisation. It keeps each flow's signed HTTP-trigger URL (with its
   sig= token) out of the public GitHub Pages frontend.

   Routes:
     /api/ask    Automation Finder questions and register reads
                 -> POWER_AUTOMATE_FINDER_URL (../FLOW_SPEC.md)
     /api/check  "Checked - looks fine" ticks: writes today's date to
                 Last Checked in the register
                 -> POWER_AUTOMATE_CHECK_URL (../CHECK_FLOW_SPEC.md)

   Set the flow URLs as secrets (never commit them):
     wrangler secret put POWER_AUTOMATE_FINDER_URL
     wrangler secret put POWER_AUTOMATE_CHECK_URL

   See ../DEPLOY.md for the full setup. */

const ALLOWED_ORIGIN = 'https://fuserecruitment.github.io';

/* A conversation is a few short questions and answers. Anything much bigger
   isn't coming from the page, so don't pass it on to the flow. */
const MAX_BODY_BYTES = 50000;

const ROUTES = {
  '/api/ask': 'POWER_AUTOMATE_FINDER_URL',
  '/api/check': 'POWER_AUTOMATE_CHECK_URL',
};
const RECORDS = ['Candidate', 'Sales Contact', 'Placement', 'Job', 'Submission'];
const AUTOMATION_URL = /^https:\/\/app\.herefish\.com\/Automations\/Automation\/\d+\/?$/;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

/* Only pass a tick on if it names a real record type and a Bullhorn
   Automation link, and rebuild the body so nothing else gets through. */
function checkBody(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const record = String((data && data.record) || '').trim();
  const url = String((data && data.url) || '').trim();
  if (!RECORDS.includes(record) || !AUTOMATION_URL.test(url)) return null;
  return JSON.stringify({ record, url });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const secret = ROUTES[url.pathname];
    if (!secret || request.method !== 'POST') {
      return json({ error: 'Not found' }, 404);
    }

    if (!env[secret]) {
      return json({ error: 'Worker is missing the ' + secret + ' secret' }, 500);
    }

    let body;
    try {
      body = await request.text();
    } catch {
      return json({ error: 'Invalid request body' }, 400);
    }
    if (body.length > MAX_BODY_BYTES) {
      return json({ error: 'Request is too large' }, 413);
    }
    if (url.pathname === '/api/check') {
      body = checkBody(body);
      if (!body) return json({ error: 'Expected a record type and an automation link' }, 400);
    }

    let flowResponse;
    try {
      flowResponse = await fetch(env[secret], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      return json({ error: 'Failed to reach the Power Automate flow' }, 502);
    }

    if (!flowResponse.ok) {
      return json({ error: 'Flow returned ' + flowResponse.status }, 502);
    }

    // Pass the flow's response straight through: /api/ask returns
    // { "reply": "...", "automations": [...] } per FLOW_SPEC.md, and
    // /api/check returns { "checked": "YYYY-MM-DD" } per CHECK_FLOW_SPEC.md.
    const data = await flowResponse.text();
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
