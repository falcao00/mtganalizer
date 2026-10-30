"""MTGA Stats — análise de partidas do MTG Arena (janela desktop via pywebview)."""
import os
import sys
import threading

import webview

from mtgastats import collection, craft, images
from mtgastats.carddb import CardDB, find_card_db
from mtgastats.parser import default_log_files
from mtgastats.store import Store, data_dir

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


class Api:
    def __init__(self):
        self._store = Store()
        self._lock = threading.Lock()
        self._img_lock = threading.Lock()   # uma consulta ao Scryfall por vez
        self._index = None                  # índice de nomes do banco de cartas (montado no 1º uso)
        self._carddb_path = None

    def get_data(self):
        with self._lock:
            return self._store.load_all()

    def refresh(self):
        with self._lock:
            return self._store.import_logs()

    def check_updates(self):
        """Chamado periodicamente pela interface: reimporta se o log mudou."""
        with self._lock:
            if not self._store.logs_changed():
                return {"changed": False}
            res = self._store.import_logs()
            return {"changed": True, **res}

    def import_file(self):
        win = webview.windows[0]
        paths = win.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True,
                                       file_types=("Logs do MTGA (*.log)", "Todos (*.*)"))
        if not paths:
            return {"ok": False, "cancelled": True}
        with self._lock:
            return self._store.import_logs(list(paths))

    def resolve_images(self, ids):
        """Retorna {id: url} das imagens; consulta o Scryfall só para as que ainda não estão no banco."""
        with self._lock:
            known, missing = self._store.image_urls(ids)
        if missing:
            with self._img_lock:
                for grp in missing:
                    with self._lock:
                        name_en = self._store.card_name_en(grp)
                    url = images.resolve(grp, name_en)
                    if url is None:        # erro de rede: não guarda, tenta de novo outra hora
                        continue
                    with self._lock:
                        self._store.save_image_url(grp, url)
                    known[grp] = url
        return {str(k): v for k, v in known.items()}

    # ------------------------------------------------------------- coleção
    def read_collection(self):
        """Lê a coleção da memória do Arena aberto e guarda no banco."""
        try:
            col = collection.read_collection()
        except collection.CollectionError as e:
            with self._lock:
                return {"ok": False, "error": str(e), **self._store.collection_info()}
        with self._lock:
            self._store.save_collection(col)
            return {"ok": True, **self._store.collection_info()}

    def collection_info(self):
        with self._lock:
            return self._store.collection_info()

    def check_deck(self, text):
        """Confere a lista colada contra a coleção (relida do Arena se ele estiver aberto)."""
        read = self.read_collection()
        if not read["ts"]:
            return {"ok": False, "error": read.get("error") or "Coleção ainda não lida.", "collection": read}
        index = self._card_index()
        if not index:
            return {"ok": False, "error": "Banco de cartas do Arena não encontrado.", "collection": read}
        with self._lock:
            cards, _ = self._store.collection()
            wildcards = self._store.get_meta("wildcards") or {}
            res = craft.check(text, index, cards, wildcards)
            # nomes/imagens das cartas da lista ficam disponíveis para a interface
            new = {r["id"] for r in res["rows"]} - self._store.known_card_ids()
            if new:   # conexão nova: o pywebview chama a API de threads diferentes
                self._store.save_cards(CardDB(self._carddb_path).lookup(new))
            ids = [r["id"] for r in res["rows"]]
            cards_info = {str(k): v for k, v in self._store.load_cards(ids).items()}
        return {"ok": True, **res, "cards": cards_info, "collection": read}

    def _card_index(self):
        if self._index is None:
            with self._lock:
                install = self._store.get_meta("install_dir")
            path = find_card_db([install] if install else [])
            if not path:
                return None
            self._carddb_path = path
            self._index = craft.CardIndex(CardDB(path))
        return self._index

    def log_info(self):
        return {"files": default_log_files(), "db": self._store.path}

    def open_folder(self, which):
        path = os.path.dirname(self._store.path) if which == "db" else os.path.dirname((default_log_files() or [""])[0])
        if path and os.path.isdir(path) and sys.platform == "win32":
            os.startfile(path)


def main():
    api = Api()
    webview.create_window("MTGA Stats", os.path.join(BASE, "web", "index.html"), js_api=api,
                          width=1360, height=880, min_size=(960, 640), background_color="#0d0d0d")
    # private_mode=False mantém o cache de imagens da janela entre uma abertura e outra
    webview.start(debug="--debug" in sys.argv, private_mode=False,
                  storage_path=os.path.join(data_dir(), "webview"))


if __name__ == "__main__":
    main()
