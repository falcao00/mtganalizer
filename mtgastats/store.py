"""Banco local (SQLite) que acumula o histórico — o Arena sobrescreve o Player.log a cada sessão."""
import json
import os
import sqlite3
import time

from .carddb import CardDB, find_card_db
from .parser import LogParser, default_log_files


def data_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~/.local/share")
    d = os.path.join(base, "MTGAStats")
    os.makedirs(d, exist_ok=True)
    return d


SCHEMA = """
create table if not exists matches (
    match_id text primary key,
    start_ts real, end_ts real,
    event text, opponent text, result text, result_reason text,
    super_format text, variant text, win_condition text,
    deck_id text, deck_name text, deck_format text,
    player_id text,
    data text
);
create table if not exists cards (grp_id integer primary key, data text);
create table if not exists meta (key text primary key, value text);
-- endereço final da imagem no Scryfall ('' = carta desconhecida lá)
create table if not exists card_images (grp_id integer primary key, url text, ts real);
"""


class Store:
    def __init__(self, path=None):
        self.path = path or os.path.join(data_dir(), "stats.db")
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.executescript(SCHEMA)
        self._mtimes = {}

    # ----------------------------------------------------------------- meta
    def get_meta(self, key, default=None):
        row = self.conn.execute("select value from meta where key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set_meta(self, key, value):
        self.conn.execute("insert or replace into meta(key, value) values (?, ?)", (key, json.dumps(value)))

    # --------------------------------------------------------------- import
    def logs_changed(self, files=None):
        files = files or default_log_files()
        state = {f: os.path.getmtime(f) for f in files if os.path.isfile(f)}
        return state != self._mtimes

    def import_logs(self, files=None):
        files = files or default_log_files()
        if not files:
            return {"ok": False, "error": "Player.log não encontrado. O MTG Arena já foi aberto neste computador?"}
        parser = LogParser(known_player_id=self.get_meta("player_id"))
        parser.player_name = self.get_meta("player_name")
        parser.event_decks = self.get_meta("event_decks", {}) or {}
        parser.deck_catalog = self.get_meta("deck_catalog", {}) or {}
        for f in files:
            parser.parse_file(f)
        detailed = any(_detailed_logs(f) for f in files)

        before = self.conn.execute("select count(*) from matches").fetchone()[0]
        for m in parser.matches.values():
            self.conn.execute(
                "insert or replace into matches values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (m["match_id"], m["start_ts"], m["end_ts"], m["event"], m["opponent"], m["result"],
                 m["result_reason"], m["super_format"], m["variant"], m["win_condition"],
                 m["deck_id"], m["deck_name"], m["deck_format"], m["player_id"],
                 json.dumps({k: m[k] for k in ("main", "side", "command", "games")})),
            )
        if parser.player_id:
            self.set_meta("player_id", parser.player_id)
        if parser.player_name:
            self.set_meta("player_name", parser.player_name)
        if parser.rank:
            self.set_meta("rank", {**parser.rank, "ts": time.time()})
        if parser.install_dir:
            self.set_meta("install_dir", parser.install_dir)
        self.set_meta("event_decks", parser.event_decks)
        self.set_meta("deck_catalog", parser.deck_catalog)
        self.set_meta("last_import", time.time())
        self.conn.commit()
        after = self.conn.execute("select count(*) from matches").fetchone()[0]
        if files == default_log_files():
            self._mtimes = {f: os.path.getmtime(f) for f in files}
        cards = self._resolve_cards()
        return {"ok": True, "found": len(parser.matches), "new": after - before, "total": after,
                "detailed_logs": detailed, "cards": cards}

    # ---------------------------------------------------------------- cards
    def _resolve_cards(self):
        """Busca no banco do Arena os nomes/cores das cartas ainda não conhecidas."""
        known = {r[0] for r in self.conn.execute("select grp_id from cards")}
        needed = set()
        for (data,) in self.conn.execute("select data from matches"):
            d = json.loads(data)
            for zone in ("main", "side", "command"):
                needed.update(g for g, _ in d.get(zone, []))
            for g in d.get("games", []):
                needed.update(g["my_seen"])
                needed.update(g["opp_seen"])
        missing = needed - known
        if not missing:
            return {"missing": 0}
        install = self.get_meta("install_dir")
        path = find_card_db([install] if install else [])
        if not path:
            return {"missing": len(missing), "error": "Banco de cartas do Arena não encontrado"}
        db = CardDB(path)
        found = db.lookup(missing)
        self.conn.executemany("insert or replace into cards values (?, ?)",
                              [(g, json.dumps(v)) for g, v in found.items()])
        self.conn.commit()
        return {"missing": len(missing) - len(found)}

    # ----------------------------------------------------------------- read
    def load_all(self):
        player_id = self.get_meta("player_id")
        matches = []
        for row in self.conn.execute(
            "select match_id, start_ts, end_ts, event, opponent, result, result_reason, super_format,"
            " variant, win_condition, deck_id, deck_name, deck_format, player_id, data"
            " from matches order by start_ts"
        ):
            (mid, st, et, ev, opp, res, rr, sf, var, wc, did, dname, dfmt, pid, data) = row
            if player_id and pid and pid != player_id:
                continue   # outra conta jogada neste computador
            d = json.loads(data)
            matches.append({"id": mid, "start": st, "end": et, "event": ev, "opponent": opp,
                            "result": res, "reason": rr, "superFormat": sf, "variant": var,
                            "winCondition": wc, "deckId": did, "deckName": dname, "deckFormat": dfmt,
                            **d})
        cards = {str(g): json.loads(v) for g, v in self.conn.execute("select grp_id, data from cards")}
        for g, url in self.conn.execute("select grp_id, url from card_images where url != ''"):
            if str(g) in cards:
                cards[str(g)]["img"] = url
        return {"matches": matches, "cards": cards,
                "player": {"id": player_id, "name": self.get_meta("player_name")},
                "rank": self.get_meta("rank"), "lastImport": self.get_meta("last_import"),
                "dbPath": self.path}


    # ------------------------------------------------------------- imagens
    NOT_FOUND_RETRY = 7 * 86400   # tenta de novo cartas que o Scryfall não conhecia após 7 dias

    def image_urls(self, ids):
        """{id: url} já guardados, e a lista dos que ainda precisam ser consultados."""
        ids = {int(i) for i in ids}
        known, missing = {}, []
        rows = {g: (u, t) for g, u, t in self.conn.execute("select grp_id, url, ts from card_images")}
        now = time.time()
        for i in ids:
            if i in rows and (rows[i][0] or now - rows[i][1] < self.NOT_FOUND_RETRY):
                known[i] = rows[i][0]
            else:
                missing.append(i)
        return known, missing

    def save_image_url(self, grp_id, url):
        self.conn.execute("insert or replace into card_images values (?, ?, ?)", (int(grp_id), url, time.time()))
        self.conn.commit()

    def card_name_en(self, grp_id):
        row = self.conn.execute("select data from cards where grp_id=?", (int(grp_id),)).fetchone()
        return json.loads(row[0]).get("name_en") if row else None


def _detailed_logs(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for i, line in enumerate(fh):
                if "DETAILED LOGS:" in line:
                    return "ENABLED" in line
                if i > 5000:
                    break
    except OSError:
        pass
    return False
