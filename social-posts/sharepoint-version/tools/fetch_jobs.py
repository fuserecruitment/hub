"""Fetch a snapshot of live jobs from fuserecruitment.com into data/jobs.json.

This does locally what the Power Automate sync flow will do on a schedule:
read the jobs sitemap, then read the structured job data (schema.org JobPosting)
and summary from each job page.

Usage:  python tools/fetch_jobs.py
"""
import concurrent.futures as cf
import html
import json
import pathlib
import re
import time
import subprocess

SITEMAP = "https://www.fuserecruitment.com/wp-content/plugins/applyflow-cms-extension/jobs-sitemap.php"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "jobs.json"
UA = "Mozilla/5.0"

WORK_TYPES = {
    "FULL_TIME": "Full time",
    "PART_TIME": "Part time",
    "CONTRACTOR": "Contract/temp",
    "TEMPORARY": "Contract/temp",
    "INTERN": "Graduate",
}


def get(url: str) -> str:
    # curl is much faster than urllib on some Windows networks
    out = subprocess.run(["curl", "-s", "-f", "--max-time", "30", "-A", UA, url],
                         capture_output=True, check=True)
    return out.stdout.decode("utf-8", "replace")


def html_to_text(s: str) -> str:
    s = re.sub(r"(?i)<li[^>]*>", "\n- ", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</ul>|</h\d>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n\s*\n+", "\n\n", s)
    return "\n".join(line.strip() for line in s.strip().splitlines())


def salary_text(bs) -> str:
    if not isinstance(bs, dict) or not bs:
        return ""
    v = bs.get("value", bs)
    if not isinstance(v, dict):
        return str(v)
    lo, hi, single = v.get("minValue"), v.get("maxValue"), v.get("value")
    unit = {"HOUR": "per hour", "DAY": "per day", "WEEK": "per week", "MONTH": "per month",
            "YEAR": "per annum"}.get(str(v.get("unitText", "")).upper(), "")

    def money(x):
        try:
            f = float(x)
            return f"${f:,.2f}".replace(".00", "")
        except (TypeError, ValueError):
            return str(x)

    if lo and hi and lo != hi:
        amount = f"{money(lo)} - {money(hi)}"
    else:
        amount = money(single or lo or hi) if (single or lo or hi) else ""
    return f"{amount} {unit}".strip()


def parse_job(url: str, lastmod: str) -> dict | None:
    h = get(url)
    posting = None
    for block in re.findall(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(block)
        except json.JSONDecodeError:
            continue
        if isinstance(d, dict) and d.get("@type") == "JobPosting":
            posting = d
            break
    if not posting:
        return None
    m = re.search(r'<meta name="description" content="([^"]*)"', h)
    summary = html.unescape(m.group(1)) if m else ""
    ref = (posting.get("identifier") or {}).get("value", "")
    if ref:
        summary = re.sub(r"\.*\s*" + re.escape(ref) + r"\s*$", "", summary).strip()
        summary = summary if summary.endswith((".", "!", "?")) else summary + "."
    addr = ((posting.get("jobLocation") or {}).get("address") or {})
    desc = html_to_text(posting.get("description", ""))
    return {
        "id": ref or url.rstrip("/").rsplit("/", 1)[-1],
        "title": html.unescape(posting.get("title", "")).strip(),
        "url": url,
        "summary": summary,
        "location": addr.get("addressLocality", ""),
        "state": addr.get("addressRegion", ""),
        "country": addr.get("addressCountry", ""),
        "workType": WORK_TYPES.get(str(posting.get("employmentType", "")).upper(),
                                   str(posting.get("employmentType", "")).replace("_", " ").title()),
        "salary": salary_text(posting.get("baseSalary")),
        "datePosted": (posting.get("datePosted") or "")[:10],
        "validThrough": (posting.get("validThrough") or "")[:10],
        "lastModified": lastmod[:10],
        "description": desc[:3000],
    }


def main():
    sm = get(SITEMAP)
    entries = re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]*)</lastmod>", sm)
    print(f"{len(entries)} jobs in sitemap")
    jobs, failed = [], []

    def work(e):
        time.sleep(0.2)  # be gentle with the website
        j = parse_job(*e)
        print(".", end="", flush=True)
        return j

    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for e, fut in zip(entries, pool.map(lambda e: _safe(work, e), entries)):
            (jobs.append(fut) if isinstance(fut, dict) else failed.append((e[0], fut)))
    jobs.sort(key=lambda j: j["datePosted"], reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "jobs": jobs},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Saved {len(jobs)} jobs to {OUT}")
    for u, err in failed:
        print("FAILED", u, err)


def _safe(fn, e):
    try:
        return fn(e)
    except Exception as ex:  # noqa: BLE001
        return repr(ex)


if __name__ == "__main__":
    main()
