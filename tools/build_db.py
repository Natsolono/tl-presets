# Сборка общей базы сайта в data/: предметы, умения, справочники, мастерство, артефакты, иконки.
# Источники (с разрешения правообладателей): дамп tl-build.ru (TLB) и справочники build.tlwg.ru (TLWG).
# Запуск: python -I tools/build_db.py [--icons]
import os, sys, json, re, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")
TLB = os.environ.get("TLB_DATA", r"C:\Users\user\Desktop\TL\tlbuild_data")
TLWG = os.environ.get("TLWG_DATA", os.path.join(ROOT, "tools", ".cache", "tlwg"))
TLWG_FILES = ["equipment", "skills", "traits", "stat-labels", "stat-format", "item-sources"]

def L(p): return json.load(open(p, encoding="utf-8"))
def W(name, obj):
    p = os.path.join(OUT, name)
    json.dump(obj, open(p, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(p)

# --- справочники tlwg: кэш в tools/.cache (в git не попадает) ---
os.makedirs(TLWG, exist_ok=True)
for f in TLWG_FILES:
    p = os.path.join(TLWG, f + ".json")
    if not os.path.exists(p):
        rq = urllib.request.Request("https://build.tlwg.ru/builder-data/%s.json" % f, headers={"User-Agent": "tl-presets-builder"})
        open(p, "wb").write(urllib.request.urlopen(rq, timeout=60).read()); time.sleep(1)

TB_EQ = L(os.path.join(TLB, "equipment.json"))
TB_SK = L(os.path.join(TLB, "skills.json"))
TB_TR = {k: v for k, v in L(os.path.join(TLB, "traits.json")).items() if k != "__legal"}
TB_RES = L(os.path.join(TLB, "trait-resonance.json"))
TB_ATTR = L(os.path.join(TLB, "attributes.json"))
TB_CP = L(os.path.join(TLB, "combat-power.json"))["templates"]
TB_SKST = {k: v for k, v in L(os.path.join(TLB, "skill-stats.json")).items() if k != "__legal"}
TB_MS = L(os.path.join(TLB, "mastery-v2.json"))
TB_ART = L(os.path.join(TLB, "artifacts.json"))
TB_RUNE = L(os.path.join(TLB, "runes.json"))
WG_EQ = {i["id"]: i for i in L(os.path.join(TLWG, "equipment.json"))}
WG_SK = {i["id"]: i for i in L(os.path.join(TLWG, "skills.json"))}
WG_TR = L(os.path.join(TLWG, "traits.json"))
WG_LAB = L(os.path.join(TLWG, "stat-labels.json"))
WG_FMT = L(os.path.join(TLWG, "stat-format.json"))
WG_SRC = {x["itemId"]: x for x in L(os.path.join(TLWG, "item-sources.json"))["items"]}
icons = {}  # имя файла -> путь на источнике

def ic(path):
    if not path: return None
    name = os.path.basename(path)
    icons.setdefault(name, path)
    return name

# --- трейты: формат калькулятора {s,b,c} ---
traits = {}
for src in (WG_TR, TB_TR):
    for k, v in src.items():
        if isinstance(v, dict) and v.get("stat"):
            traits[k] = {"s": v["stat"], "b": v.get("base", 0), "c": v.get("curve") or []}

# --- резонанс: по пулу предмета ---
res_pool = TB_RES.get("pools", {}); res_items = TB_RES.get("items", {})
def resonance(iid, wg):
    pool = res_items.get(iid)
    if isinstance(pool, dict): pool = pool.get("pool") or pool.get("id")
    if pool and pool in res_pool:
        return [{c["stat"]: c["value"]} for c in res_pool[pool].get("candidates", [])]
    if wg and wg.get("resonanceEffects"):
        out = []
        for r in wg["resonanceEffects"]:
            d = {s["stat"]: s["value"] for s in r.get("stats", [])}
            if d: out.append(d)
        return out
    return []

def set_bonuses(sb):
    out = []
    for b in sb or []:
        st = b.get("stats")
        if isinstance(st, list): st = {s.get("type") or s.get("stat"): s.get("value") for s in st}
        t = " ".join((p.get("description") or "") for p in (b.get("passives") or [])) or b.get("passiveText") or ""
        out.append({"p": b.get("pieces"), "s": st or {}, "t": t})
    return out

CP_BASE = {"Weapon": "weapon", "Head": "head", "Chest": "chest", "Hands": "hands", "Legs": "legs", "Feet": "feet", "Cloak": "cloak", "Cape": "cloak",
           "Necklace": "necklace", "Ring": "ring", "Bracelet": "bracelet", "Belt": "belt", "Earring": "ear"}
def cp_key(iid, slot=None, tier=None):
    # шаблон Combat Power = <тип слота>_<грейд из ID>_<тир>: weapon_aa_t1, head_aa2_t1, ring_a_t2 …
    base = CP_BASE.get(slot or "")
    if not base: return None
    m = re.search(r"_(aaa|aa2|aa|a|b|c)_t\d", iid) or re.search(r"_(rare2)_", iid)
    g = m.group(1) if m else None
    if g == "rare2": g, tier = "a", "t2"
    if not g: return None
    t = tier if tier in ("t1", "t2") else "t1"
    for k in ("%s_%s_%s" % (base, g, t), "%s_%s_t1" % (base, g)):
        if k in TB_CP: return k
    return None

def sources(iid):
    s = WG_SRC.get(iid)
    if not s: return []
    out = []
    for g in s.get("sourceGroups", [])[:6]:
        out.append([g.get("type"), g.get("name") or "", g.get("boss") or "", g.get("location") or ""])
    return out

# --- предметы: tl-build + недостающие из tlwg ---
items = []
seen = set()
def add_item(t, wg, origin):
    iid = t["id"]
    if iid in seen: return
    seen.add(iid)
    perk = t.get("specialPerk") or (wg or {}).get("specialPerk")
    items.append({
        "id": iid, "n": t.get("name") or (wg or {}).get("name") or iid, "slot": t.get("slot"), "cat": t.get("category"),
        "g": t.get("grade"), "tier": t.get("tier"), "lvl": t.get("requiredLevel"),
        "ic": ic((wg or {}).get("thumbnail") or t.get("thumbnail")),
        "b": t.get("baseStats") or {}, "x": t.get("extraStats") or {}, "mx": t.get("enchantMaxLevel") or 0,
        "be": t.get("enchantScaling") or {}, "xe": t.get("extraEnchantScaling") or {},
        "tr": t.get("traits") or [], "res": resonance(iid, wg),
        "set": t.get("setName") or None, "sb": set_bonuses(t.get("setBonuses")), "rs": t.get("runeSlots") or 0,
        "perk": {"n": perk.get("name"), "d": perk.get("description"), "ic": ic(perk.get("icon"))} if perk else None,
        "d": (t.get("description") or "")[:500], "src": sources(iid), "cp": cp_key(iid, t.get("slot"), t.get("tier")), "o": origin,
    })
for t in TB_EQ: add_item(t, WG_EQ.get(t["id"]), "tlb")
for iid, t in WG_EQ.items():
    if iid not in seen:
        add_item({"id": iid, "name": t.get("name"), "slot": t.get("slot"), "category": t.get("category"), "grade": t.get("grade"),
                  "tier": t.get("tier"), "requiredLevel": t.get("requiredLevel"), "thumbnail": t.get("thumbnail"),
                  "baseStats": t.get("baseStats"), "extraStats": t.get("extraStats"), "enchantMaxLevel": t.get("enchantMaxLevel"),
                  "enchantScaling": t.get("enchantScaling"), "extraEnchantScaling": t.get("extraEnchantScaling"),
                  "traits": t.get("traits"), "setName": t.get("setName"), "setBonuses": t.get("setBonuses"),
                  "runeSlots": t.get("runeSlots"), "specialPerk": t.get("specialPerk"), "description": t.get("description")}, t, "tlwg")

# --- умения ---
skills = []
for s in TB_SK:
    wg = WG_SK.get(s["id"], {})
    wg_spec = {x["id"]: x for x in (wg.get("specializations") or []) if isinstance(x, dict)}
    top_spec = {x["id"]: x for x in (s.get("specializations") or []) if isinstance(x, dict)}
    levels = []
    for l in s.get("levelDetails") or []:
        if not l.get("available"): continue
        levels.append({"d": l.get("description") or "", "cd": l.get("cooldownSec"), "mp": l.get("manaCost"), "ct": l.get("castTime"),
                       "sp": {x["id"]: x.get("description") or "" for x in (l.get("specializations") or []) if isinstance(x, dict)}})
    spec_ids = list(dict.fromkeys(list(top_spec) + list(wg_spec)))
    specs = []
    for sid in spec_ids:
        a = top_spec.get(sid, {}); b = wg_spec.get(sid, {})
        specs.append({"id": sid, "n": a.get("name") or b.get("name") or sid, "ic": ic(a.get("icon") or b.get("icon")),
                      "d": a.get("description") or b.get("description") or "", "cost": a.get("cost", b.get("cost")), "ul": a.get("unlockLevel", b.get("unlockLevel"))})
    skills.append({"id": s["id"], "n": s.get("name"), "ic": ic(s.get("thumbnail")), "w": s.get("weapon"), "t": s.get("skillType"),
                   "cat": s.get("category"), "use": s.get("useType"), "dmg": s.get("damageType"), "d": s.get("description") or "",
                   "cd": s.get("cooldownSec"), "mp": s.get("manaCost"), "ct": s.get("castTime"), "hd": s.get("hitDelay"),
                   "rng": s.get("rangeM"), "lv": levels, "sp": specs, "st": TB_SKST.get(s["id"])})

# --- мастерство и артефакты ---
mastery = {"cap": TB_MS.get("pointsCap"), "order": TB_MS.get("weaponOrder"), "weapons": {}, "common": []}
for wk, w in TB_MS.get("weapons", {}).items():
    nodes = []
    for n in w.get("nodes", []):
        nodes.append({"id": n["id"], "n": n.get("name"), "cat": n.get("categoryLabel"), "type": n.get("type"), "ic": ic(n.get("icon")),
                      "max": n.get("maxLevel"), "req": n.get("requiredLevel"), "x": n.get("x"), "y": n.get("y"),
                      "st": n.get("stats") or [], "lv": n.get("levels") or [], "t": n.get("text") or ""})
    mastery["weapons"][wk] = {"n": w.get("name"), "ic": ic(w.get("icon")), "nodes": nodes}
for c in TB_MS.get("commonPassives", []):
    mastery["common"].append({"id": c["id"], "n": c.get("name"), "ic": ic(c.get("icon")), "t": c.get("text") or "", "req": c.get("requiredLevel")})
arts = {"slots": TB_ART.get("slots"), "items": {}, "sets": []}
_ai = TB_ART.get("items") or []
for a in (_ai.values() if isinstance(_ai, dict) else _ai):
    arts["items"][a["id"]] = {"n": a.get("name"), "slot": a.get("slot"), "g": a.get("grade"), "ic": ic(a.get("icon")), "d": (a.get("description") or "")[:300]}
_as = TB_ART.get("sets") or []
for s in (_as.values() if isinstance(_as, dict) else _as):
    arts["sets"].append({"id": s.get("id"), "n": s.get("name"), "items": s.get("items"),
                         "b": [{"p": b.get("pieces"), "s": b.get("stats") or {}, "n": b.get("passiveName"), "t": b.get("passiveText")} for b in (s.get("bonuses") or [])]})

# --- справочник: подписи, форматы, характеристики, руны ---
lvl55 = next((x for x in TB_ATTR.get("levelStats", []) if x.get("level") == 55), TB_ATTR.get("baseLevelStats"))
meta = {
    "built": time.strftime("%Y-%m-%d"),
    "labels": {k: v.strip() for k, v in WG_LAB.get("stats", {}).items()}, "fmt": WG_FMT,
    "grades": WG_LAB.get("grades", {}), "cats": WG_LAB.get("categories", {}),
    "traits": traits,
    "attr": {"conv": TB_ATTR["conversion"], "ms": TB_ATTR["milestones"], "init": TB_ATTR["initial"],
             "lvl": lvl55, "levels": TB_ATTR.get("levelStats"), "base": TB_ATTR["baseCharacter"]["stats"]},
    "cp": TB_CP,
    "runes": {"types": TB_RUNE.get("types"), "grades": TB_RUNE.get("grades"), "slots": TB_RUNE.get("slots")},
    "jsets": sorted({i["set"] for i in items if i["set"] and i["cat"] in ("Necklace", "Ring", "Bracelet", "Belt", "Earring")}),
}
# подписи для статов мастерства, которых нет в словаре build.tlwg.ru
EXTRA_LAB = {"melee_damage_dealt_modifier": "Урон (ближний бой)", "range_damage_dealt_modifier": "Урон (дальний бой)", "magic_damage_dealt_modifier": "Урон (магия)"}
for k, v in EXTRA_LAB.items():
    meta["labels"].setdefault(k, v); meta["fmt"].setdefault(k, {"mul": 0.01, "suffix": "%", "sign": True})
for w in mastery["weapons"].values():
    for n in w["nodes"]:
        for x in n.get("st") or []:
            if x.get("label") == x.get("stat"): x["label"] = meta["labels"].get(x["stat"], x["stat"])
        for L in n.get("lv") or []:
            for x in L.get("stats") or []:
                if x.get("label") == x.get("stat"): x["label"] = meta["labels"].get(x["stat"], x["stat"])
        if n.get("t"): n["t"] = re.sub(r"\b(melee|range|magic)_damage_dealt_modifier\b", lambda m: EXTRA_LAB[m.group(0)], n["t"])
os.makedirs(OUT, exist_ok=True)
sz = {"items.json": W("items.json", items), "skills.json": W("skills.json", skills), "meta.json": W("meta.json", meta),
      "mastery.json": W("mastery.json", mastery), "artifacts.json": W("artifacts.json", arts)}
print("предметов", len(items), "(tlb %d, tlwg %d)" % (sum(1 for i in items if i["o"] == "tlb"), sum(1 for i in items if i["o"] == "tlwg")),
      "| умений", len(skills), "| узлов мастерства", sum(len(w["nodes"]) for w in mastery["weapons"].values()),
      "| артефактов", len(arts["items"]), "| GS-шаблон найден у", sum(1 for i in items if i["cp"]), "предметов")
print("размеры, КБ:", {k: v // 1024 for k, v in sz.items()})

# --- иконки: одна папка data/ic, берём с build.tlwg.ru (там те же пути /Icons/...) ---
icdir = os.path.join(OUT, "ic"); os.makedirs(icdir, exist_ok=True)
old = os.path.join(ROOT, "builds", "ic")
if os.path.isdir(old):
    for f in os.listdir(old):
        if not os.path.exists(os.path.join(icdir, f)): os.replace(os.path.join(old, f), os.path.join(icdir, f))
missing = [n for n in icons if not os.path.exists(os.path.join(icdir, n))]
if "--icons" in sys.argv:
    got, fail = 0, []
    for n in missing:
        p = icons[n]
        try:
            rq = urllib.request.Request("https://build.tlwg.ru" + urllib.parse.quote(p), headers={"User-Agent": "tl-presets-builder"})
            b = urllib.request.urlopen(rq, timeout=20).read()
            if b[:4] in (b"RIFF", bytes([137, 80, 78, 71])): open(os.path.join(icdir, n), "wb").write(b); got += 1
            else: fail.append(n)
        except Exception: fail.append(n)
        time.sleep(0.2)
    print("иконок скачано", got, "нет на источнике", len(fail))
print("иконок нужно", len(icons), "есть", sum(1 for n in icons if os.path.exists(os.path.join(icdir, n))))
