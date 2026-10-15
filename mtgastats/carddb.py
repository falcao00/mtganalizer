"""Leitura do banco de cartas local do MTG Arena (Raw_CardDatabase_*.mtga, SQLite)."""
import glob
import os
import re
import sqlite3

COLOR_CODES = {"1": "W", "2": "U", "3": "B", "4": "R", "5": "G"}
RARITY = {0: "token", 1: "basic", 2: "common", 3: "uncommon", 4: "rare", 5: "mythic"}

DEFAULT_INSTALL_DIRS = [
    r"C:\Program Files (x86)\Steam\steamapps\common\MTGA",
    r"C:\Program Files\Steam\steamapps\common\MTGA",
    r"C:\Program Files\Wizards of the Coast\MTGA",
    r"C:\Program Files (x86)\Wizards of the Coast\MTGA",
    r"C:\Program Files\Epic Games\MagicTheGathering",
    os.path.expanduser("~/Library/Application Support/com.wizards.mtga"),
]

_MANA_TOKEN = re.compile(r"o([^o]+)")


def find_card_db(extra_dirs=()):
    """Retorna o caminho do Raw_CardDatabase mais recente, ou None."""
    candidates = []
    for base in list(extra_dirs) + DEFAULT_INSTALL_DIRS:
        if not base:
            continue
        pattern = os.path.join(base, "**", "Raw_CardDatabase_*.mtga")
        candidates += glob.glob(pattern, recursive=True)
    if not candidates:
        return None
    return max(candidates, key=os.path.getmtime)


def parse_mana_cost(text):
    """'o4oGoG' -> ('{4}{G}{G}', 6)."""
    if not text:
        return "", 0
    symbols = _MANA_TOKEN.findall(text)
    cmc = 0
    for s in symbols:
        if s.isdigit():
            cmc += int(s)
        elif s in ("X", "Y", "Z"):
            pass
        else:
            cmc += 1
    return "".join("{%s}" % s for s in symbols), cmc


class CardDB:
    def __init__(self, path):
        self.path = path
        self.conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        tables = {r[0] for r in self.conn.execute("select name from sqlite_master where type='table'")}
        self.loc_pt = "Localizations_ptBR" if "Localizations_ptBR" in tables else None
        self.loc_en = "Localizations_enUS" if "Localizations_enUS" in tables else "Localizations"
        self._type_names = self._load_enum_names("CardType")

    def _loc(self, table, loc_id):
        if not table or loc_id is None:
            return None
        row = self.conn.execute(
            f"select Loc from {table} where LocId=? order by Formatted limit 1", (loc_id,)
        ).fetchone()
        return row[0] if row else None

    def _load_enum_names(self, enum_type):
        names = {}
        try:
            for value, loc_id in self.conn.execute(
                "select Value, LocId from Enums where Type=?", (enum_type,)
            ):
                names[str(value)] = self._loc(self.loc_pt, loc_id) or self._loc(self.loc_en, loc_id) or ""
        except sqlite3.Error:
            pass
        return names

    def lookup(self, grp_ids):
        """Retorna {grpId: info} para os ids encontrados."""
        out = {}
        ids = list({int(g) for g in grp_ids})
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            q = ",".join("?" * len(chunk))
            rows = self.conn.execute(
                f"select GrpId, TitleId, ExpansionCode, Rarity, Colors, ColorIdentity, Types,"
                f" OldSchoolManaText, IsToken from Cards where GrpId in ({q})",
                chunk,
            ).fetchall()
            for grp, title, setc, rarity, colors, ident, types, mana, is_token in rows:
                name_en = self._loc(self.loc_en, title) or f"#{grp}"
                name_pt = self._loc(self.loc_pt, title) or name_en
                type_ids = [t for t in (types or "").split(",") if t]
                type_names = [self._type_names.get(t, "") for t in type_ids]
                cost, cmc = parse_mana_cost(mana)
                out[grp] = {
                    "id": grp,
                    "name": name_pt,
                    "name_en": name_en,
                    "set": setc or "",
                    "rarity": RARITY.get(rarity, ""),
                    "colors": "".join(COLOR_CODES.get(c, "") for c in (colors or "").split(",")),
                    "identity": "".join(COLOR_CODES.get(c, "") for c in (ident or "").split(",")),
                    "types": " ".join(t for t in type_names if t),
                    "is_land": "5" in type_ids,
                    "is_creature": "2" in type_ids,
                    "cost": cost,
                    "cmc": cmc,
                    "token": bool(is_token),
                }
        return out
