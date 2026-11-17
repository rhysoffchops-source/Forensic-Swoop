#!/usr/bin/env python3
# v19.py - Android max-yield acquisition + reporting. Read-only. Hash-chained. Complete.
# python3 v19.py --self-test
# python3 v19.py --serial R58M12345 --out ~/cases/CPH2819_20261116 --budget-minutes 900
# python3 v19.py --serial R58M12345 --out <same> --resume
# python3 v19.py --verify <case>
# python3 v19.py --serve <case> --port 8787
# Exit 0 only when the chain validates.

import argparse
import collections
import concurrent.futures as cf
import csv
import dataclasses
import datetime as dt
import functools
import hashlib
import http.server
import json
import mmap
import os
import pathlib
import re
import socketserver
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time
from html import escape as esc
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

VERSION = "19.0.0"
MAX_WORKERS = 6
PAGE = 500
PRINT_RUN = re.compile(rb"[\x20-\x7e]{16,}")
SQLITE_MAGIC = b"SQLite format 3\x00"
MEDIA_EXT = {
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp", ".dng",
    ".mp4", ".mov", ".3gp", ".mkv", ".webm", ".m4a", ".mp3", ".opus", ".ogg",
    ".amr", ".aac", ".wav", ".pdf", ".vcf", ".txt", ".db",
}
THUMB = ("thumbnail", ".thumbnails", "/cache/", "imgcache", "thumb")
LOG_RX = re.compile(
    r"^(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)\.(\d+)\s+([VDIWEFA])/([^(]+)\(\s*(\d+)\): (.*)$"
)
STATUS = ("ok", "partial", "blocked", "timeout", "truncated", "skipped", "failed", "cached")


def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s)[:120] or "_"


def q(s):
    return "'" + s.replace("'", "'\\''") + "'"


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_file(p, chunk=1 << 20):
    h = hashlib.sha256()
    with p.open("rb") as f:
        while blk := f.read(chunk):
            h.update(blk)
    return h.hexdigest()


def chain_digest(rec):
    return sha_bytes(
        json.dumps({k: v for k, v in rec.items() if k != "prev"}, sort_keys=True).encode()
    )


def iso(ms, tz):
    return dt.datetime.fromtimestamp(ms / 1000, tz).strftime("%Y-%m-%d %H:%M:%S") if ms else ""


def human(n):
    for u in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or u == "TB":
            return f"{n:.0f} {u}" if u == "B" else f"{n:.1f} {u}"
        n /= 1024.0


class Budget:
    def __init__(self, mb, minutes):
        self.lock = threading.Lock()
        self.cap = mb * 1024 ** 2
        self.deadline = time.monotonic() + minutes * 60
        self.used = 0

    def charge(self, n):
        with self.lock:
            self.used += n

    def exhausted(self):
        return time.monotonic() > self.deadline or self.used >= self.cap


class Chain:
    def __init__(self, path, resume=False):
        self.path = path
        self.lock = threading.Lock()
        self.prev = "0" * 64
        self.seq = 0
        if resume and self.path.exists():
            lines = [ln.strip() for ln in self.path.read_text("utf-8").splitlines() if ln.strip()]
            if lines:
                last = json.loads(lines[-1])
                self.seq = int(last["seq"])
                self.prev = chain_digest(last)

    def add(self, rel, digest, note=""):
        with self.lock:
            self.seq += 1
            rec = {
                "seq": self.seq,
                "utc": now(),
                "path": rel,
                "sha256": digest,
                "note": note,
                "prev": self.prev,
            }
            self.prev = chain_digest(rec)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec, sort_keys=True) + "\n")
                f.flush()
                os.fsync(f.fileno())
            return rec


class Device:
    def __init__(self, serial, budget):
        self.serial, self.budget = serial, budget

    def base(self):
        return ["adb", "-s", self.serial]

    def run(self, script, timeout=30, cap=24 << 20):
        try:
            p = subprocess.Popen(
                self.base() + ["shell", script],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
            )
            try:
                out, err = p.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                p.kill()
                out, err = p.communicate()
                return 124, out[:cap], b"TIMEOUT"
            return (p.returncode or 0), out[:cap], (b"TRUNCATED" if len(out) > cap else err)
        except OSError as e:
            return 127, b"", str(e).encode()

    def exec_out(self, argv, timeout=120, cap=64 << 20):
        try:
            p = subprocess.Popen(
                self.base() + ["exec-out"] + argv,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
            )
            try:
                out, err = p.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                p.kill()
                out, err = p.communicate()
                return 124, out[:cap], b"TIMEOUT"
            return p.returncode, out[:cap], err
        except OSError as e:
            return 127, b"", str(e).encode()

    def stream(self, argv, dest, timeout=1800, cap=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        start = time.monotonic()
        try:
            with dest.open("wb") as o:
                p = subprocess.Popen(
                    self.base() + ["exec-out"] + argv,
                    stdout=o,
                    stderr=subprocess.PIPE,
                    stdin=subprocess.DEVNULL,
                )
                while p.poll() is None:
                    if time.monotonic() - start > timeout:
                        p.kill()
                        p.wait()
                        return {"status": "timeout", "bytes": dest.stat().st_size}
                    if cap and dest.stat().st_size > cap:
                        p.kill()
                        p.wait()
                        return {"status": "truncated", "bytes": dest.stat().st_size}
                    time.sleep(0.2)
                err = p.stderr.read() if p.stderr else b""
                total = dest.stat().st_size
        except OSError as e:
            return {"status": "failed", "bytes": 0, "error": str(e)}
        self.budget.charge(total)
        if p.returncode and not total:
            return {
                "status": "blocked",
                "bytes": 0,
                "error": err[:300].decode("utf-8", "replace"),
            }
        return {"status": "partial" if p.returncode else "ok", "bytes": total}


@dataclasses.dataclass
class Stage:
    name: str
    status: str
    tier: str = "shell"
    bytes: int = 0
    artifacts: int = 0
    notes: list = dataclasses.field(default_factory=list)
    error: str = ""

    def d(self):
        return dataclasses.asdict(self)


class Run:
    def __init__(self, case, dev, budget, resume=False):
        self.case, self.dev, self.budget = pathlib.Path(case), dev, budget
        self.case.mkdir(parents=True, exist_ok=True)
        self.chain = Chain(self.case / "chain.jsonl", resume=resume)
        self.res = []
        self.lock = threading.Lock()
        self.tier = "shell"
        self.tz = dt.timezone.utc
        self.tz_name = "UTC"
        self.tz_ok = False
        self.acq_ms = int(time.time() * 1000)

    def p(self, *parts):
        x = self.case.joinpath(*parts)
        x.parent.mkdir(parents=True, exist_ok=True)
        return x

    def rec(self, rel, note=""):
        try:
            self.chain.add(rel.relative_to(self.case).as_posix(), sha_file(rel), note)
        except OSError:
            pass

    def store(self, rel, data, note=""):
        rel.parent.mkdir(parents=True, exist_ok=True)
        rel.write_bytes(data)
        self.rec(rel, note)

    def text(self, rel, s, note=""):
        self.store(rel, s.encode("utf-8", "replace"), note)

    def add(self, s):
        with self.lock:
            self.res.append(s)
        return s

    def guarded(self, name, fn):
        try:
            return self.add(fn())
        except Exception as e:
            return self.add(
                Stage(name, "failed", self.tier, error=f"{type(e).__name__}: {e}"[:300])
            )


# ---------------------------------------------------------------- acquisition


def preflight(run):
    d = run.dev
    rc, st, _ = d.run("get-state", 10)
    if b"device" not in st:
        raise RuntimeError("device not ready")
    rc, uid, _ = d.run("id", 10)
    if b"uid=2000" not in uid and b"uid=0" not in uid:
        raise RuntimeError("unexpected identity")
    facts = {}
    for k in (
        "ro.product.model",
        "ro.product.manufacturer",
        "ro.build.version.release",
        "ro.build.version.sdk",
        "ro.build.fingerprint",
        "ro.serialno",
        "ro.crypto.state",
        "ro.debuggable",
        "ro.secure",
        "persist.sys.timezone",
    ):
        facts[k] = d.run(f"getprop {k}", 10)[1].decode("utf-8", "replace").strip()
    df = d.run("df -k /data /sdcard", 15)[1].decode("utf-8", "replace")
    bat = d.run("dumpsys battery", 15)[1].decode("utf-8", "replace")[:1500]
    run.text(
        run.p("metadata", "preflight.json"),
        json.dumps({"utc": now(), "facts": facts, "df": df, "battery": bat}, indent=2),
        "preflight",
    )
    return Stage("00_preflight", "ok", notes=[facts.get("ro.product.model", "?")])


def ladder(run):
    att = []
    for name, script in (
        ("adb_root", "adb root"),
        ("su_c", "su -c id"),
        ("su_pipe", "echo id | su"),
        ("magisk", "magisk -v"),
    ):
        rc, o, e = run.dev.run(script, 20)
        if name == "adb_root":
            time.sleep(1.5)
            o = run.dev.run("id", 10)[1]
        if b"uid=0" in o:
            run.tier = "root"
            att.append({"tier": name, "ok": True})
            break
        att.append(
            {"tier": name, "ok": False, "detail": (o + e).decode("utf-8", "replace")[:160]}
        )
    if run.tier != "root":
        pk = [
            x.removeprefix("package:")
            for x in run.dev.run("pm list packages -d 2>/dev/null | head -8", 20)[1]
            .decode("utf-8", "replace")
            .split()
            if x.startswith("package:")
        ]
        if pk:
            run.tier = "run-as"
            att.append({"tier": "run_as", "ok": True, "detail": ",".join(pk)})
    run.text(
        run.p("metadata", "ladder.jsonl"),
        "\n".join(json.dumps(a) for a in att),
        "ladder",
    )
    return Stage(
        "02_ladder",
        "ok" if run.tier != "shell" else "partial",
        run.tier,
        notes=[f"tier={run.tier}"],
    )


def set_tz(run):
    n = run.dev.run("getprop persist.sys.timezone", 10)[1].decode("utf-8", "replace").strip()
    if n:
        try:
            run.tz = ZoneInfo(n)
            run.tz_name, run.tz_ok = n, True
        except ZoneInfoNotFoundError:
            run.tz_name = n + " (unresolved)"
    run.text(run.p("metadata", "timezone.txt"), f"{run.tz_name}\nok={run.tz_ok}\n{now()}\n")


def to_ms(v, tz, lo, hi):
    v = (v or "").strip()
    if not v:
        return None, "unresolved"
    if re.fullmatch(r"\d{13}", v):
        ms, src = int(v), "epoch13"
    elif re.fullmatch(r"\d{10}", v):
        ms, src = int(v) * 1000, "epoch10"
    elif re.fullmatch(r"\d{1,4}", v):
        return None, "unresolved"
    else:
        try:
            d = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return None, "unresolved"
        if d.tzinfo is None:
            d = d.replace(tzinfo=tz)
        ms, src = int(d.timestamp() * 1000), "iso"
    if not (lo <= dt.datetime.fromtimestamp(ms / 1000, tz).year <= hi):
        return None, "unresolved"
    return ms, src


IDENTITY = [
    ("props", "getprop"),
    ("users", "pm list users"),
    ("accounts", "dumpsys account"),
    ("gset", "settings list global"),
    ("sset", "settings list secure"),
    ("syset", "settings list system"),
    ("telephony", "dumpsys telephony.registry"),
    ("sim", "dumpsys isub"),
    ("wifi", "dumpsys wifi | head -400"),
]


def identity(run):
    ok = 0
    for n, s in IDENTITY:
        rc, data, err = run.dev.run(s, 40, 8 << 20)
        if rc and not data:
            run.text(
                run.p("errors", "identity", n + ".txt"),
                (err or b"blocked").decode("utf-8", "replace"),
            )
            continue
        run.store(run.p("raw", "identity", n + ".txt"), data, n)
        ok += 1
    return Stage("03_identity", "ok", run.tier, artifacts=ok)


SVC_RX = re.compile(r"^\s*\d+\s+([A-Za-z0-9_.\-]+):", re.M)


def services(run):
    names = sorted(
        {
            n
            for n in SVC_RX.findall(
                run.dev.run("service list", 40)[1].decode("utf-8", "replace")
            )
            if n
        }
    )
    run.text(run.p("raw", "services", "_index.txt"), "\n".join(names), "services")
    tally = collections.Counter()

    def one(n):
        if run.budget.exhausted():
            return "skipped"
        dest = run.p("raw", "services", safe(n) + ".txt")
        if dest.exists() and dest.stat().st_size:
            return "cached"
        rc, data, err = run.dev.run(f"dumpsys {n}", 25, 8 << 20)
        if rc == 124:
            return "timeout"
        if rc and not data.strip():
            run.text(
                run.p("errors", "services", safe(n) + ".txt"),
                (err or b"blocked").decode("utf-8", "replace"),
            )
            return "blocked"
        run.store(dest, data, f"dumpsys {n}")
        return "ok"

    with cf.ThreadPoolExecutor(MAX_WORKERS) as pool:
        for s in pool.map(one, names):
            tally[s] += 1
    return Stage(
        "04_services",
        "partial" if tally["blocked"] or tally["skipped"] else "ok",
        run.tier,
        artifacts=tally["ok"] + tally["cached"],
        notes=[f"n={len(names)}", json.dumps(dict(tally))],
    )


AUTH_RX = re.compile(r"^\s*provider:\s*([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)", re.M)


def providers(run):
    a = sorted(
        {
            x
            for x in AUTH_RX.findall(
                run.dev.run("dumpsys activity providers", 40)[1].decode("utf-8", "replace")
            )
            if "." in x
        }
    )
    run.text(run.p("raw", "providers", "_authorities.txt"), "\n".join(a), "authorities")
    ok = bl = 0
    for auth in a:
        if run.budget.exhausted():
            break
        st = safe(auth.replace("/", "_"))
        rc, data, err = run.dev.run(f"content query --uri content://{auth}", 40, 16 << 20)
        if rc and not data.strip():
            bl += 1
            run.text(
                run.p("errors", "providers", st + ".txt"),
                (err or b"blocked").decode("utf-8", "replace"),
            )
            continue
        run.store(run.p("raw", "providers", st + ".txt"), data, auth)
        ok += 1
    return Stage(
        "05_providers",
        "partial" if bl else "ok",
        run.tier,
        artifacts=ok,
        notes=[f"n={len(a)}", f"blocked={bl}"],
    )


PKG_RX = re.compile(r"^package:(.*?)=([A-Za-z0-9_.]+)$", re.M)


def packages(run):
    pk = sorted(
        {
            m.group(2)
            for m in PKG_RX.finditer(
                run.dev.run("pm list packages -u -f", 60, 16 << 20)[1].decode(
                    "utf-8", "replace"
                )
            )
        }
    )
    run.text(run.p("raw", "packages", "_list.txt"), "\n".join(pk), "packages")

    def one(p):
        if run.budget.exhausted():
            return 0
        dest = run.p("raw", "packages", safe(p) + ".txt")
        if dest.exists() and dest.stat().st_size:
            return 1
        data = run.dev.run(f"dumpsys package {p}", 30, 4 << 20)[1]
        if not data.strip():
            return 0
        run.store(dest, data, p)
        return 1

    with cf.ThreadPoolExecutor(MAX_WORKERS) as pool:
        ok = sum(pool.map(one, pk))
    return Stage("06_packages", "ok", run.tier, artifacts=ok, notes=[f"n={len(pk)}"])


BASES = [
    "/sdcard/DCIM",
    "/sdcard/Pictures",
    "/sdcard/Movies",
    "/sdcard/Download",
    "/sdcard/Documents",
    "/sdcard/WhatsApp",
    "/sdcard/Telegram",
    "/sdcard/Snapchat",
    "/sdcard/Android/media",
    "/sdcard/Android/data",
    "/sdcard/Music",
    "/sdcard/Screenshots",
]


def media(run, mode="thumbnails", cap_files=40000):
    idx = []
    for b in BASES:
        out = run.dev.run(
            f"find {q(b)} -type f -exec stat -c '%Y\\t%s\\t%n' {{}} + 2>/dev/null",
            180,
            32 << 20,
        )[1]
        for line in out.decode("utf-8", "replace").splitlines():
            bits = line.split("\t")
            if len(bits) < 3 or not bits[1].strip().isdigit():
                continue
            path = "\t".join(bits[2:])
            if (
                not path.startswith("/")
                or os.path.splitext(path)[1].lower() not in MEDIA_EXT
            ):
                continue
            idx.append({"mtime": int(bits[0]), "bytes": int(bits[1]), "path": path})
    idx.sort(key=lambda r: r["mtime"], reverse=True)
    idx = idx[:cap_files]
    run.text(
        run.p("media", "index.jsonl"),
        "\n".join(json.dumps(r) for r in idx),
        "media index",
    )
    if mode == "none":
        return Stage("08_media", "ok", run.tier, notes=[f"indexed={len(idx)}"])
    chosen = (
        [r for r in idx if any(h in r["path"].lower() for h in THUMB)]
        if mode == "thumbnails"
        else [r for r in idx if r["bytes"] <= 2 << 20]
        if mode == "small"
        else idx
    )
    got = skip = 0
    for r in chosen:
        if run.budget.exhausted():
            break
        if r["bytes"] > 96 << 20:
            skip += 1
            continue
        dest = run.p("media", "files", r["path"].lstrip("/"))
        if dest.exists() and dest.stat().st_size == r["bytes"]:
            got += 1
            continue
        if run.dev.stream(["cat", q(r["path"])], dest, 600, 120 << 20)["bytes"]:
            run.rec(dest, r["path"])
            got += 1
        else:
            skip += 1
    return Stage(
        "08_media",
        "partial" if skip else "ok",
        run.tier,
        artifacts=got,
        notes=[f"indexed={len(idx)}", f"chosen={len(chosen)}", f"skipped={skip}"],
    )


APPS = [
    "org.thoughtcrime.securesms",
    "org.telegram.messenger",
    "com.whatsapp",
    "com.snapchat.android",
    "com.google.android.apps.messaging",
    "com.android.mms",
    "com.android.providers.telephony",
    "com.google.android.gm",
    "com.google.android.apps.photos",
    "com.google.android.apps.docs",
    "com.google.android.apps.maps",
    "com.google.android.gms",
    "com.android.chrome",
    "com.instagram.android",
    "com.facebook.katana",
    "com.facebook.orca",
    "com.discord",
    "com.viber.voip",
    "com.slack",
    "com.microsoft.teams",
]
KEYS = ("files/key", "databases/", "shared_prefs/", "files/")


def members(archive, outdir):
    outdir.mkdir(parents=True, exist_ok=True)
    n = 0
    try:
        import tarfile

        with tarfile.open(archive, "r|") as t:
            for m in t:
                if not m.isfile():
                    continue
                name = m.name.removeprefix("./")
                if not any(name.startswith(k) for k in KEYS) or m.size > (64 << 20):
                    continue
                src = t.extractfile(m)
                if src:
                    (outdir / safe(name.replace("/", "_"))).write_bytes(src.read())
                    n += 1
    except Exception:
        pass
    return n


def capture_app(run, pkg):
    base = run.p("apps", safe(pkg))
    notes = []
    for user in (0, 10, 11, 999):
        root = f"/data/user/{user}/{pkg}"
        if run.dev.run(f"ls -d {q(root)}", 15)[0]:
            continue
        if run.tier == "root":
            tier, argv, arc = (
                "root",
                ["su", "-c", f"tar -cf - -C {q(root)} ."],
                base / f"u{user}.tar",
            )
        elif run.tier == "run-as":
            tier, argv, arc = (
                "run-as",
                ["run-as", pkg, "tar", "-cf", "-", "."],
                base / f"u{user}.tar",
            )
        else:
            tier, argv, arc = (
                "backup",
                ["backup", "-f", "-", "-apk", "-shared", pkg],
                base / f"u{user}.ab",
            )
        res = run.dev.stream(argv, arc, 1800, 6 << 30)
        notes.append(f"{user}:{tier}:{res['status']}:{res['bytes']}")
        if res["bytes"]:
            run.rec(arc, f"{pkg}/{tier}")
            if tier != "backup":
                n = members(arc, base / f"u{user}_keys")
                notes.append(f"members={n}")
                for f in sorted((base / f"u{user}_keys").glob("*")):
                    run.rec(f, "key material")
        return Stage(
            f"09_app:{pkg}", res["status"], tier, bytes=res["bytes"], notes=notes
        )
    return Stage(f"09_app:{pkg}", "blocked", "none")


def carve(run, db):
    try:
        with db.open("rb") as f:
            head = f.read(100)
    except OSError:
        return Stage(f"10_carve:{db.name}", "failed")
    if not head.startswith(SQLITE_MAGIC):
        return Stage(f"10_carve:{db.name}", "skipped")
    ps = struct.unpack(">H", head[16:18])[0] or 4096
    if ps == 1:
        ps = 65536
    live = set()
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
        for (t,) in con.execute("select name from sqlite_master where type='table'"):
            try:
                for row in con.execute(f'select * from "{t}" limit 50000'):
                    live.update(v for v in row if isinstance(v, str))
            except sqlite3.Error:
                pass
        con.close()
    except sqlite3.Error:
        pass
    found, seen = [], set()
    try:
        with db.open("rb") as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            for m in PRINT_RUN.finditer(mm):
                if len(found) >= 20000:
                    break
                s = m.group().decode("ascii", "replace")
                if any(s in lv for lv in live) or s in seen:
                    continue
                seen.add(s)
                found.append(
                    {
                        "page": m.start() // ps,
                        "offset": m.start(),
                        "sha256": sha_bytes(m.group()),
                        "text": s[:400],
                    }
                )
    except (OSError, ValueError):
        return Stage(f"10_carve:{db.name}", "failed")
    if not found:
        return Stage(f"10_carve:{db.name}", "ok")
    out = run.p("recovery", "carved", safe(db.name) + ".jsonl")
    out.write_text("\n".join(json.dumps(x) for x in found), encoding="utf-8")
    run.rec(out, "carve")
    return Stage(f"10_carve:{db.name}", "ok", artifacts=len(found))


TRASH = [
    "/sdcard/.trash",
    "/sdcard/Android/.trash",
    "/sdcard/.Trash",
    "/sdcard/LOST.DIR",
    "/sdcard/$RECYCLE.BIN",
    "/sdcard/DCIM/.thumbnails",
    "/sdcard/Pictures/.thumbnails",
]


def trash(run):
    n = skip = total_bytes = 0
    for d in TRASH:
        out = run.dev.run(f"find {q(d)} -type f 2>/dev/null", 90, 16 << 20)[1]
        for line in out.decode("utf-8", "replace").splitlines():
            r = line.strip()
            if not r or run.budget.exhausted():
                continue
            dest = run.p("recovery", "trash", r.lstrip("/"))
            if dest.exists() and dest.stat().st_size:
                n += 1
                continue
            res = run.dev.stream(["cat", q(r)], dest, 300, 64 << 20)
            if res["bytes"]:
                run.rec(dest, f"trash:{r}")
                n += 1
                total_bytes += res["bytes"]
            else:
                skip += 1
    return Stage(
        "11_trash",
        "partial" if skip else "ok",
        run.tier,
        bytes=total_bytes,
        artifacts=n,
        notes=[f"recovered={n}", f"skipped={skip}"],
    )


def logs(run):
    rc, raw_lc, err = run.dev.run("logcat -d -b all -v threadtime", 60, 32 << 20)
    got = 0
    parsed = []
    yr = dt.datetime.fromtimestamp(run.acq_ms / 1000, run.tz).year
    if raw_lc:
        run.store(run.p("raw", "logs", "logcat.txt"), raw_lc, "logcat")
        got += 1
        for ln in raw_lc.decode("utf-8", "replace").splitlines():
            m = LOG_RX.match(ln)
            if not m:
                continue
            mo, dy, hh, mm, ss, ms_part, lvl, tag, pid, msg = m.groups()
            ts_str = f"{yr:04d}-{mo}-{dy}T{hh}:{mm}:{ss}"
            ms, src = to_ms(ts_str, run.tz, yr - 2, yr + 1)
            parsed.append(
                {
                    "ms": ms,
                    "utc": iso(ms, dt.timezone.utc) if ms else "",
                    "local": iso(ms, run.tz) if ms else "",
                    "level": lvl,
                    "tag": tag.strip(),
                    "pid": int(pid),
                    "msg": msg[:400],
                }
            )
        if parsed:
            run.text(
                run.p("parsed", "logs.jsonl"),
                "\n".join(json.dumps(x) for x in parsed[:50000]),
                "parsed logs",
            )
            got += 1
    rc_d, dmesg, _ = run.dev.run("dmesg 2>/dev/null", 30, 8 << 20)
    if dmesg.strip():
        run.store(run.p("raw", "logs", "dmesg.txt"), dmesg, "dmesg")
        got += 1
    return Stage(
        "12_logs",
        "ok" if got else "blocked",
        run.tier,
        artifacts=got,
        notes=[f"parsed_lines={len(parsed)}"],
    )


def carve_all(run):
    dbs = []
    for root_dir in ("apps", "recovery", "media"):
        base = run.case / root_dir
        if base.exists():
            for p in base.rglob("*"):
                if p.is_file() and p.stat().st_size >= 100:
                    try:
                        with p.open("rb") as f:
                            if f.read(16) == SQLITE_MAGIC:
                                dbs.append(p)
                    except OSError:
                        pass
    stages = [carve(run, db) for db in sorted(dbs)]
    return stages


def timeline(run):
    events = []
    # Media events
    mi = run.case / "media" / "index.jsonl"
    if mi.exists():
        for ln in mi.read_text("utf-8").splitlines():
            if not ln.strip():
                continue
            r = json.loads(ln)
            ms = int(r["mtime"]) * 1000
            events.append(
                {
                    "ms": ms,
                    "utc": iso(ms, dt.timezone.utc),
                    "local": iso(ms, run.tz),
                    "source": "media",
                    "summary": r["path"],
                    "detail": human(r["bytes"]),
                }
            )
    # Log events
    li = run.case / "parsed" / "logs.jsonl"
    if li.exists():
        for ln in li.read_text("utf-8").splitlines():
            if not ln.strip():
                continue
            r = json.loads(ln)
            if r.get("ms"):
                events.append(
                    {
                        "ms": r["ms"],
                        "utc": r["utc"],
                        "local": r["local"],
                        "source": f"logcat/{r['level']}",
                        "summary": f"{r['tag']} (pid {r['pid']})",
                        "detail": r["msg"],
                    }
                )
    events.sort(key=lambda e: e["ms"], reverse=True)
    events = events[:50000]
    run.text(
        run.p("timeline", "timeline.jsonl"),
        "\n".join(json.dumps(e) for e in events),
        "timeline jsonl",
    )
    csv_buf = ["ms,utc,local,source,summary,detail"]
    for e in events:
        row = [
            str(e["ms"]),
            e["utc"],
            e["local"],
            e["source"],
            '"' + e["summary"].replace('"', '""') + '"',
            '"' + e["detail"].replace('"', '""') + '"',
        ]
        csv_buf.append(",".join(row))
    run.text(run.p("timeline", "timeline.csv"), "\n".join(csv_buf), "timeline csv")
    return Stage(
        "13_timeline",
        "ok",
        run.tier,
        artifacts=len(events),
        notes=[f"events={len(events)}"],
    )


def report(run):
    manifest = {
        "version": VERSION,
        "generated_utc": now(),
        "timezone": run.tz_name,
        "timezone_ok": run.tz_ok,
        "tier": run.tier,
        "budget_used_bytes": run.budget.used,
        "stages": [s.d() for s in run.res],
    }
    run.text(
        run.p("manifest.json"),
        json.dumps(manifest, indent=2),
        "case manifest",
    )
    rows = "".join(
        f"<tr><td>{esc(s.name)}</td><td>{esc(s.status)}</td><td>{esc(s.tier)}</td>"
        f"<td>{s.artifacts}</td><td>{esc(human(s.bytes))}</td>"
        f"<td>{esc(', '.join(s.notes) or s.error)}</td></tr>"
        for s in run.res
    )
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Forensic Case Report - v{esc(VERSION)}</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#0f172a;background:#f8fafc}}
h1{{font-size:1.5rem;margin-bottom:.25rem}}
.meta{{color:#475569;font-size:.9rem;margin-bottom:1.5rem}}
table{{width:100%;border-collapse:collapse;background:#fff;border:1px solid #cbd5e1}}
th,td{{padding:.6rem .75rem;border-bottom:1px solid #e2e8f0;text-align:left;font-size:.875rem}}
th{{background:#f1f5f9;font-weight:600}}
</style>
</head>
<body>
<h1>Android Forensic Acquisition Report</h1>
<div class="meta">Engine v{esc(VERSION)} · Generated {esc(manifest['generated_utc'])} · Tier: {esc(run.tier)} · TZ: {esc(run.tz_name)}</div>
<table>
<thead><tr><th>Stage</th><th>Status</th><th>Tier</th><th>Artifacts</th><th>Bytes</th><th>Notes</th></tr></thead>
<tbody>{rows}</tbody>
</table>
</body>
</html>
"""
    run.text(run.p("report.html"), html_doc, "html report")
    return Stage("14_report", "ok", run.tier, artifacts=2)


# ---------------------------------------------------------------- verification & server


def verify_case(case_dir):
    case = pathlib.Path(case_dir)
    chain_path = case / "chain.jsonl"
    if not chain_path.exists():
        return False, {"valid": False, "error": "missing chain.jsonl", "checked": 0}
    lines = [ln.strip() for ln in chain_path.read_text("utf-8").splitlines() if ln.strip()]
    if not lines:
        return False, {"valid": False, "error": "empty chain.jsonl", "checked": 0}
    expected_prev = "0" * 64
    errors = []
    for idx, line in enumerate(lines, start=1):
        try:
            rec = json.loads(line)
        except json.JSONDecodeError as e:
            errors.append({"seq": idx, "reason": f"invalid json: {e}"})
            break
        if rec.get("seq") != idx:
            errors.append({"seq": idx, "reason": f"seq mismatch: got {rec.get('seq')}"})
        if rec.get("prev") != expected_prev:
            errors.append(
                {
                    "seq": idx,
                    "path": rec.get("path", ""),
                    "reason": "prev digest link mismatch",
                }
            )
        target = case / rec.get("path", "")
        if not target.exists() or not target.is_file():
            errors.append(
                {
                    "seq": idx,
                    "path": rec.get("path", ""),
                    "reason": "artifact file missing",
                }
            )
        else:
            actual = sha_file(target)
            if actual != rec.get("sha256"):
                errors.append(
                    {
                        "seq": idx,
                        "path": rec.get("path", ""),
                        "reason": f"sha256 mismatch (expected {rec.get('sha256')[:12]}, got {actual[:12]})",
                    }
                )
        expected_prev = chain_digest(rec)
    ok = len(errors) == 0
    return ok, {
        "valid": ok,
        "checked": len(lines),
        "head_digest": expected_prev,
        "errors": errors,
    }


def serve_case(case_dir, port):
    ok, summary = verify_case(case_dir)
    if not ok:
        print(json.dumps(summary, indent=2), file=sys.stderr)
        return 1
    case = pathlib.Path(case_dir).resolve()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(case))
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving verified case {case} on http://127.0.0.1:{port}/report.html")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


def self_test(json_out=False):
    results = {"version": VERSION, "checks": [], "ok": False}
    with tempfile.TemporaryDirectory(prefix="v19_selftest_") as tmp:
        case = pathlib.Path(tmp) / "case"
        budget = Budget(mb=64, minutes=10)
        run = Run(case, Device("SELFTEST", budget), budget)
        run.tz = ZoneInfo("UTC")
        run.tz_name = "UTC"
        run.tz_ok = True

        # 1. Timestamp normalization
        ms1, src1 = to_ms("1700000000000", run.tz, 2020, 2030)
        ms2, src2 = to_ms("2026-11-16T12:00:00Z", run.tz, 2020, 2030)
        assert ms1 == 1700000000000 and src1 == "epoch13"
        assert src2 == "iso" and ms2 is not None
        results["checks"].append({"name": "timestamp_normalization", "ok": True})

        # 2. Logcat regex parsing
        sample_log = "11-16 17:45:12.345 I/ActivityManager( 1420): Start proc com.example.app"
        m = LOG_RX.match(sample_log)
        assert m is not None and m.group(7) == "I" and m.group(8).strip() == "ActivityManager"
        results["checks"].append({"name": "logcat_regex", "ok": True})

        # 3. Real SQLite DB creation + deletion + carving
        db_path = run.p("apps", "com.example", "msgstore.db")
        con = sqlite3.connect(str(db_path))
        con.execute("PRAGMA secure_delete = OFF")
        con.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, body TEXT)")
        con.execute(
            "INSERT INTO messages (body) VALUES (?)",
            ("LIVE_MESSAGE_PAYLOAD_ACTIVE_RECORD",),
        )
        con.execute(
            "INSERT INTO messages (body) VALUES (?)",
            ("DELETED_FORENSIC_ARTIFACT_CARVE_TARGET_9912",),
        )
        con.commit()
        con.execute("DELETE FROM messages WHERE id = 2")
        con.commit()
        con.close()
        run.rec(db_path, "sample sqlite db")
        carve_stage = carve(run, db_path)
        carved_jsonl = case / "recovery" / "carved" / "msgstore.db.jsonl"
        carved_rows = (
            [json.loads(x) for x in carved_jsonl.read_text("utf-8").splitlines() if x.strip()]
            if carved_jsonl.exists()
            else []
        )
        assert any("DELETED_FORENSIC_ARTIFACT_CARVE_TARGET_9912" in r["text"] for r in carved_rows)
        results["checks"].append(
            {
                "name": "sqlite_unallocated_carver",
                "ok": True,
                "carved_count": len(carved_rows),
                "stage_status": carve_stage.status,
            }
        )

        # 4. Media index + Timeline + Report
        run.text(
            run.p("media", "index.jsonl"),
            json.dumps({"mtime": 1763315000, "bytes": 4096, "path": "/sdcard/DCIM/IMG_001.jpg"}),
            "media index",
        )
        run.add(carve_stage)
        run.add(timeline(run))
        run.add(report(run))

        # 5. Chain verification (must pass)
        ok_valid, valid_summary = verify_case(case)
        assert ok_valid is True and valid_summary["checked"] >= 4
        results["checks"].append(
            {
                "name": "chain_verify_valid",
                "ok": True,
                "checked": valid_summary["checked"],
                "head_digest": valid_summary["head_digest"],
            }
        )

        # 6. Tamper detection (mutate 1 byte in carved file -> must fail!)
        if carved_jsonl.exists():
            orig = carved_jsonl.read_bytes()
            carved_jsonl.write_bytes(orig + b"\n")
            ok_tamper, tamper_summary = verify_case(case)
            assert ok_tamper is False and len(tamper_summary["errors"]) >= 1
            results["checks"].append(
                {
                    "name": "tamper_detection",
                    "ok": True,
                    "detected_errors": len(tamper_summary["errors"]),
                }
            )
        results["ok"] = True

    if json_out:
        print(json.dumps(results, indent=2))
    else:
        print(f"v{VERSION} self-test PASSED ({len(results['checks'])} checks)")
        for c in results["checks"]:
            print(f"  [OK] {c['name']}")
    return 0


def acquire(args):
    case = pathlib.Path(args.out).expanduser()
    budget = Budget(args.budget_mb, args.budget_minutes)
    dev = Device(args.serial, budget)
    run = Run(case, dev, budget, resume=args.resume)

    run.guarded("00_preflight", lambda: preflight(run))
    run.guarded("02_ladder", lambda: ladder(run))
    set_tz(run)
    run.guarded("03_identity", lambda: identity(run))
    run.guarded("04_services", lambda: services(run))
    run.guarded("05_providers", lambda: providers(run))
    run.guarded("06_packages", lambda: packages(run))
    run.guarded("08_media", lambda: media(run, mode=args.media_mode))
    for pkg in APPS:
        if budget.exhausted():
            break
        run.guarded(f"09_app:{pkg}", lambda p=pkg: capture_app(run, p))
    run.guarded("11_trash", lambda: trash(run))
    run.guarded("12_logs", lambda: logs(run))
    for st in carve_all(run):
        run.add(st)
    run.guarded("13_timeline", lambda: timeline(run))
    run.guarded("14_report", lambda: report(run))

    ok, summary = verify_case(case)
    print(json.dumps(summary, indent=2))
    return 0 if ok else 1


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="v19.py - Android max-yield read-only hash-chained forensic acquisition"
    )
    ap.add_argument("--serial", help="ADB device serial")
    ap.add_argument("--out", help="Output case directory")
    ap.add_argument("--budget-minutes", type=int, default=900)
    ap.add_argument("--budget-mb", type=int, default=32768)
    ap.add_argument(
        "--media-mode",
        choices=("thumbnails", "small", "all", "none"),
        default="thumbnails",
    )
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--verify", metavar="CASE", help="Verify hash chain and artifacts")
    ap.add_argument("--serve", metavar="CASE", help="Verify and serve HTML report")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--self-test", action="store_true", help="Run offline forensic self-test")
    ap.add_argument("--json", action="store_true", help="JSON output for self-test/verify")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test(json_out=args.json)
    if args.verify:
        ok, summary = verify_case(args.verify)
        print(json.dumps(summary, indent=2))
        return 0 if ok else 1
    if args.serve:
        return serve_case(args.serve, args.port)
    if args.serial and args.out:
        return acquire(args)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
