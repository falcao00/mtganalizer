"""Confere uma lista de deck colada (formato de exportação do Arena) contra a coleção."""
import re
import unicodedata

from .carddb import RARITY

RARITIES = ("common", "uncommon", "rare", "mythic")
MAX_COPIES = 4       # com 4 cópias o Arena libera cartas de "quantidade ilimitada"

SECTIONS = {
    "deck": "deck", "baralho": "deck", "main": "deck", "mainboard": "deck",
    "sideboard": "side", "reserva": "side", "side": "side",
    "commander": "commander", "comandante": "commander",
    "companion": "companion", "companheiro": "companion",
    "maybeboard": None, "about": None, "sobre": None,
}
LINE_RE = re.compile(r"^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9_]+)\)(?:\s+(\S+))?)?\s*(?:\*\w+\*)?\s*$")


def norm(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.replace("’", "'").lower().replace("///", "//")
    return re.sub(r"\s+", " ", s).strip()


def parse_deck(text):
    """Retorna [{qty, name, set, num, section}] a partir do texto colado."""
    section, items, seen_cards = "deck", [], False
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", "//")):
            # linha em branco depois das cartas: no Arena separa deck de sideboard
            if not line and seen_cards and section == "deck":
                section = "side?"
            continue
        key = line.rstrip(":").lower()
        if key in SECTIONS:
            section = SECTIONS[key]
            continue
        if section is None or line.lower().startswith("name "):
            continue
        m = LINE_RE.match(line)
        if not m:
            continue
        if section == "side?":
            section = "side"
        seen_cards = True
        items.append({"qty": int(m.group(1)), "name": m.group(2).strip(), "set": (m.group(3) or "").upper(),
                      "num": m.group(4) or "", "section": section})
    return items


class CardIndex:
    """Índice nome → impressões, montado a partir do banco de cartas do Arena."""

    def __init__(self, carddb):
        conn = carddb.conn
        # faces secundárias (verso, aventura...) têm LinkedFaceType ímpar e não são itens da coleção
        rows = conn.execute("select GrpId, TitleId, ExpansionCode, CollectorNumber, Rarity, IsPrimaryCard from Cards"
                            " where IsToken = 0 and LinkedFaceType % 2 = 0").fetchall()
        titles = {r[1] for r in rows}
        names = {}
        for table in (carddb.loc_en, carddb.loc_pt):
            if not table:
                continue
            for loc_id, loc in conn.execute(f"select LocId, Loc from {table} order by Formatted desc"):
                if loc_id in titles:
                    names.setdefault(table, {})[loc_id] = loc
        en, pt = names.get(carddb.loc_en, {}), names.get(carddb.loc_pt, {})
        self.prints = {}        # title -> [(grp, set, num, rarity, primary)]
        self.by_name = {}       # nome normalizado -> title
        self.name_en = en
        for grp, title, setc, num, rarity, primary in rows:
            self.prints.setdefault(title, []).append(
                (grp, (setc or "").upper(), str(num or ""), RARITY.get(rarity, ""), bool(primary)))
        for title in self.prints:
            for nm in (en.get(title), pt.get(title)):
                if not nm:
                    continue
                n = norm(nm)
                self.by_name.setdefault(n, title)
                if " // " in n:                  # cartas duplas: aceita só a primeira face
                    self.by_name.setdefault(n.split(" // ")[0], title)

    def find(self, name):
        return self.by_name.get(norm(name))


def check(text, index, collection, wildcards):
    """Compara o deck colado com a coleção e as wildcards."""
    items = parse_deck(text)
    need, unknown = {}, []
    for it in items:
        title = index.find(it["name"])
        if title is None:
            unknown.append(it["name"])
            continue
        e = need.setdefault(title, {"qty": 0, "set": "", "num": "", "sections": []})
        e["qty"] += it["qty"]
        if it["set"] and not e["set"]:
            e["set"], e["num"] = it["set"], it["num"]
        if it["section"] not in e["sections"]:
            e["sections"].append(it["section"])

    rows = []
    missing = dict.fromkeys(RARITIES, 0)
    for title, e in need.items():
        prints = index.prints[title]
        owned = sum(collection.get(grp, 0) for grp, *_ in prints)
        chosen = next((p for p in prints if p[1] == e["set"] and p[2] == e["num"]), None) \
            or next((p for p in prints if p[1] == e["set"]), None)
        craftable = [p for p in prints if p[3] in RARITIES]
        if not chosen:
            # sem impressão indicada: a principal mais barata de craftar
            chosen = min(craftable, key=lambda p: (not p[4], RARITIES.index(p[3]))) if craftable else prints[0]
        basic = any(p[3] == "basic" for p in prints)
        rarity = "basic" if basic else chosen[3]
        if basic or owned >= MAX_COPIES:
            miss = 0
        else:
            miss = max(0, e["qty"] - owned)
        if miss and rarity in missing:
            missing[rarity] += miss
        rows.append({"id": chosen[0], "name_en": index.name_en.get(title, ""), "qty": e["qty"], "owned": owned,
                     "missing": miss, "rarity": rarity, "sections": e["sections"]})

    summary = {r: {"missing": missing[r], "have": (wildcards or {}).get(r, 0),
                   "ok": missing[r] <= (wildcards or {}).get(r, 0)} for r in RARITIES}
    return {"rows": rows, "unknown": unknown, "summary": summary,
            "total": sum(e["qty"] for e in need.values()),
            "can_craft": all(s["ok"] for s in summary.values()),
            "complete": not any(missing.values())}
