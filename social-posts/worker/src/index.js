/* Cloudflare Worker: proxies the Social Post Generator to its Power Automate
   flows, the same way bullhorn-automation-finder does for the Automation
   Finder. It keeps each flow's signed HTTP-trigger URL (with its sig= token)
   out of the public GitHub Pages frontend.

   Routes:
     /api/jobs     The live jobs from the SharePoint Jobs list
                   -> POWER_AUTOMATE_JOBS_URL    (../FLOW_SPEC.md, flow 2)
     /api/caption  Two AI caption drafts for one job
                   -> POWER_AUTOMATE_CAPTION_URL (../FLOW_SPEC.md, flow 3)

   Set the flow URLs as secrets (never commit them):
     wrangler secret put POWER_AUTOMATE_JOBS_URL
     wrangler secret put POWER_AUTOMATE_CAPTION_URL

   See ./DEPLOY.md for the full setup. */

const ALLOWED_ORIGIN = 'https://fuserecruitment.github.io';

const ROUTES = {
  '/api/jobs': 'POWER_AUTOMATE_JOBS_URL',
  '/api/caption': 'POWER_AUTOMATE_CAPTION_URL',
};

/* Must match PLATFORMS and ANGLES in ../index.html. */
const PLATFORMS = ['linkedin', 'instagram', 'facebook'];
const ANGLES = ['straight', 'growth', 'culture', 'urgent'];
const JOB_ID = /^BH-\d{1,10}$/;
const MAX_BODY_BYTES = 5000;

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

function shortText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* Only pass a caption request on if it names a real job reference and a
   known platform and angle, and rebuild the body so nothing else gets
   through. */
function captionBody(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const jobId = String(data.jobId || '').trim().toUpperCase();
  const platform = String(data.platform || '').trim();
  const angle = String(data.angle || '').trim();
  if (!JOB_ID.test(jobId) || !PLATFORMS.includes(platform) || !ANGLES.includes(angle)) return null;
  return JSON.stringify({
    jobId,
    platform,
    angle,
    name: shortText(data.name, 80),
    role: shortText(data.role, 80),
    notes: shortText(data.notes, 300),
  });
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

    if (url.pathname === '/api/caption') {
      body = captionBody(body);
      if (!body) return json({ error: 'Expected a job reference, platform and angle' }, 400);
    } else {
      body = '{}';
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

    // Pass the flow's response straight through: /api/jobs returns
    // { "jobs": [...] } and /api/caption returns { "reply": "..." }
    // per ../FLOW_SPEC.md.
    const data = await flowResponse.text();
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
