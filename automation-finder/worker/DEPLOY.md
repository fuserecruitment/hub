# Deploying the Automation Finder worker

Same role as `bullhorn-category-proxy` plays for Bullhorn Categorisation:
it sits between the static page (`../index.html`, on GitHub Pages) and the
Power Automate flow (`../FLOW_SPEC.md`), holding the flow's signed
HTTP-trigger URL (the one with `sig=...` in it) as a secret so it never has
to be committed to this public repo.

## One-time setup — dashboard (no installs needed)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Workers** → name it `bullhorn-automation-finder` → **Deploy** (the default "Hello World" is fine, you'll replace it next).
2. Open the new Worker → **Edit code** → replace the whole file with the contents of `src/index.js` in this folder → **Deploy**.
3. Back on the Worker's page → **Settings** → **Variables and Secrets** → **Add** → name `POWER_AUTOMATE_FINDER_URL`, type **Secret**, paste the flow's HTTP-trigger URL as the value → **Deploy**.
4. The Worker's URL is shown at the top of its page. It should be
   `https://bullhorn-automation-finder.marketing-1b3.workers.dev`, which is
   what `FLOW_URL` in `../index.html` already points at. If it's
   different, update `FLOW_URL` and push.

## One-time setup — Wrangler CLI (alternative, needs Node.js)

From this `worker/` folder:

```
wrangler login
wrangler secret put POWER_AUTOMATE_FINDER_URL
wrangler deploy
```

## Rotating the Power Automate signature later

Re-run step 3 (or `wrangler secret put POWER_AUTOMATE_FINDER_URL`) with the
new URL. Nothing on the page needs to change.

## CORS

The worker only allows requests from `https://fuserecruitment.github.io`
(see `ALLOWED_ORIGIN` in `src/index.js`). To test from a local server,
temporarily add your `http://localhost:PORT` origin there.
