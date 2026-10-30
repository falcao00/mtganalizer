"""Parser do Player.log do MTG Arena (requer "Detailed Logs (Plugin Support)" ativado).

Extrai partidas concluídas com resultado, jogos (games), deck usado, cartas vistas
de cada lado, além do catálogo de decks e do rank atual.
"""
import json
import os
import re

LOG_DIR_WIN = os.path.expanduser(r"~\AppData\LocalLow\Wizards Of The Coast\MTGA")
LOG_DIR_MAC = os.path.expanduser("~/Library/Logs/Wizards Of The Coast/MTGA")

MATCH_TO_RE = re.compile(r"Match to ([A-Za-z0-9]+): ")
REQUEST_RE = re.compile(r"==> (\w+) (\{.*\})\s*$")
RESPONSE_RE = re.compile(r"^<== (\w+)\(")
INSTALL_RE = re.compile(r"from file: (.+?)/MTGA_Data/")

WILDCARD_KEYS = {"common": "WildCardCommons", "uncommon": "WildCardUnCommons",
                 "rare": "WildCardRares", "mythic": "WildCardMythics"}

CARD_OBJECT_TYPES = {"GameObjectType_Card", "GameObjectType_MDFCBack",
                     "GameObjectType_SplitLeft", "GameObjectType_SplitRight"}


def default_log_files():
    for d in (LOG_DIR_WIN, LOG_DIR_MAC):
        if os.path.isdir(d):
            # ordem cronológica: sessão anterior primeiro
            return [p for p in (os.path.join(d, "Player-prev.log"), os.path.join(d, "Player.log"))
                    if os.path.isfile(p)]
    return []


def _attr(attributes, name):
    for a in attributes or []:
        if a.get("name", "").lower() == name.lower():
            return (a.get("value") or "").strip('"')
    return ""


def _deck_from(summary, deck, event=None):
    summary = summary or {}
    deck = deck or {}
    return {
        "deck_id": summary.get("DeckId") or summary.get("DeckIdInternal") or "",
        "name": summary.get("Name") or "",
        "format": _attr(summary.get("Attributes"), "Format"),
        "main": [[c["cardId"], c.get("quantity", 1)] for c in deck.get("MainDeck") or []],
        "side": [[c["cardId"], c.get("quantity", 1)] for c in deck.get("Sideboard") or []],
        "command": [[c["cardId"], c.get("quantity", 1)] for c in deck.get("CommandZone") or []],
        "event": event,
    }


def _count(ids):
    out = {}
    for g in ids:
        out[g] = out.get(g, 0) + 1
    return out


class LogParser:
    def __init__(self, known_player_id=None):
        self.player_id = known_player_id
        self.player_name = None
        self.install_dir = None
        self.deck_catalog = {}     # deck_id -> deck
        self.event_decks = {}      # event name -> deck
        self.rank = None
        self.wildcards = None      # última posição de wildcards vista no log
        self.matches = {}          # match_id -> match concluída
        self._open = {}            # match_id -> match em andamento
        self._current_id = None

    # ------------------------------------------------------------------ leitura
    def parse_file(self, path):
        with open(path, encoding="utf-8", errors="replace") as fh:
            pending_response = None
            buf = None
            for raw in fh:
                line = raw.rstrip("\r\n")
                if buf is not None:            # JSON multi-linha
                    buf.append(line)
                    if line.startswith("}"):
                        self._try_json("\n".join(buf), pending_response)
                        buf, pending_response = None, None
                    elif len(buf) > 20000:
                        buf = None
                    continue
                if not line:
                    continue
                c = line[0]
                if c == "{":
                    if not self._try_json(line, pending_response) and line.strip() == "{":
                        buf = [line]
                        continue
                    pending_response = None
                    continue
                if c == "<":
                    m = RESPONSE_RE.match(line)
                    pending_response = m.group(1) if m else None
                    continue
                if c == "[":
                    if "==> " in line:
                        m = REQUEST_RE.search(line)
                        if m:
                            self._handle_request(m.group(1), m.group(2))
                    elif "Match to " in line and not self.player_id:
                        m = MATCH_TO_RE.search(line)
                        if m:
                            self.player_id = m.group(1)
                    elif "from file:" in line and not self.install_dir:
                        m = INSTALL_RE.search(line)
                        if m:
                            self.install_dir = m.group(1)
                    pending_response = None
                    # algumas versões colocam o JSON na mesma linha do cabeçalho
                    i = line.find("{ \"")
                    if i > 0 and "==> " not in line:
                        self._try_json(line[i:], None)

    def _try_json(self, text, response_name):
        try:
            obj = json.loads(text)
        except ValueError:
            return False
        if isinstance(obj, dict):
            self._handle_obj(obj, response_name)
        return True

    # ---------------------------------------------------------------- handlers
    def _handle_request(self, name, text):
        try:
            outer = json.loads(text)
            req = outer.get("request")
            req = json.loads(req) if isinstance(req, str) else (req or {})
        except ValueError:
            return
        if name.startswith("EventSetDeck"):
            deck = _deck_from(req.get("Summary"), req.get("Deck"), req.get("EventName"))
            if req.get("EventName"):
                self.event_decks[req["EventName"]] = deck
            if deck["deck_id"]:
                self.deck_catalog[deck["deck_id"]] = deck
        elif name.startswith("DeckUpsertDeck"):
            deck = _deck_from(req.get("Summary"), req.get("Deck"))
            if deck["deck_id"]:
                self.deck_catalog[deck["deck_id"]] = deck

    def _handle_obj(self, obj, response_name):
        inv = obj.get("InventoryInfo")   # vem junto com o StartHook e com respostas de eventos
        if isinstance(inv, dict) and "WildCardRares" in inv:
            self.wildcards = {r: inv.get(k, 0) for r, k in WILDCARD_KEYS.items()}
        if "greToClientEvent" in obj:
            self._handle_gre(obj["greToClientEvent"].get("greToClientMessages") or [])
        elif "matchGameRoomStateChangedEvent" in obj:
            self._handle_room(obj["matchGameRoomStateChangedEvent"], obj.get("timestamp"))
        elif "authenticateResponse" in obj:
            a = obj["authenticateResponse"]
            self.player_id = a.get("clientId") or self.player_id
            self.player_name = a.get("screenName") or self.player_name
        elif response_name == "StartHook" or "DeckSummaries" in obj:
            internals = obj.get("DecksInternal") or {}
            for s in obj.get("DeckSummaries") or []:
                did = s.get("DeckIdInternal") or s.get("DeckId")
                if did:
                    self.deck_catalog[did] = _deck_from(s, internals.get(did))
        elif "Courses" in obj:
            for c in obj.get("Courses") or []:
                if c.get("CourseDeckSummary") and c.get("InternalEventName"):
                    deck = _deck_from(c["CourseDeckSummary"], c.get("CourseDeck"), c["InternalEventName"])
                    self.event_decks.setdefault(c["InternalEventName"], deck)
                    if deck["deck_id"]:
                        self.deck_catalog.setdefault(deck["deck_id"], deck)
        elif "constructedClass" in obj or "limitedClass" in obj:
            self.rank = obj

    def _handle_room(self, ev, ts):
        info = ev.get("gameRoomInfo") or {}
        cfg = info.get("gameRoomConfig") or {}
        match_id = cfg.get("matchId")
        if not match_id:
            return
        m = self._open.get(match_id) or self._new_match(match_id, cfg, ts)
        state = info.get("stateType")
        if state == "MatchGameRoomStateType_MatchCompleted":
            res = info.get("finalMatchResult") or {}
            m["end_ts"] = _ms(ts) or m["start_ts"]
            m["reason"] = res.get("matchCompletedReason", "")
            game_results = []
            for r in res.get("resultList") or []:
                won = _won(r, m["my_team"])
                if r.get("scope") == "MatchScope_Match":
                    m["result"] = won
                    m["result_reason"] = (r.get("reason") or "").replace("ResultReason_", "")
                elif r.get("scope") == "MatchScope_Game":
                    game_results.append(won)
            # completa jogos que não vimos via GRE
            for i, won in enumerate(game_results, start=1):
                g = m["games"].setdefault(i, _new_game(i))
                if g["result"] is None:
                    g["result"] = won
            if m.get("result") is not None or game_results:
                self.matches[match_id] = self._finalize(m)
            self._open.pop(match_id, None)
            if self._current_id == match_id:
                self._current_id = None

    def _new_match(self, match_id, cfg, ts):
        players = cfg.get("reservedPlayers") or []
        me = next((p for p in players if p.get("userId") == self.player_id), None)
        if me is None and self.player_name:
            me = next((p for p in players if p.get("playerName") == self.player_name), None)
        if me is None and players:
            me = players[0]
        opp = next((p for p in players if p is not me), {}) if me else {}
        if me and not self.player_name and me.get("userId") == self.player_id:
            self.player_name = me.get("playerName")
        event = (me or {}).get("eventId", "")
        m = {
            "match_id": match_id,
            "start_ts": _ms(ts),
            "end_ts": None,
            "event": event,
            "my_seat": (me or {}).get("systemSeatId", 1),
            "my_team": (me or {}).get("teamId", 1),
            "opp_seat": opp.get("systemSeatId", 2),
            "opponent": opp.get("playerName", ""),
            "result": None,
            "result_reason": "",
            "reason": "",
            "super_format": "",
            "variant": "",
            "win_condition": "",
            "games": {},
            "deck_cards": None,
            "side_cards": None,
            "command_cards": None,
            "deck": self.event_decks.get(event),
            "my_seen": set(),
            "opp_seen": set(),
        }
        self._open[match_id] = m
        self._current_id = match_id
        return m

    def _handle_gre(self, messages):
        m = self._open.get(self._current_id) if self._current_id else None
        for msg in messages:
            mtype = msg.get("type")
            if mtype == "GREMessageType_ConnectResp":
                dm = (msg.get("connectResp") or {}).get("deckMessage") or {}
                if m is not None and m["deck_cards"] is None:
                    m["deck_cards"] = dm.get("deckCards") or []
                    m["side_cards"] = dm.get("sideboardCards") or []
                    m["command_cards"] = dm.get("commandZoneGRPIds") or []
            elif mtype == "GREMessageType_GameStateMessage":
                gsm = msg.get("gameStateMessage") or {}
                gi = gsm.get("gameInfo") or {}
                mid = gi.get("matchID")
                if mid and mid in self._open:
                    m = self._open[mid]
                    self._current_id = mid
                if m is None:
                    continue
                self._handle_state(m, gsm, gi)

    def _handle_state(self, m, gsm, gi):
        if gi.get("superFormat"):
            m["super_format"] = gi["superFormat"].replace("SuperFormat_", "")
        if gi.get("variant"):
            m["variant"] = gi["variant"].replace("GameVariant_", "")
        if gi.get("matchWinCondition"):
            m["win_condition"] = gi["matchWinCondition"].replace("MatchWinCondition_", "")
        num = gi.get("gameNumber") or (max(m["games"]) if m["games"] else 1)
        g = m["games"].setdefault(num, _new_game(num))

        ti = gsm.get("turnInfo") or {}
        tn = ti.get("turnNumber")
        if tn:
            g["turns"] = max(g["turns"], tn)
        # quem começa já vem como activePlayer durante o mulligan (antes do turno 1);
        # assim jogos encerrados antes do primeiro turno também ganham Play/Draw
        if g["on_play"] is None and ti.get("activePlayer") and (not tn or tn == 1):
            g["on_play"] = ti["activePlayer"] == m["my_seat"]
        for p in gsm.get("players") or []:
            mc = p.get("mulliganCount")
            if mc is None:
                continue
            if p.get("systemSeatNumber") == m["my_seat"]:
                g["my_mulligans"] = max(g["my_mulligans"], mc)
            else:
                g["opp_mulligans"] = max(g["opp_mulligans"], mc)

        zone_types = m.setdefault("zone_types", {})
        for z in gsm.get("zones") or []:
            zone_types[z.get("zoneId")] = z.get("type")
        brawl = "Brawl" in m["variant"] or "Commander" in m["variant"]

        for o in gsm.get("gameObjects") or []:
            if o.get("type") not in CARD_OBJECT_TYPES or not o.get("grpId"):
                continue
            grp = o["grpId"]
            # em Brawl, carta na zona de comando = comandante
            in_command = brawl and zone_types.get(o.get("zoneId")) == "ZoneType_Command"
            if o.get("ownerSeatId") == m["my_seat"]:
                g["my_seen"].add(grp)
            elif o.get("ownerSeatId") == m["opp_seat"]:
                g["opp_seen"].add(grp)
                if in_command:
                    g["opp_commander"].add(grp)

        if gi.get("stage") == "GameStage_GameOver" and g["result"] is None:
            for r in gi.get("results") or []:
                if r.get("scope") == "MatchScope_Game":
                    g["result"] = _won(r, m["my_team"])

    # ---------------------------------------------------------------- finalize
    def _finalize(self, m):
        deck = m["deck"]
        cards = m["deck_cards"]
        if cards:
            matched = self._match_deck(cards, m["command_cards"] or [])
            if matched and (not deck or not _same_cards(deck, cards)):
                deck = matched
        main = [[g, n] for g, n in _count(cards).items()] if cards else (deck or {}).get("main", [])
        side = [[g, n] for g, n in _count(m["side_cards"]).items()] if m["side_cards"] else (deck or {}).get("side", [])
        command = [[g, 1] for g in m["command_cards"]] if m["command_cards"] else (deck or {}).get("command", [])
        games = []
        my_seen, opp_seen = set(), set()
        for num in sorted(m["games"]):
            g = m["games"][num]
            my_seen |= g["my_seen"]
            opp_seen |= g["opp_seen"]
            games.append({
                "n": num, "result": g["result"], "on_play": g["on_play"], "turns": g["turns"],
                "my_mulligans": g["my_mulligans"], "opp_mulligans": g["opp_mulligans"],
                "my_seen": sorted(g["my_seen"]), "opp_seen": sorted(g["opp_seen"]),
                "opp_commander": sorted(g["opp_commander"]),
            })
        result = m["result"]
        if result is None and games:
            w = sum(1 for g in games if g["result"] == "win")
            l = sum(1 for g in games if g["result"] == "loss")
            result = "win" if w > l else "loss" if l > w else "draw"
        return {
            "match_id": m["match_id"],
            "start_ts": m["start_ts"],
            "end_ts": m["end_ts"],
            "event": m["event"],
            "opponent": m["opponent"],
            "result": result,
            "result_reason": m["result_reason"],
            "super_format": m["super_format"],
            "variant": m["variant"],
            "win_condition": m["win_condition"],
            "deck_id": (deck or {}).get("deck_id", ""),
            "deck_name": (deck or {}).get("name", "") or "Deck desconhecido",
            "deck_format": (deck or {}).get("format", ""),
            "main": main,
            "side": side,
            "command": command,
            "games": games,
            "player_id": self.player_id,
        }

    def _match_deck(self, deck_cards, command):
        """Encontra no catálogo o deck mais parecido com as cartas do ConnectResp."""
        target = _count(deck_cards + list(command))
        total = sum(target.values())
        best, best_score = None, 0.0
        for d in self.deck_catalog.values():
            cand = {}
            for g, n in d["main"] + d["command"]:
                cand[g] = cand.get(g, 0) + n
            if not cand:
                continue
            inter = sum(min(n, cand.get(g, 0)) for g, n in target.items())
            union = total + sum(cand.values()) - inter
            score = inter / union if union else 0
            if score > best_score:
                best, best_score = d, score
        return best if best_score >= 0.6 else None


def _same_cards(deck, cards):
    a = _count(cards)
    b = {g: n for g, n in deck.get("main", [])}
    return a == b


def _new_game(n):
    return {"n": n, "result": None, "on_play": None, "turns": 0, "my_mulligans": 0,
            "opp_mulligans": 0, "my_seen": set(), "opp_seen": set(), "opp_commander": set()}


def _won(result, my_team):
    if result.get("result") == "ResultType_Draw" or "winningTeamId" not in result:
        return "draw"
    return "win" if result.get("winningTeamId") == my_team else "loss"


def _ms(ts):
    try:
        return int(ts) / 1000.0
    except (TypeError, ValueError):
        return None
