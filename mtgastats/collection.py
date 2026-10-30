"""Leitura da coleção de cartas direto da memória do MTG Arena (Windows).

O Player.log não traz mais a coleção desde 2021. Assim como o Untapped.gg, o app lê
(somente leitura, com ReadProcessMemory) os objetos do jogo aberto no runtime Mono:

    PAPA._instance → InventoryManager → InventoryServiceWrapper → Cards / m_inventory

Classes e campos são achados pelo nome; só a disposição interna das estruturas do Mono
(offsets abaixo) é fixa e pode mudar se o Arena trocar de versão do Unity.
"""
import ctypes
import struct
import sys
import time

# estruturas do Mono (MonoBleedingEdge x64, Unity 2021+ / Unity 6)
DOMAIN_ASSEMBLIES = 0xA0
ASSEMBLY_NAME = 0x10
ASSEMBLY_IMAGE = 0x60
IMAGE_CLASS_CACHE = 0x4D0
HASH_SIZE = 0x18
HASH_TABLE = 0x20
CLASS_PARENT = 0x30
CLASS_NAME = 0x48
CLASS_NAMESPACE = 0x50
CLASS_VTABLE_SIZE = 0x5C
CLASS_FIELDS = 0x98
CLASS_RUNTIME_INFO = 0xD0
CLASS_FIELD_COUNT = 0x100
CLASS_NEXT_CACHE = 0x108
RUNTIME_INFO_VTABLES = 0x08
VTABLE_SLOTS = 0x48
FIELD_SIZE = 0x20
FIELD_NAME = 0x08
FIELD_OFFSET = 0x18
TYPE_ATTRS = 0x08
FIELD_STATIC = 0x10
ARRAY_DATA = 0x20

PROCESS_VM_READ = 0x0010
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
TH32CS_SNAPPROCESS = 0x2
TH32CS_SNAPMODULE = 0x8 | 0x10

# (classe, campo estático da instância) — o Arena já usou os dois caminhos
ROOTS = (("PAPA", "_instance"), ("WrapperController", "<Instance>k__BackingField"))
WILDCARD_FIELDS = {"common": "wcCommon", "uncommon": "wcUncommon", "rare": "wcRare", "mythic": "wcMythic"}


class CollectionError(Exception):
    """Erro com mensagem pronta para mostrar ao usuário."""


if sys.platform == "win32":
    from ctypes import wintypes as wt

    _k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _k32.OpenProcess.restype = wt.HANDLE
    _k32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
    _k32.ReadProcessMemory.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t,
                                       ctypes.POINTER(ctypes.c_size_t)]
    _k32.CreateToolhelp32Snapshot.restype = wt.HANDLE
    _k32.CloseHandle.argtypes = [wt.HANDLE]

    class _PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [("dwSize", wt.DWORD), ("cntUsage", wt.DWORD), ("th32ProcessID", wt.DWORD),
                    ("th32DefaultHeapID", ctypes.c_void_p), ("th32ModuleID", wt.DWORD),
                    ("cntThreads", wt.DWORD), ("th32ParentProcessID", wt.DWORD),
                    ("pcPriClassBase", ctypes.c_long), ("dwFlags", wt.DWORD), ("szExeFile", ctypes.c_wchar * 260)]

    class _MODULEENTRY32W(ctypes.Structure):
        _fields_ = [("dwSize", wt.DWORD), ("th32ModuleID", wt.DWORD), ("th32ProcessID", wt.DWORD),
                    ("GlblcntUsage", wt.DWORD), ("ProccntUsage", wt.DWORD), ("modBaseAddr", ctypes.c_void_p),
                    ("modBaseSize", wt.DWORD), ("hModule", wt.HMODULE), ("szModule", ctypes.c_wchar * 256),
                    ("szExePath", ctypes.c_wchar * 260)]


def find_arena_pid():
    snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    try:
        e = _PROCESSENTRY32W()
        e.dwSize = ctypes.sizeof(e)
        ok = _k32.Process32FirstW(snap, ctypes.byref(e))
        while ok:
            if e.szExeFile.lower() == "mtga.exe":
                return e.th32ProcessID
            ok = _k32.Process32NextW(snap, ctypes.byref(e))
    finally:
        _k32.CloseHandle(snap)
    return None


class _Mono:
    """Leitor mínimo das estruturas do Mono em outro processo."""

    def __init__(self, pid):
        self.pid = pid
        self.h = _k32.OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not self.h:
            raise CollectionError("Sem permissão para ler o MTG Arena. Tente abrir o MTGA Stats como administrador.")
        self._fields = {}

    def close(self):
        _k32.CloseHandle(self.h)

    # ------------------------------------------------------------- memória
    def read(self, addr, n):
        buf = ctypes.create_string_buffer(n)
        got = ctypes.c_size_t()
        if not addr or not _k32.ReadProcessMemory(self.h, ctypes.c_void_p(addr), buf, n, ctypes.byref(got)):
            raise OSError(f"leitura falhou em {addr:#x}")
        return buf.raw

    def ptr(self, a):
        return struct.unpack("<Q", self.read(a, 8))[0]

    def u32(self, a):
        return struct.unpack("<I", self.read(a, 4))[0]

    def i32(self, a):
        return struct.unpack("<i", self.read(a, 4))[0]

    def cstr(self, a, n=128):
        return self.read(a, n).split(b"\0")[0].decode("utf-8", "replace") if a else ""

    # -------------------------------------------------------------- runtime
    def root_domain(self):
        base = self._module_base("mono-2.0-bdwgc.dll")
        func = self._export(base, "mono_get_root_domain")
        code = self.read(func, 7)
        if code[:3] != b"\x48\x8b\x05":          # mov rax, [rip+disp32]
            raise CollectionError("Versão do Mono do Arena não reconhecida.")
        return self.ptr(func + 7 + struct.unpack("<i", code[3:7])[0])

    def _module_base(self, name):
        snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, self.pid)
        try:
            e = _MODULEENTRY32W()
            e.dwSize = ctypes.sizeof(e)
            ok = _k32.Module32FirstW(snap, ctypes.byref(e))
            while ok:
                if e.szModule.lower() == name:
                    return e.modBaseAddr
                ok = _k32.Module32NextW(snap, ctypes.byref(e))
        finally:
            _k32.CloseHandle(snap)
        raise CollectionError("O Arena ainda está carregando. Tente de novo em alguns segundos.")

    def _export(self, base, name):
        exp = base + self.u32(base + self.u32(base + 0x3C) + 0x88)
        count, funcs, names, ords = (self.u32(exp + o) for o in (0x18, 0x1C, 0x20, 0x24))
        for i in range(count):
            if self.cstr(base + self.u32(base + names + 4 * i), 64) == name:
                ordinal = struct.unpack("<H", self.read(base + ords + 2 * i, 2))[0]
                return base + self.u32(base + funcs + 4 * ordinal)
        raise CollectionError(f"{name} não encontrado no Mono do Arena.")

    def images(self, domain):
        out = {}
        node = self.ptr(domain + DOMAIN_ASSEMBLIES)
        while node:
            asm = self.ptr(node)
            out[self.cstr(self.ptr(asm + ASSEMBLY_NAME), 96)] = self.ptr(asm + ASSEMBLY_IMAGE)
            node = self.ptr(node + 8)
        return out

    def find_classes(self, image, wanted):
        """{nome: MonoClass*} para os nomes pedidos, varrendo o cache de classes da imagem."""
        found = {}
        size = self.u32(image + IMAGE_CLASS_CACHE + HASH_SIZE)
        table = self.ptr(image + IMAGE_CLASS_CACHE + HASH_TABLE)
        raw = self.read(table, 8 * size)
        for (k,) in struct.iter_unpack("<Q", raw):
            while k:
                name = self.cstr(self.ptr(k + CLASS_NAME), 64)
                if name in wanted and name not in found:
                    found[name] = k
                    if len(found) == len(wanted):
                        return found
                k = self.ptr(k + CLASS_NEXT_CACHE)
        return found

    def fields(self, klass):
        """{nome: (offset, estático)} da classe e das classes-mãe."""
        if klass in self._fields:
            return self._fields[klass]
        out = {}
        k = klass
        while k:
            fp, n = self.ptr(k + CLASS_FIELDS), self.u32(k + CLASS_FIELD_COUNT)
            if fp and n < 4096:       # instâncias genéricas não têm a lista própria: pula
                raw = self.read(fp, FIELD_SIZE * n)
                for i in range(n):
                    tp, name_p, _, off = struct.unpack_from("<QQQi", raw, FIELD_SIZE * i)
                    name = self.cstr(name_p, 96)
                    if name not in out:
                        out[name] = (off, bool(struct.unpack("<H", self.read(tp + TYPE_ATTRS, 2))[0] & FIELD_STATIC))
            k = self.ptr(k + CLASS_PARENT)
        self._fields[klass] = out
        return out

    def klass_of(self, obj):
        return self.ptr(self.ptr(obj))

    def field(self, obj, name, extra=None):
        f = self.fields(self.klass_of(obj)).get(name) or (extra or {}).get(name)
        if not f:
            raise CollectionError(f"Campo {name} não encontrado: o Arena mudou a estrutura interna.")
        return obj + f[0]

    def static_ptr(self, klass, name):
        off, static = self.fields(klass).get(name, (None, False))
        if off is None or not static:
            return 0
        rti = self.ptr(klass + CLASS_RUNTIME_INFO)
        vtable = self.ptr(rti + RUNTIME_INFO_VTABLES) if rti else 0
        if not vtable:
            return 0                    # classe ainda não inicializada pelo jogo
        data = self.ptr(vtable + VTABLE_SLOTS + 8 * self.u32(klass + CLASS_VTABLE_SIZE))
        return self.ptr(data + off) if data else 0


def read_collection():
    """Retorna {"cards": {grpId: quantidade}, "wildcards": {...}, "ts": ...} lidos do Arena aberto."""
    if sys.platform != "win32":
        raise CollectionError("A leitura da coleção só funciona no Windows.")
    pid = find_arena_pid()
    if not pid:
        raise CollectionError("O MTG Arena não está aberto. Abra o jogo e tente de novo.")
    mono = _Mono(pid)
    try:
        try:
            images = mono.images(mono.root_domain())
            core, corlib = images.get("Core"), images.get("mscorlib")
            if not core or not corlib:
                raise CollectionError("O Arena ainda está carregando. Tente de novo em alguns segundos.")
            classes = mono.find_classes(core, {c for c, _ in ROOTS})
            root = 0
            for cname, field in ROOTS:
                if cname in classes:
                    root = mono.static_ptr(classes[cname], field)
                    if root:
                        break
            if not root:
                raise CollectionError("Entre no Arena (tela inicial) para que a coleção seja carregada.")
            inv_mgr = mono.ptr(mono.field(root, "<InventoryManager>k__BackingField"))
            service = mono.ptr(mono.field(inv_mgr, "InventoryServiceWrapper"))
            cards_dict = mono.ptr(mono.field(service, "<Cards>k__BackingField"))
            inventory = mono.ptr(mono.field(service, "m_inventory"))
            if not cards_dict or not inventory:
                raise CollectionError("Entre no Arena (tela inicial) para que a coleção seja carregada.")
            # a lista de campos do Dictionary<,> fica na definição genérica, em mscorlib
            generic = mono.find_classes(corlib, {"Dictionary`2"}).get("Dictionary`2")
            dict_fields = mono.fields(generic) if generic else {}
            entries = mono.ptr(mono.field(cards_dict, "_entries", dict_fields))
            count = mono.i32(mono.field(cards_dict, "_count", dict_fields))
            cards = {}
            if entries and count > 0:
                raw = mono.read(entries + ARRAY_DATA, 16 * count)
                for hash_code, _next, grp, qty in struct.iter_unpack("<iiIi", raw):
                    if hash_code >= 0 and qty > 0:      # hash negativo = posição livre
                        cards[grp] = qty
            wildcards = {r: mono.i32(mono.field(inventory, f)) for r, f in WILDCARD_FIELDS.items()}
        except OSError:
            raise CollectionError("Não foi possível ler a coleção agora (o Arena pode estar carregando). "
                                  "Tente de novo; se persistir, o Arena pode ter mudado de versão.")
    finally:
        mono.close()
    if not cards:
        raise CollectionError("A coleção ainda não foi carregada pelo Arena. Abra a tela inicial do jogo.")
    return {"cards": cards, "wildcards": wildcards, "ts": time.time()}
