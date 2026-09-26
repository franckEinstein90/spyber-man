import os
import signal
import subprocess
import time
from pathlib import Path

import httpx

MCP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = MCP_DIR.parent / "webcrawler"
RUNTIME_DIR = MCP_DIR / ".runtime"
PID_FILE = RUNTIME_DIR / "crawler.pid"
LOG_FILE = RUNTIME_DIR / "crawler.log"


def _backend_url() -> str:
    return os.getenv("CRAWLER_BACKEND_URL", "http://localhost:3000").rstrip("/")


def _probe() -> tuple[bool, int | None, str | None]:
    try:
        response = httpx.get(f"{_backend_url()}/api/crawl-results", timeout=3)
        response.raise_for_status()
        payload = response.json()
        items = payload.get("items", [])
        count = len(items) if isinstance(items, list) else None
        return True, count, None
    except (httpx.HTTPError, ValueError) as exc:
        return False, None, str(exc)


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _read_pid() -> int | None:
    try:
        pid = int(PID_FILE.read_text().strip())
    except (OSError, ValueError):
        return None
    return pid if _pid_alive(pid) else None


def _process_cwd(pid: int) -> str:
    try:
        return os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        return ""


def _backend_groups() -> set[int]:
    own_group = os.getpgid(0)
    groups: set[int] = set()
    try:
        listing = subprocess.run(
            ["ps", "-eo", "pid=,pgid=,args="],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return groups

    for line in listing.stdout.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        pid_text, group_text, args = parts
        try:
            pid = int(pid_text)
            group = int(group_text)
        except ValueError:
            continue
        if group == own_group:
            continue
        cwd = _process_cwd(pid)
        in_backend = cwd == str(BACKEND_DIR) or "webcrawler" in args
        looks_like_server = any(
            token in args for token in ("nodemon", "ts-node", "main.ts", "npm run dev")
        )
        if in_backend and looks_like_server:
            groups.add(group)
    return groups


def _signal_groups(groups: set[int], sig: int) -> None:
    for group in groups:
        try:
            os.killpg(group, sig)
        except OSError:
            continue


def crawler_status() -> dict:
    running, count, error = _probe()
    status = {
        "running": running,
        "backend_url": _backend_url(),
        "pid": _read_pid(),
        "recent_result_count": count,
    }
    if not running and error:
        status["error"] = error
    return status


def _wait_until_running(timeout_seconds: float) -> dict:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        status = crawler_status()
        if status["running"]:
            return status
        time.sleep(0.4)
    status = crawler_status()
    tail = ""
    try:
        lines = LOG_FILE.read_text(errors="replace").splitlines()
        tail = "\n".join(lines[-20:])
    except OSError:
        tail = ""
    status["log_tail"] = tail
    return status


def start_crawler() -> dict:
    current = crawler_status()
    if current["running"]:
        current["already_running"] = True
        current["started"] = False
        return current

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PUPPETEER_CACHE_DIR"] = str(Path.home() / ".cache" / "puppeteer")
    log = LOG_FILE.open("ab")
    try:
        process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=BACKEND_DIR,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except OSError as exc:
        return {"running": False, "started": False, "backend_url": _backend_url(), "error": str(exc)}
    finally:
        log.close()

    PID_FILE.write_text(str(process.pid))
    status = _wait_until_running(30)
    status["started"] = bool(status["running"])
    status["already_running"] = False
    if not status["running"]:
        status["error"] = status.get("error") or "The crawler process started but did not open its port."
    return status


def stop_crawler() -> dict:
    current = crawler_status()
    groups = _backend_groups()
    if not current["running"] and not groups:
        PID_FILE.unlink(missing_ok=True)
        return {
            "running": False,
            "stopped": False,
            "already_stopped": True,
            "backend_url": _backend_url(),
        }

    _signal_groups(groups, signal.SIGTERM)
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if not crawler_status()["running"] and not _backend_groups():
            break
        time.sleep(0.3)
    else:
        _signal_groups(_backend_groups(), signal.SIGKILL)
        time.sleep(0.4)

    PID_FILE.unlink(missing_ok=True)
    status = crawler_status()
    status["stopped"] = not status["running"]
    status["already_stopped"] = False
    if status["running"]:
        status["error"] = "The crawler is still listening."
    return status
