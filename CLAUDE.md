# Fuse Hub — notes for Claude

Fuse Recruitment's internal tools, hosted on GitHub Pages at
https://fuserecruitment.github.io/hub/. Each tool is a single static
`index.html` in its own folder. There is no build step.

The person working on this is Pam (Marketing Automation Specialist). She isn't
a developer and prefers GUI tools (GitHub Desktop, Power Automate, Cloudflare
dashboard) over the command line. Explain changes in plain English, and give
step-by-step instructions for anything she has to do outside the repo.

## The repo is public

- Never commit register data, candidate or client details, staff names
  attached to records, flow trigger URLs, `sig=` tokens or API keys.
- Data comes in at runtime from a Power Automate flow, through a Cloudflare
  Worker that holds the flow URL as a secret. See
  `automation-finder/FLOW_SPEC.md` and `*/worker/DEPLOY.md`.
- Workers only accept requests from `https://fuserecruitment.github.io`.
- Links to SharePoint files are fine (they need a Fuse sign-in). The
  Automation Finder and Journey Map sidebars both link to the register.

## Every page must have

1. `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">`
2. The sign-in check script in `<head>`: it reads `fuseHub.email` from
   localStorage and sends people to `../?next=...` if it's missing. Copy it
   from `automation-finder/index.html`. It's a soft gate, not security.
3. The shared navy sidebar: Fuse logo (`../fuse-logo.png`), tool name (no
   tag line under it), and a `← Back to Fuse Hub` button (`.sidebar-nav-btn.hub-back`).
4. An entry in the `TOOLS` list in the root `index.html` (sidebar + home card)
   and a row in `README.md`.

## Branding

Match `automation-finder/index.html`, the reference tool page.

- Font: Work Sans (Google Fonts), weights 300–700.
- Colours: navy `#151A36`, blue `#009CDD`, concrete `#A2C8D8`,
  steel `#E6EFF3` (page background), line `#CBD9E1`, ink-soft `#5B6178`,
  warn `#B23B3B`. Status pills: green `#1E7B4F` on `#E3F3EA` (Active),
  amber `#8A5A00` on `#FBF0D9` (Paused), ink-soft on `#EDEFF3` (Retired).
- Layout: 300px sticky navy sidebar + workspace (`padding:32px 36px 80px`),
  white cards with 1px `--line` border and 10px radius, 28px page heading.
  Below 860px the sidebar stacks on top.
- Light theme only, same as the other tool pages.
- Plain Australian English in UI copy. No emoji.

## Tools

| Folder | What it is | Data source |
|---|---|---|
| `bullhorn-category/` | Works out industry / category / sub-category for Bullhorn records | AI lookup via `bullhorn-category/worker/` |
| `automation-finder/` | Plain-English search of the Active Automation Register | `bullhorn-automation-finder` worker → Power Automate flow → register spreadsheet |
| `journeys/` | Every automation placed on the candidate and sales contact journeys, with hand-offs and gaps | Same worker and flow as Automation Finder, request body includes `"mode": "register"` |
| `present-feedback/` | Static report on the Present survey (Sept 2026) | None (static) |

### Automation Journey Map (`journeys/`)

- Stages are assigned by the number at the end of each automation's
  Herefish URL, in `STAGE_IDS`. Families (state/postcode clean-up, bulk
  category tools, Map to New Categories, Top Talent sends) are grouped by
  name in `placeAutomation()`.
- Anything not in `STAGE_IDS` and not matched by a name rule appears in a
  "Not on the map yet" column. To place it, add its ID to the right stage.
- `ALSO` lists automations shown on both journeys.
- `CONNS` (hand-offs) and `FLAGS` (gaps & checks) are hand-written and were
  last reviewed 8 Oct 2026.
- It keeps the register in localStorage (`automationJourneys.register`) and
  treats it as stale once the latest weekly update has passed. The register's
  scheduled update runs Mondays 6:00 am Philippine time, so the cutoff is
  Monday 7:00 am PHT, set as Sunday 23:00 UTC in `WEEKLY_UPDATE_UTC`. Change
  that if the schedule moves. "Try again" (shown after a failed load)
  always fetches fresh.

## Register (source data)

Active Automation Register 2026.xlsx, SharePoint Marketing site ›
BH Automation (Herefish). Sheets read by the flow: Candidate, Sales Contact,
Placement, Job, Submission (each formatted as an Excel table with the same
name, minus spaces). The flow returns
`{ reply, automations:[{record,name,status,activation,purpose,list,exclusion,days,start,end,timezone,reentry,reentryFrequency,groups,created,modified,url}] }`.

## Testing

Pages call the live worker, so to test locally serve the folder and either
use the real worker from a github.io page, or stub the `/api/ask` response in
the browser (e.g. Playwright `page.route('**/api/ask', ...)`) and set
`localStorage['fuseHub.email']` first. Check the page at 400px width too.

## Commits

Pam commits and pushes with GitHub Desktop. Keep commit messages short and
plain ("Add Automation Journey Map tool").
