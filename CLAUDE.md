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
- The only thing the hub writes to the register is the Last Checked date,
  through the worker's `/api/check` route and its own flow
  (`automation-finder/CHECK_FLOW_SPEC.md`). The worker only passes on a known
  record type and a Herefish automation link.
- Links to SharePoint files are fine (they need a Fuse sign-in). The
  Automation Finder and Journey Map sidebars both link to the register.

## Every page must have

1. `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">`
2. The sign-in check script in `<head>`: it reads `fuseHub.email` from
   localStorage and sends people to `../?next=...` if it's missing. Copy it
   from `automation-finder/index.html`. It's a soft gate, not security.
   The hub sign-in also asks for a first name (`fuseHub.name`), used for the
   home page greeting ("How can I make your work easier today, Sam?") and to
   prefill names in tools. People signed in before it was added are asked
   for it once, with their email filled in.
3. The shared navy sidebar: Fuse logo (`../fuse-logo.png`), tool name (no
   tag line under it), and a `← Back to Fuse Hub` button (`.sidebar-nav-btn.hub-back`).
4. An entry in the `TOOLS` list in the root `index.html` (sidebar + home card)
   with its `group`, and a row in `README.md`. Groups (`GROUPS`): `everyone`
   is only Bullhorn Categorisation, the one tool the whole team uses;
   everything else is `marketing`. Groups organise the menu, they don't
   restrict access.

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
| `journeys/` | One page: candidate and sales contact journeys as flowcharts (steps, hand-offs, recommendations, active automations by stage with "Might need update" flags) | Same worker and flow as Automation Finder, request body includes `"mode": "register"` |
| `present-feedback/` | Static report on the Present survey (Sept 2026) | None (static) |
| `candidate-emails/` | Static audit of the Active and Passive candidate email workflows (Oct 2026): click rates, proposed per-stage flows, content to create | None (static, data baked into the page) |
| `social-posts/` | Social Post Generator: pick a live job from fuserecruitment.com, get two AI caption drafts (or copy a prompt for Copilot) | `fuse-social-posts` worker → "Get jobs" / "Write caption" flows → SharePoint Jobs list (kept in step with the website by an hourly "Sync jobs" flow). See `social-posts/FLOW_SPEC.md` |
| `shared/` | Code used by more than one tool (no page of its own) | None |

### Social Post Generator (`social-posts/`)

- Job data is never committed: job ads can name consultants. It reaches the
  page at runtime from the Jobs list via `/api/jobs`, and is kept in
  sessionStorage for an hour (`JOBS_CACHE_MINUTES`).
- `/api/caption` only passes on a job reference, a platform, an angle and
  short name/role/notes (see the worker). The flow looks the job up itself,
  so the page never sends job text to the AI.
- Platform and angle keys live in three places that must match: `PLATFORMS` /
  `ANGLES` in the page, the same lists in `worker/src/index.js`, and the AI
  Builder prompt in `FLOW_SPEC.md` step 3.4. The style rules are also in the
  page's Copilot prompt (`PROMPT_TEMPLATE`).
- The AI returns two drafts separated by a line containing only `---`.
- `sharepoint-version/` is a backup, kept "in case": a standalone HTML file
  with a job snapshot built in, for the SharePoint file preview (no AI, as
  the preview blocks flow calls). See its README. Its `data/` and `dist/`
  hold job ads and are git-ignored; never commit them. It isn't a hub page,
  so it has no sign-in check, sidebar or `TOOLS` entry.
- Other post types (multiple jobs, top talent, testimonials, blogs) show as
  "Soon" in the sidebar. Images come later, once the post templates are
  designed; photos will come from a SharePoint folder.

### Automation checks (`shared/automation-checks.js`)

- Works out which automations look out of date, unfinished or inconsistent
  (old sends, temporary ones still running, long-paused or stale drafts,
  missing register details, contradictory dates, past-FY names, duplicates).
  Every flag is labelled "Might need update"; its colour and group (Check
  first, Tidy up, When there's time) show how urgent. Retired automations
  are never flagged.
- Used by the Automation Finder (a label and reasons on each answer card) and
  the Journey Map (a label on step chips and cards; each stage's automation
  list counts and puts flagged ones first).
- Marking one as checked: the **Checked – looks fine** tick box (Journey Map
  cards, Automation Finder answers) calls `markChecked()`, which goes
  worker `/api/check` → "Mark checked" flow (`automation-finder/CHECK_FLOW_SPEC.md`)
  → writes today's date to **Last Checked** in the register, matched by
  Automation URL. A date typed into the register directly works too. The flag
  is hidden for `LIMITS.recheckDays` (90) days, or until the automation's Date
  Last Modified is after that date. Automations with no link can't be ticked
  (the flow needs the link to find the row).
- Thresholds are in `LIMITS`, word lists in `SENDS` / `SEASONAL`. Change them
  there; both pages pick it up. Automations are matched between pages with
  `keyFor()` (the number at the end of the Herefish URL).

### Automation Journey Map (`journeys/`)

- Stages are assigned by the number at the end of each automation's
  Herefish URL, in `STAGE_IDS`. Families (state/postcode clean-up, bulk
  category tools, Map to New Categories, Top Talent sends) are grouped by
  name in `placeAutomation()`.
- Anything not in `STAGE_IDS` and not matched by a name rule appears in a
  "Not on the map yet" section at the bottom of the page. To place it, add
  its ID to the right stage.
- `ALSO` lists automations shown on both journeys.
- One page, read top to bottom: the Candidate journey, then the Sales contact
  journey (`#cand`, `#sales` jump to them), then "Not on the map yet". Each
  journey is a flowchart, hand-written in `FLOW` (reviewed 29 Oct 2026, paused
  workflows added as recommendations 24 Nov 2026): one person's path, grouped
  by the stage keys in `JOURNEYS`, with decisions, field changes and
  hand-offs to the other journey. Under each stage heading, "All N active
  automations" folds out the stage's list from the register, flagged ones
  first; the search box opens the stages with matches.
- Only Active automations are shown (`state.show`). Paused workflows are left
  off; where one matters it's named in a recommendation instead.
- Recommendations (purple, `--sugg`, a colour used only for them) combine
  notes (`note`: `['Gap' | 'Fix' | 'Check', text]`) and suggested new
  workflows (`sugg`, or a `k:'sugg'` node). "Show recommendations" hides them.
- Tabs removed in Nov 2026 (column view, Flowchart, How they connect, Gaps &
  checks, Might need update) were duplicates of this page; old `#flow`,
  `#conn`, `#flags` and `#checks` links open at the top.
- It keeps the register in localStorage (`automationJourneys.register`) and
  treats it as stale once the latest weekly update has passed. The register's
  scheduled update runs Mondays 6:00 am Philippine time, so the cutoff is
  Monday 7:00 am PHT, set as Sunday 23:00 UTC in `WEEKLY_UPDATE_UTC`. Change
  that if the schedule moves. "Try again" (shown after a failed load)
  always fetches fresh.

## Register (source data)

Active Automation Register 2026.xlsx, SharePoint Marketing site ›
BH Automation (Herefish). Sheets read by the flow: Candidate, Sales Contact,
Placement, Job, Submission (Excel tables `Table1`–`Table5`, in that order).
The Hibernated sheet (about 1,400 hibernated automations, its own columns) is
deliberately not read: it would swamp the AI prompt and the Journey Map.
The flow returns
`{ reply, automations:[{record,name,status,activation,purpose,list,exclusion,days,start,end,timezone,reentry,reentryFrequency,groups,created,modified,url,checked}] }`.
`checked` is the register's **Last Checked** column (date someone last
reviewed it), used by the shared checks to hide a flag for 90 days.

## Testing

Pages call the live worker, so to test locally serve the folder and either
use the real worker from a github.io page, or stub the `/api/ask` response in
the browser (e.g. Playwright `page.route('**/api/ask', ...)`) and set
`localStorage['fuseHub.email']` first. Check the page at 400px width too.

## Commits

Pam commits and pushes with GitHub Desktop. Keep commit messages short and
plain ("Add Automation Journey Map tool").
