"""Build the tool files.

1. dist/template.html: src/template.html with the logo filled in. This is the
   file that goes in SharePoint's _build folder for the rebuild flow.
2. dist/fuse-social-posts.html: the template with data/jobs.json filled in,
   exactly as the Power Automate rebuild flow does it (replace __FUSE_DATA__,
   escaping "</" so the data can't end the <script> tag early).

Usage:  python tools/build.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
logo = (ROOT / "src" / "logo-reverse.b64").read_text(encoding="utf-8").strip()
assert src.count("__FUSE_LOGO__") == 1 and src.count("__FUSE_DATA__") == 1

dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
template = src.replace("__FUSE_LOGO__", logo)
(dist / "template.html").write_text(template, encoding="utf-8")

data = json.loads((ROOT / "data" / "jobs.json").read_text(encoding="utf-8"))
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
out = dist / "fuse-social-posts.html"
out.write_text(template.replace("__FUSE_DATA__", payload), encoding="utf-8")
print(f"Built {out.name} ({out.stat().st_size / 1024:.0f} KB, {len(data.get('jobs', []))} jobs) and template.html")
