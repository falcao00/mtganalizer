"""MTGA Stats — análise de partidas do MTG Arena (janela desktop via pywebview)."""
import os
import sys
import threading

import webview

from mtgastats.parser import default_log_files
from mtgastats.store import Store

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


class Api:
    def __init__(self):
        self._store = Store()
        self._lock = threading.Lock()

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
    webview.start(debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
