# Каталог билдов /builds/ из собранных данных TL.zp (с разрешения tl-build.ru) поверх общей базы data/.
# Пишет: builds/catalog.json, builds/dict.json, builds/b/<id>.json, короткие страницы builds/<класс>/<id>/index.html,
#        картинки builds/img/<id>.webp (720px), builds/img/full/<id>.webp, builds/og/<id>.jpg (карточка для мессенджеров).
# Запуск: python -I tools/build_catalog.py [--images]
import os, sys, json, re, html, base64, time
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("TL_DATA", r"C:\Users\user\Desktop\TL")
OUT = os.path.join(ROOT, "builds")
SITE = "https://natsolono.github.io/tl-presets"
def L(p): return json.load(open(p, encoding="utf-8"))
def dump(p, o): json.dump(o, open(p, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))

ITEMS = {i["id"]: i for i in L(os.path.join(ROOT, "data", "items.json"))}
SK = {s["id"]: s for s in L(os.path.join(ROOT, "data", "skills.json"))}
SPEC = {p["id"]: p for s in SK.values() for p in s["sp"]}
META = L(os.path.join(ROOT, "data", "meta.json"))
MS = L(os.path.join(ROOT, "data", "mastery.json"))
ART = L(os.path.join(ROOT, "data", "artifacts.json"))
MS_NODES = {n["id"]: (wk, n) for wk, w in MS["weapons"].items() for n in w["nodes"]}
MS_COMMON = {c["id"]: c for c in MS["common"]}
RU_W = {"Меч и щит": "Sword", "Двуручный меч": "Sword2h", "Кинжалы": "Dagger", "Длинный лук": "Bow", "Арбалеты": "Crossbow", "Посох": "Staff", "Жезл": "Wand", "Копьё": "Spear"}
W_RU = {v: k for k, v in RU_W.items()}
SLUG = {"Sword": "sword", "Sword2h": "sword2h", "Dagger": "dagger", "Bow": "bow", "Crossbow": "crossbow", "Staff": "staff", "Wand": "wand", "Spear": "spear"}

# ---------- безопасный HTML описаний ----------
ALLOWED = {"p", "br", "b", "strong", "i", "em", "u", "s", "mark", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "img", "hr", "div", "span",
           "table", "thead", "tbody", "tr", "td", "th", "code", "pre", "sup", "sub"}
DROP = {"script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript"}
class San(HTMLParser):
    def __init__(self, imgs):
        super().__init__(convert_charrefs=True); self.o = []; self.stack = []; self.skip = 0; self.imgs = imgs; self.di = 0
    def handle_starttag(self, t, a):
        if t in DROP: self.skip += 1; return
        if self.skip or t not in ALLOWED: return
        a = dict(a); attrs = ""
        if t == "a":
            h = (a.get("href") or "").strip()
            if not re.match(r"^https?://", h, re.I): self.o.append("<span>"); self.stack.append("span"); return
            attrs = ' href="%s" target="_blank" rel="noopener nofollow ugc"' % html.escape(h, True)
        if t == "img":
            s = (a.get("src") or "").strip()
            if s.startswith("data:"): return
            self.di += 1; local = self.imgs.get(self.di)
            if local: s = "img/" + local
            elif s.startswith("//"): s = "https:" + s
            elif s.startswith("/"): s = "https://tl-build.ru" + s
            if not (s.startswith("img/") or s.startswith("https://")): return
            self.o.append('<img src="%s" alt="Иллюстрация из описания билда" loading="lazy" referrerpolicy="no-referrer">' % html.escape(s, True)); return
        if t in ("br", "hr"): self.o.append("<%s>" % t); return
        self.o.append("<%s%s>" % (t, attrs)); self.stack.append(t)
    def handle_endtag(self, t):
        if t in DROP: self.skip = max(0, self.skip - 1); return
        if self.skip: return
        if t == "a" and t not in self.stack and "span" in self.stack: t = "span"
        if t in self.stack:
            while self.stack:
                x = self.stack.pop(); self.o.append("</%s>" % x)
                if x == t: break
    def handle_data(self, d):
        if not self.skip: self.o.append(html.escape(d, False))
    def result(self):
        while self.stack: self.o.append("</%s>" % self.stack.pop())
        s = re.sub(r"(<br>\s*){3,}", "<br><br>", "".join(self.o))
        return re.sub(r"<(p|div|span|b|strong|mark|h2|h3|h4|li)>\s*</\1>", "", s).strip()
def sanitize(desc, bid):
    if not desc or not desc.strip(): return ""
    imgs = {}
    for f in os.listdir(os.path.join(SRC, "images")):
        m = re.match(r"^%s_desc(\d+)\.(\w+)$" % re.escape(bid), f)
        if m: imgs[int(m.group(1))] = f
    if "<" not in desc: desc = html.escape(desc).replace("\n", "<br>")
    p = San(imgs); p.feed(desc); p.close(); return p.result()

# ---------- каталог ----------
rows = {}
for line in open(os.path.join(SRC, "builds.txt"), encoding="utf-8"):
    f = line.rstrip("\r\n").split(";")
    if len(f) >= 13: rows[f[3]] = f
# названия предметов, которых нет в базе: из колонки снаряжения каталога (порядок совпадает с json у билдов с одним вариантом)
GEAR = {}
used = {"items": set(), "skills": set(), "specs": set(), "traits": set(), "stats": set(), "ms": set(), "msc": set(), "arts": set()}
def stat(k):
    if k: used["stats"].add(k)
    return k

def calc_link(name, b):
    ws = [w for w in (b.get("weapons") or []) if w in SLUG]
    if len(ws) != 2: return None
    eq = {}
    for slot, v in (b.get("equip") or {}).items():
        if not isinstance(v, dict): continue
        it = ITEMS.get(v.get("itemId"))
        if not it: continue
        tl = ((b.get("traitLevels") or {}).get(slot) or {})
        traits = [{"id": t, "lvl": max(1, min(4, int(tl.get(t, 4) or 4)))} for t in ((b.get("itemTraits") or {}).get(slot) or []) if t in it["tr"]][:3]
        res = None; rs = (b.get("traitResonanceStat") or {}).get(slot)
        if (b.get("traitResonance") or {}).get(slot) and rs:
            res = next((i for i, o in enumerate(it["res"]) if rs in o), None)
        eq[slot] = {"id": it["id"], "ench": min(int(v.get("enchantLevel") or 0), it["mx"] or 0), "traits": traits, "res": res}
    w1 = (eq.get("weapon1") and ITEMS[eq["weapon1"]["id"]]["cat"]) or ws[0]
    w = [w1, ws[1] if ws[0] == w1 else ws[0]]
    attr = b.get("attr") or {}
    bonus = []
    for arts in (b.get("artifactStats") or {}).values():
        for r in arts or []:
            if r and r.get("stat") in META["labels"]:
                f = META["fmt"].get(r["stat"], {"mul": 1}); v = (r.get("value") or 0) * (f.get("mul") or 1)
                bonus.append({"src": "Артефакт", "stat": r["stat"], "val": round(v, 2) if v % 1 else int(v)})
    lv = b.get("skillLevels") or {}
    sk = {"a": [x for x in (b.get("active") or []) if x in SK][:12], "p": [x for x in (b.get("passive") or []) if x in SK][:8],
          "d": b.get("defensive") if b.get("defensive") in SK else None, "lv": {}, "sp": {}}
    for x in sk["a"] + sk["p"] + ([sk["d"]] if sk["d"] else []):
        sk["lv"][x] = int(lv.get(x) or len(SK[x]["lv"]) or 15)
        sp = [p for p in ((b.get("spec") or {}).get(x) or []) if p in SPEC]
        if sp: sk["sp"][x] = sp
    o = {"v": 2, "name": name[:80], "w": w, "equip": eq, "attr": {k: int(attr.get(k, 10) or 10) for k in ("Str", "Dex", "Int", "Per", "Con")}, "bonus": bonus, "sk": sk}
    return base64.urlsafe_b64encode(json.dumps(o, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).decode().rstrip("=")

def norm_build(b):
    lo = {"lvl": b.get("level"), "w": b.get("weapons") or [], "attr": b.get("attr") or {}}
    eq = []
    for s, v in (b.get("equip") or {}).items():
        if not isinstance(v, dict) or not v.get("itemId"): continue
        iid = v["itemId"]; used["items"].add(iid)
        tl = ((b.get("traitLevels") or {}).get(s) or {}); tr = []
        for t in ((b.get("itemTraits") or {}).get(s) or []):
            used["traits"].add(t); tr.append([t, tl.get(t)])
            if t in META["traits"]: stat(META["traits"][t]["s"])
        x = {"s": s, "id": iid, "e": v.get("enchantLevel"), "t": tr}
        if (b.get("traitResonance") or {}).get(s): x["r"] = stat((b.get("traitResonanceStat") or {}).get(s)) or 1
        if v.get("randomStats"): x["rnd"] = [stat(k) for k in v["randomStats"] if k]
        rr = [[r.get("type"), (r.get("grade") or "").lstrip("k"), stat(r.get("stat")), r.get("level")] for r in ((b.get("runes") or {}).get(s) or []) if r and r.get("stat")]
        if rr: x["ru"] = rr
        eq.append(x)
    lo["eq"] = eq
    lv = b.get("skillLevels") or {}; sp = b.get("spec") or {}
    def sk(i):
        used["skills"].add(i); ss = [x for x in (sp.get(i) or []) if x]; used["specs"].update(ss); return [i, lv.get(i), ss]
    lo["act"] = [sk(i) for i in (b.get("active") or []) if i]
    lo["pas"] = [sk(i) for i in (b.get("passive") or []) if i]
    lo["def"] = sk(b["defensive"]) if b.get("defensive") else None
    ast = b.get("artifactStats") or {}; arts = []
    for slot, aid in (b.get("artifacts") or {}).items():
        used["arts"].add(aid)
        arts.append([slot, aid, [[stat(r.get("stat")), r.get("value")] for r in (ast.get(slot) or []) if r and r.get("stat")]])
    lo["art"] = arts
    lo["ms"] = {w: n for w, n in (b.get("masteryV2") or {}).items() if n}
    for n in lo["ms"].values(): used["ms"].update(n.keys())
    lo["msl"] = b.get("masteryLevel"); lo["msw"] = b.get("masteryWeaponLevels") or {}
    lo["msc"] = [x for x in (b.get("masteryCommon") or []) if x]; used["msc"].update(lo["msc"])
    return lo

def page(rec, full):
    # короткий адрес с карточкой для мессенджеров; людей переводит в каталог
    slug = "-".join(SLUG.get(w, w.lower()) for w in rec["w"])
    d = os.path.join(OUT, slug, str(rec["id"])); os.makedirs(d, exist_ok=True)
    url = "%s/builds/%s/%d/" % (SITE, slug, rec["id"])
    title = "%s — %s" % (rec["n"] or "Билд", " + ".join(W_RU.get(w, w) for w in rec["w"]))
    role = {"dps": "Урон", "tank": "Танк", "support": "Поддержка"}.get(rec["role"], "")
    mode = {"pve": "PvE", "pvp": "PvP", "mixed": "PvE + PvP"}.get(rec["mode"], "")
    desc = ". ".join(x for x in [", ".join(x for x in (role, mode) if x), "Автор %s" % (rec["a"] or "аноним"), ("Оценка %.1f из 5 (%d)" % (rec["rt"], rec["rc"])) if rec["rt"] else "", "Снаряжение, умения, руны, артефакты и мастерство"] if x)
    img = "%s/builds/og/%d.jpg" % (SITE, rec["id"]) if rec["img"] else "%s/builds/og/default.jpg" % SITE
    e = lambda x: html.escape(x, True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(
        '<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<title>%s · Каталог билдов T2</title>\n<meta name="description" content="%s">\n<link rel="canonical" href="%s">\n'
        '<meta property="og:type" content="article"><meta property="og:site_name" content="T2 Билды — Throne and Liberty">\n'
        '<meta property="og:title" content="%s"><meta property="og:description" content="%s"><meta property="og:url" content="%s">\n'
        '<meta property="og:image" content="%s"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n'
        '<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0F1115">\n'
        '<script>location.replace("../../#%d")</script>\n'
        '<style>body{font:16px/1.5 system-ui,sans-serif;margin:40px auto;max-width:640px;padding:0 16px;background:#0F1115;color:#E8EAED}a{color:#D6A94A}</style>\n'
        '</head><body><main><h1>%s</h1><p>%s</p><p><a href="../../#%d">Открыть билд в каталоге</a></p></main></body></html>\n'
        % (e(title), e(desc), url, e(title), e(desc), url, img, rec["id"], e(title), e(desc), rec["id"]))
    return "builds/%s/%d/" % (slug, rec["id"])

os.makedirs(os.path.join(OUT, "b"), exist_ok=True); os.makedirs(os.path.join(OUT, "img", "full"), exist_ok=True); os.makedirs(os.path.join(OUT, "og"), exist_ok=True)
cat = []; ncalc = 0
for fn in sorted(os.listdir(os.path.join(SRC, "builds")), key=lambda x: int(x[:-5])):
    bid = fn[:-5]; r = rows.get(bid)
    if not r: continue
    j = L(os.path.join(SRC, "builds", fn))
    los = [(l.get("name") or "", l.get("build") or {}) for l in j["loadouts"]] if isinstance(j.get("loadouts"), list) else [("", j)]
    out_lo = []; descs = []; anyc = False
    for name, b in los:
        lo = norm_build(b); lo["n"] = name
        d = b.get("desc") or ""
        if d and d not in descs: descs.append(d)
        c = calc_link(r[4] + (" — " + name if name and len(los) > 1 else ""), b)
        if c: lo["calc"] = c; anyc = True
        out_lo.append(lo)
    w = [RU_W.get(p.strip(), p.strip()) for p in r[0].split(" + ")]
    rec = {"id": int(bid), "n": r[4], "a": r[5], "w": w, "role": r[1], "mode": r[2], "rt": float(r[6] or 0), "rc": int(r[7] or 0), "v": int(r[8] or 0),
           "d": r[11], "lo": len(out_lo), "img": os.path.exists(os.path.join(SRC, "images", bid + ".png")), "calc": anyc}
    rec["u"] = page(rec, None)
    cat.append(rec); ncalc += anyc
    full = dict(rec); full["los"] = out_lo; full["desc"] = "".join(sanitize(d, bid) for d in descs); full["url"] = r[12]
    dump(os.path.join(OUT, "b", bid + ".json"), full)
    for f in os.listdir(os.path.join(SRC, "images")):
        if re.match(r"^%s_desc\d+\.\w+$" % re.escape(bid), f) and not os.path.exists(os.path.join(OUT, "img", f)):
            open(os.path.join(OUT, "img", f), "wb").write(open(os.path.join(SRC, "images", f), "rb").read())

if "--images" in sys.argv:
    from PIL import Image
    n = 0
    for rec in cat:
        if not rec["img"]: continue
        src = os.path.join(SRC, "images", "%d.png" % rec["id"]); im = None
        for dst, fn in ((os.path.join(OUT, "img", "%d.webp" % rec["id"]), "thumb"), (os.path.join(OUT, "img", "full", "%d.webp" % rec["id"]), "full"), (os.path.join(OUT, "og", "%d.jpg" % rec["id"]), "og")):
            if os.path.exists(dst): continue
            im = im or Image.open(src).convert("RGB"); n += 1
            if fn == "thumb": t = im.copy(); t.thumbnail((720, 720)); t.save(dst, "WEBP", quality=72, method=6)
            elif fn == "full": im.save(dst, "WEBP", quality=82, method=6)
            else: im.resize((1200, 630)).save(dst, "JPEG", quality=72, optimize=True, progressive=True)
    dflt = os.path.join(OUT, "og", "default.jpg")
    if not os.path.exists(dflt):
        Image.new("RGB", (1200, 630), (15, 17, 21)).save(dflt, "JPEG", quality=80)
    print("картинок создано", n)

# ---------- справочник страницы каталога ----------
D = {"items": {}, "skills": {}, "specs": {}, "traits": {}, "labels": {}, "fmt": {}, "ms": {}, "msc": {}, "arts": {}, "mw": {}}
for i in sorted(used["items"]):
    it = ITEMS.get(i)
    if it: D["items"][i] = {"n": it["n"], "g": it["g"], "ic": it["ic"], "set": it["set"]}
for i in sorted(used["skills"]):
    s = SK.get(i)
    if s: D["skills"][i] = {"n": s["n"], "ic": s["ic"], "w": s["w"], "d": (s["lv"][-1]["d"] if s["lv"] else s["d"])[:600], "cd": (s["lv"][-1]["cd"] if s["lv"] else s["cd"])}
for i in sorted(used["specs"]):
    p = SPEC.get(i)
    if p: D["specs"][i] = {"n": p["n"], "ic": p["ic"], "d": (p["d"] or "")[:400]}
for t in sorted(used["traits"]):
    if t in META["traits"]: D["traits"][t] = META["traits"][t]["s"]
    else:
        m = re.match(r"^october:earring-trait:(front|back|side)_(.+)$", t) or re.match(r"^k(Front|Back|Side)All(.+)$", t)
        if m:
            pos = m.group(1).lower(); base = m.group(2) if t.startswith("october") else re.sub(r"(?<!^)(?=[A-Z])", "_", m.group(2)).lower()
            key = "%s_%s" % (pos, base); D["traits"][t] = key
            bl = META["labels"].get("all_" + base) or META["labels"].get(base)
            if bl: D["labels"][key] = "%s (%s)" % (bl, {"front": "спереди", "back": "сзади", "side": "сбоку"}[pos])
            if "all_" + base in META["fmt"]: D["fmt"][key] = META["fmt"]["all_" + base]
for k in sorted(used["stats"]):
    if k in META["labels"]: D["labels"][k] = META["labels"][k]
    if k in META["fmt"]: D["fmt"][k] = META["fmt"][k]
for i in sorted(used["ms"]):
    if i in MS_NODES: wk, n = MS_NODES[i]; D["ms"][i] = {"n": n["n"], "cat": n["cat"], "ic": n["ic"]}
for i in sorted(used["msc"]):
    if i in MS_COMMON: c = MS_COMMON[i]; D["msc"][i] = {"n": c["n"], "t": c["t"][:300], "ic": c["ic"]}
for i in sorted(used["arts"]):
    a = ART["items"].get(i)
    if a: D["arts"][i] = {"n": a["n"], "g": a["g"], "ic": a["ic"]}
for wk, w in MS["weapons"].items(): D["mw"][wk] = w["n"]
dump(os.path.join(OUT, "dict.json"), D)
cat.sort(key=lambda x: (-x["rt"] * min(x["rc"], 20), -x["v"]))
dump(os.path.join(OUT, "catalog.json"), {"built": time.strftime("%Y-%m-%d"), "items": cat})
print("билдов", len(cat), "в конструкторе", ncalc, "| предметов", len(D["items"]), "/", len(used["items"]), "умений", len(D["skills"]), "/", len(used["skills"]),
      "спец", len(D["specs"]), "/", len(used["specs"]), "узлов мастерства", len(D["ms"]), "/", len(used["ms"]), "общих", len(D["msc"]), "/", len(used["msc"]),
      "артефактов", len(D["arts"]), "/", len(used["arts"]), "статов", len(D["labels"]), "/", len(used["stats"]))
