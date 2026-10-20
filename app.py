"""MTGA Stats — análise de partidas do MTG Arena (janela desktop via pywebview)."""
import os
import sys
import threading

import webview

from mtgastats import images
from mtgastats.parser import default_log_files
from mtgastats.store import Store, data_dir

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


class Api:
    def __init__(self):
        self._store = Store()
        self._lock = threading.Lock()
        self._img_lock = threading.Lock()   # uma consulta ao Scryfall por vez

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
