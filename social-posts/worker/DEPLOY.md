# Deploying the Social Post Generator worker

Same role as `bullhorn-automation-finder` plays for the Automation Finder:
it sits between the page (on GitHub Pages) and two Power Automate flows,
holding each flow's signed HTTP-trigger URL (the one with `sig=...` in it)
as a secret so it never has to be committed to this public repo.

| Route | Used for | Secret | Flow |
|---|---|---|---|
| `/api/jobs` | Loading the live jobs | `POWER_AUTOMATE_JOBS_URL` | Flow 2 in `../FLOW_SPEC.md` |
| `/api/caption` | "Write my captions" | `POWER_AUTOMATE_CAPTION_URL` | Flow 3 in `../FLOW_SPEC.md` |

Build the flows first (`../FLOW_SPEC.md`), so you have their URLs to paste in.

## One-time setup: dashboard (no installs needed)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Workers** → name it `fuse-social-posts` → **Deploy** (the default "Hello World" is fine, you'll replace it next).
2. Open the new Worker → **Edit code** → replace the whole file with the contents of `src/index.js` in this folder → **Deploy**.
3. Back on the Worker's page → **Settings** → **Variables and Secrets** → **Add** → name `POWER_AUTOMATE_JOBS_URL`, type **Secret**, paste the "Get jobs" flow's HTTP-trigger URL as the value → **Deploy**. Do the same for `POWER_AUTOMATE_CAPTION_URL` with the "Write caption" flow's URL.
4. The Worker's URL is shown at the top of its page. It should be
   `https://fuse-social-posts.marketing-1b3.workers.dev`, which is what
   `WORKER` in `../index.html` already points at. If it's different, update
   `WORKER` and push.

## One-time setup: Wrangler CLI (alternative, needs Node.js)

From this `worker/` folder:

```
wrangler login
wrangler secret put POWER_AUTOMATE_JOBS_URL
wrangler secret put POWER_AUTOMATE_CAPTION_URL
wrangler deploy
```

## Updating the code in the dashboard

**Edit code** → select everything in `worker.js` → replace it with
`src/index.js` → **Deploy**. Secrets stay as they are.

## What the worker lets through

- `/api/jobs`: nothing from the page. It always sends the flow an empty `{}`.
- `/api/caption`: only a job reference (`BH-` and digits), a platform
  (`linkedin`, `instagram`, `facebook`), an angle (`straight`, `growth`,
  `culture`, `urgent`), and name, role and notes cut to 80, 80 and 300
  characters. Anything else is dropped. If you add a platform or angle to
  the page, add it to `PLATFORMS` / `ANGLES` in `src/index.js` too.

## CORS

The worker only allows requests from `https://fuserecruitment.github.io`
(see `ALLOWED_ORIGIN` in `src/index.js`). To test from a local server,
temporarily add your `http://localhost:PORT` origin there.
