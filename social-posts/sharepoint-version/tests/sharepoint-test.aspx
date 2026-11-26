<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SharePoint Hosting Test</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#1b1f24; --muted:#5b6470; --ok:#1a7f37; --bad:#c62828; --warn:#a15c00; --line:#e3e6ea; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 "Work Sans", system-ui, sans-serif; }
  main { max-width:760px; margin:0 auto; padding:24px 16px 48px; }
  h1 { font-size:22px; margin:0 0 4px; }
  p.lead { color:var(--muted); margin:0 0 20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:12px; }
  .row { display:flex; gap:10px; align-items:flex-start; }
  .badge { flex:none; font-weight:600; font-size:12px; padding:2px 8px; border-radius:999px; background:#eef0f3; color:var(--muted); min-width:64px; text-align:center; }
  .ok .badge { background:#e6f4ea; color:var(--ok); }
  .bad .badge { background:#fdecea; color:var(--bad); }
  .warn .badge { background:#fff4e0; color:var(--warn); }
  .title { font-weight:600; }
  .detail { color:var(--muted); font-size:13px; word-break:break-word; }
  input { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:6px; font:inherit; margin:8px 0; }
  button { padding:8px 14px; border:0; border-radius:6px; background:#1b1f24; color:#fff; font:inherit; cursor:pointer; }
  .thumbs { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; margin-top:10px; }
  .thumbs img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; background:#eee; }
</style>
</head>
<body>
<main>
  <h1>SharePoint hosting test</h1>
  <p class="lead">If you can read this with ticks appearing below, SharePoint is running the page. Screenshot the results and send them back.</p>

  <div id="results"></div>

  <div class="card">
    <div class="title">Photo folder test</div>
    <div class="detail">Paste the address of the SharePoint photo folder (copy it from the browser bar while you are in that folder).</div>
    <input id="folder" placeholder="https://yourcompany.sharepoint.com/sites/Marketing/Shared Documents/Social Photos">
    <button id="loadPhotos">Load photos</button>
    <div id="photoResult" class="detail" style="margin-top:8px"></div>
    <div class="thumbs" id="thumbs"></div>
  </div>
</main>
<script>
const results = document.getElementById('results');
function report(state, title, detail) {
  const d = document.createElement('div');
  d.className = 'card ' + state;
  d.innerHTML = '<div class="row"><span class="badge">' + ({ok:'Works',bad:'Blocked',warn:'Check'}[state]) +
    '</span><div><div class="title"></div><div class="detail"></div></div></div>';
  d.querySelector('.title').textContent = title;
  d.querySelector('.detail').textContent = detail || '';
  results.appendChild(d);
}
const JSON_HDR = { headers: { Accept: 'application/json;odata=nometadata' }, credentials: 'include' };
function siteRoot(pathname) {
  const m = pathname.match(/^\/(sites|teams)\/[^/]+/i);
  return location.origin + (m ? m[0] : '');
}
const site = siteRoot(location.pathname);

(async () => {
  report('ok', 'JavaScript runs', 'Page opened at ' + location.href);

  try {
    const r = await fetch(site + '/_api/web/currentuser?$select=Title', JSON_HDR);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const u = await r.json();
    report('ok', 'Signed-in user detected', 'Hello ' + u.Title + ' (no extra login needed)');
  } catch (e) { report('bad', 'Could not read signed-in user', e.message); }

  try {
    const r = await fetch(site + '/_api/web/lists?$select=Title&$filter=Hidden eq false', JSON_HDR);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    report('ok', 'SharePoint lists readable', j.value.length + ' lists on this site: ' + j.value.map(l => l.Title).slice(0, 8).join(', '));
  } catch (e) { report('bad', 'Could not read SharePoint lists', e.message); }

  try {
    const r = await fetch('https://www.fuserecruitment.com/feed/');
    report('ok', 'Website data readable directly', 'HTTP ' + r.status);
  } catch (e) {
    report('warn', 'Website jobs/blogs not readable directly (expected)', 'The browser blocks this. Jobs will be synced into a SharePoint list instead.');
  }
})();

document.getElementById('loadPhotos').onclick = async () => {
  const out = document.getElementById('photoResult');
  const thumbs = document.getElementById('thumbs');
  thumbs.innerHTML = ''; out.textContent = 'Loading…';
  try {
    const raw = document.getElementById('folder').value.trim();
    const url = new URL(raw);
    let path = decodeURIComponent(url.pathname);
    const idParam = url.searchParams.get('id');
    if (idParam) path = idParam;               // "AllItems.aspx?id=/sites/.../Folder" style links
    path = path.replace(/\/Forms\/AllItems\.aspx$/i, '');
    const fsite = siteRoot(path);
    const api = fsite + "/_api/web/GetFolderByServerRelativePath(decodedurl='" + path.replace(/'/g, "''") +
      "')/Files?$select=Name,ServerRelativeUrl";
    const r = await fetch(api, JSON_HDR);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for folder ' + path);
    const files = (await r.json()).value.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f.Name));
    out.textContent = files.length + ' photos found in ' + path;
    files.slice(0, 24).forEach(f => {
      const img = document.createElement('img');
      img.src = location.origin + encodeURI(f.ServerRelativeUrl);
      img.alt = f.Name; img.title = f.Name;
      thumbs.appendChild(img);
    });
  } catch (e) { out.textContent = 'Could not load folder: ' + e.message; }
};
</script>
</body>
</html>
