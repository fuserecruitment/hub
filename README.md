# Fuse Hub

The main menu for Fuse Recruitment's internal tools, hosted on GitHub Pages at
https://fuserecruitment.github.io/hub/

People enter their `@fuserecruitment.com` email the first time they open the
hub (no password). It's saved in their browser, and each tool checks for it
and sends people back to the hub if it's missing. This keeps casual visitors
out. It is **not** real security: the repo is public, so don't put
confidential content here.

## Tools

| Tool | Where it lives | Link |
|---|---|---|
| Bullhorn Categorisation | `bullhorn-category/` (its AI proxy worker is in `bullhorn-category/worker/`) | https://fuserecruitment.github.io/hub/bullhorn-category/ |
| Automation Finder | `automation-finder/` (worker in `automation-finder/worker/`, flow setup in `automation-finder/FLOW_SPEC.md`) | https://fuserecruitment.github.io/hub/automation-finder/ |
| Automation Journey Map | `journeys/` (reads the register through the Automation Finder worker; stages are set in `STAGE_IDS` in its `index.html`; the "Might need update" flags come from `shared/automation-checks.js`, which the Automation Finder uses too) | https://fuserecruitment.github.io/hub/journeys/ |
| Present Feedback Review | `present-feedback/` | https://fuserecruitment.github.io/hub/present-feedback/ |
| Candidate Email Audit | `candidate-emails/` | https://fuserecruitment.github.io/hub/candidate-emails/ |
| Social Post Generator | `social-posts/` (worker in `social-posts/worker/`, SharePoint list and flow setup in `social-posts/FLOW_SPEC.md`; a standalone SharePoint backup version in `social-posts/sharepoint-version/`) | https://fuserecruitment.github.io/hub/social-posts/ |

The home page groups tools under **For everyone** (Bullhorn Categorisation
and the Social Post Generator) and **Marketing** (everything else, plus a link to the
[Top Talent Campaign Planner](https://fuserecruitment.github.io/top-talent/),
which lives in its own repo).

Only people on the marketing list see the Marketing group. The list is
`MARKETING_EMAIL_HASHES` in `index.html`: each email is stored as a SHA-256
hash, so no addresses are published in this public repo. To add someone,
ask Claude to hash their email and add it. This only hides the menu: anyone
with a tool's link can still open it.

Bullhorn Categorisation used to live in its own repo,
[fuserecruitment/bullhorn-category](https://github.com/fuserecruitment/bullhorn-category).
It was moved here with its history, and the old address now redirects here.

## Adding a tool

1. Put the tool in its own folder in this repo.
2. Add an entry to the `TOOLS` list near the top of the script in `index.html`,
   with `group: 'everyone'` or `group: 'marketing'`. It shows up in the
   sidebar and as a card on the home page, under that group.
3. In the tool's page, add the `noindex` robots tag and sign-in check to `<head>`, and the shared
   sidebar with a "Back to Fuse Hub" link. Copy both from
   `present-feedback/index.html`.

## Keeping it out of search engines

Every page has `<meta name="robots" content="noindex, nofollow, ...">`, which
stops search engines and well-behaved bots from listing it. Add the same tag
to any new page.
