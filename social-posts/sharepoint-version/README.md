# Social Post Generator: SharePoint backup version

The main Social Post Generator is the hub page in `../` (on GitHub Pages).
This folder is a **backup** that works without the hub, the worker or
GitHub: a single HTML file with the jobs built into it, which opens in the
SharePoint file preview from one link. Use it if the hub version is ever
unavailable.

What it can't do, compared with the hub version:

- **No AI captions.** The SharePoint preview blocks calls to Power Automate,
  so it only offers "Copy prompt" for Copilot and a fill-in-the-blanks caption.
- **Jobs are a snapshot** from when the file was built, unless the rebuild
  flow in `docs/power-automate-setup.md` is set up.
- Its colours and layout match the Top Talent Campaign Planner, as of
  26 Nov 2026.

## What's here

| Path | What it is | In git? |
|---|---|---|
| `src/template.html` | The tool without any jobs. The rebuild flow fills in `__FUSE_DATA__`. | Yes |
| `src/logo-reverse.b64` | The Fuse logo, used when building | Yes |
| `tools/fetch_jobs.py` | Reads the live jobs from fuserecruitment.com into `data/jobs.json` | Yes |
| `tools/build.py` | Builds `dist/fuse-social-posts.html` (the file to upload) and `dist/template.html` | Yes |
| `docs/power-automate-setup.md` | Optional: an hourly flow that rebuilds the file in SharePoint | Yes |
| `tests/` | The pages used on 26 Nov 2026 to test what the SharePoint preview allows | Yes |
| `data/`, `dist/` | Job snapshot and built files. Job ads can name consultants, so these never go into the public repo. | **No** (in `.gitignore`) |

## Making a fresh copy to upload

Needs Python. In a terminal opened in this folder:

```powershell
python tools/fetch_jobs.py
```

```powershell
python tools/build.py
```

The first reads all the live jobs (about 6 minutes). The second makes
`dist/fuse-social-posts.html`. Upload that to SharePoint with the same name
and choose **Replace**, so the link stays the same.

## Keeping it in step with the hub version

The caption style rules live in `PROMPT_TEMPLATE` in `src/template.html`
here, as well as in `../index.html` and the AI prompt in `../FLOW_SPEC.md`.
If the rules change, update this copy too, or note here that it's behind.
