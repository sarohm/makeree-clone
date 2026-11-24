"""Crawl the Makeree 'makeree' app: navigation, sections, projects (all languages) and media."""
import json, os, re, sys, urllib.request, urllib.parse, concurrent.futures as cf

API = "https://api.makeree.com/api/v2/"
APP = "makeree"
OUT = sys.argv[1]
DATA = os.path.join(OUT, "data")
MEDIA = os.path.join(OUT, "media")
os.makedirs(os.path.join(DATA, "sections"), exist_ok=True)
os.makedirs(os.path.join(DATA, "projects"), exist_ok=True)
os.makedirs(MEDIA, exist_ok=True)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def getjson(url):
    try:
        return json.loads(get(url))
    except Exception as e:
        print("FAIL", url, e)
        return None


def save(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


full = getjson(f"{API}web/getfullapp?appName={APP}&language=")
save(os.path.join(DATA, "app.json"), full)

section_ids = set()
for it in full["navigation"]["navItems"]:
    if it.get("data"):
        section_ids.add(it["data"])
for it in full["navigation"]["mainMenu"]["menuItems"]:
    if it.get("data"):
        section_ids.add(it["data"])

project_ids = {}
sections = {}
for sid in sorted(section_ids):
    s = getjson(f"{API}web/getSection?appName={APP}&language=&sectionId={sid}")
    if not s or "guides" not in s:
        print("no section", sid)
        continue
    s.pop("application", None)
    sections[sid] = s
    save(os.path.join(DATA, "sections", f"{sid}.json"), s)
    for g in s["guides"]:
        project_ids[g["projectId"]] = g["projectName"]
print(len(sections), "sections", len(project_ids), "projects")


def fetch_project(pid):
    base = getjson(f"{API}webproject/GetProject?clientId={APP}&lessonid={pid}&language=")
    if not base:
        return pid, []
    langs = [l["languageCode"] for l in base.get("languages") or []]
    out = {"_default": base}
    for lc in langs:
        if lc == base.get("currentLanguage"):
            out[lc] = base
            continue
        d = getjson(f"{API}webproject/GetProject?clientId={APP}&lessonid={pid}&language={lc}")
        if d and d.get("currentLanguage") == lc:
            out[lc] = d
    pdir = os.path.join(DATA, "projects", pid)
    os.makedirs(pdir, exist_ok=True)
    for k, v in out.items():
        save(os.path.join(pdir, f"{k}.json"), v)
    return pid, list(out)


with cf.ThreadPoolExecutor(8) as ex:
    for pid, langs in ex.map(fetch_project, project_ids):
        print("project", pid, project_ids[pid], langs)

# collect media urls from every json saved
URL_RE = re.compile(r'https?://[^"\s\\]+?\.(?:jpe?g|png|gif|webp|svg|mp4|mov|webm|m4v|mp3|wav|pdf|glb|gltf|usdz|ino|zip|stl)(?:\?[^"\s\\]*)?', re.I)
urls = set()
for root, _, files in os.walk(DATA):
    for fn in files:
        urls.update(URL_RE.findall(open(os.path.join(root, fn)).read()))
print(len(urls), "media urls")


def local_path(u):
    p = urllib.parse.urlparse(u)
    return os.path.join(MEDIA, p.netloc, urllib.parse.unquote(p.path.lstrip("/")))


def dl(u):
    lp = local_path(u)
    if os.path.exists(lp) and os.path.getsize(lp) > 0:
        return u, "cached"
    os.makedirs(os.path.dirname(lp), exist_ok=True)
    try:
        b = get(u.replace(" ", "%20"))
        open(lp, "wb").write(b)
        return u, len(b)
    except Exception as e:
        return u, f"ERR {e}"


failed = []
with cf.ThreadPoolExecutor(16) as ex:
    for u, r in ex.map(dl, sorted(urls)):
        if isinstance(r, str) and r.startswith("ERR"):
            failed.append((u, r))
manifest = {u: os.path.relpath(local_path(u), OUT) for u in urls}
save(os.path.join(OUT, "media-manifest.json"), manifest)
save(os.path.join(OUT, "media-failed.json"), failed)
print("failed", len(failed))
