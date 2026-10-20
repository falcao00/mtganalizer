"""Descobre o endereço final da imagem de uma carta no Scryfall.

A API (api.scryfall.com) tem limite de ~10 pedidos/s; o endereço final (cards.scryfall.io) não.
Por isso cada carta é consultada uma única vez e o endereço fica guardado no banco local.
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.scryfall.com"
HEADERS = {"User-Agent": "MTGAStats/1.0", "Accept": "application/json"}
MIN_INTERVAL = 0.1   # segundos entre pedidos à API

_last_request = 0.0


def _get(url):
    global _last_request
    wait = MIN_INTERVAL - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.load(resp)


def _image_of(data):
    uris = data.get("image_uris") or ((data.get("card_faces") or [{}])[0].get("image_uris")) or {}
    return uris.get("normal") or uris.get("large") or uris.get("small") or ""


def resolve(grp_id, name_en=None):
    """Retorna a URL da imagem ('' se o Scryfall não conhece a carta) ou None em erro de rede."""
    try:
        return _image_of(_get(f"{API}/cards/arena/{int(grp_id)}"))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            return None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
    if not name_en:
        return ""
    try:   # cartas exclusivas do Arena podem não ter o ID; tenta pelo nome
        return _image_of(_get(f"{API}/cards/named?exact={urllib.parse.quote(name_en)}"))
    except urllib.error.HTTPError as e:
        return "" if e.code == 404 else None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
