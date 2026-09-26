import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path

MCP_DIR = Path(__file__).resolve().parent
DATA_DIR = MCP_DIR.parent / "data"
RUNTIME_DIR = MCP_DIR / ".runtime"
PID_FILE = RUNTIME_DIR / "database.pid"
LOG_FILE = RUNTIME_DIR / "database.log"
MIGRATIONS_CLI = DATA_DIR / "src" / "migrations-cli.ts"
TSX = DATA_DIR / "node_modules" / ".bin" / "tsx"


def _host() -> str:
    return os.getenv("POSTGRES_HOST", "127.0.0.1")


def _port() -> int:
    parsed = int(os.getenv("POSTGRES_PORT", "5432"))
    return parsed if parsed > 0 else 5432


def _port_open() -> bool:
    try:
        with socket.create_connection((_host(), _port()), timeout=1):
            return True
    except OSError:
        return False


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


def _database_pids() -> list[int]:
    try:
        listing = subprocess.run(
            ["ps", "-eo", "pid=,args="],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return []

    pids: list[int] = []
    for line in listing.stdout.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) < 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        args = parts[1]
        cwd = _process_cwd(pid)
        is_server = "data/src/server.ts" in args
        is_npm_dev = cwd == str(DATA_DIR) and "npm" in args and " run dev" in f" {args}"
        if is_server or is_npm_dev:
            pids.append(pid)
    return pids


def database_status() -> dict:
    running = _port_open()
    status = {
        "running": running,
        "host": _host(),
        "port": _port(),
        "pid": _read_pid(),
    }
    if not running:
        status["error"] = f"Nothing is accepting connections on {_host()}:{_port()}."
    return status


def _wait_until_running(timeout_seconds: float) -> dict:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if _port_open():
            return database_status()
        time.sleep(0.4)
    status = database_status()
    try:
        lines = LOG_FILE.read_text(errors="replace").splitlines()
        status["log_tail"] = "\n".join(lines[-20:])
    except OSError:
        status["log_tail"] = ""
    return status


def start_database() -> dict:
    current = database_status()
    if current["running"]:
        current["already_running"] = True
        current["started"] = False
        return current

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    log = LOG_FILE.open("ab")
    try:
        process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=DATA_DIR,
            env=os.environ.copy(),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except OSError as exc:
        return {
            "running": False,
            "started": False,
            "host": _host(),
            "port": _port(),
            "error": str(exc),
        }
    finally:
        log.close()

    PID_FILE.write_text(str(process.pid))
    status = _wait_until_running(40)
    status["started"] = bool(status["running"])
    status["already_running"] = False
    if not status["running"]:
        detail = status.get("log_tail") or status.get("error") or "The database process started but did not open its port."
        status["error"] = f"The database did not stay up.\n{detail}"
    return status


def stop_database() -> dict:
    current = database_status()
    pids = _database_pids()
    if not current["running"] and not pids:
        PID_FILE.unlink(missing_ok=True)
        return {
            "running": False,
            "stopped": False,
            "already_stopped": True,
            "host": _host(),
            "port": _port(),
        }

    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            continue

    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if not _port_open() and not _database_pids():
            break
        time.sleep(0.3)
    else:
        for pid in _database_pids():
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                continue
        time.sleep(0.4)

    PID_FILE.unlink(missing_ok=True)
    status = database_status()
    status["stopped"] = not status["running"]
    status["already_stopped"] = False
    if status["running"]:
        status["error"] = "The database is still listening."
    else:
        status.pop("error", None)
    return status


def _migration_command(command: str) -> dict:
    if not TSX.exists():
        return {"ok": False, "error": f"Missing {TSX}. Run npm install in data/."}
    try:
        completed = subprocess.run(
            [str(TSX), str(MIGRATIONS_CLI), command],
            cwd=DATA_DIR,
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": str(exc)}

    payload = None
    for line in reversed(completed.stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                payload = None
            break
    if not isinstance(payload, dict):
        detail = (completed.stderr or completed.stdout or "Migration command failed.").strip()
        return {"ok": False, "error": detail[-2000:]}
    if completed.returncode != 0 and payload.get("ok") is not False:
        payload["ok"] = False
        payload["error"] = (completed.stderr or "Migration command failed.").strip()[-2000:]
    return payload


def migration_status() -> dict:
    return _migration_command("status")


def apply_pending_migrations() -> dict:
    return _migration_command("apply")
