import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def load_workspace_env() -> None:
	env_candidates = [Path.cwd() / ".env", Path.cwd().parent / ".env"]

	env_path = next((candidate for candidate in env_candidates if candidate.exists()), None)
	if env_path is None:
		return

	for raw_line in env_path.read_text(encoding="utf-8").splitlines():
		line = raw_line.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue

		key, raw_value = line.split("=", 1)
		key = key.strip()
		value = raw_value.strip().strip("\"'")

		if key and key not in os.environ:
			os.environ[key] = value


def parse_port(value: object) -> int | None:
	if isinstance(value, int) and value > 0:
		return value
	if isinstance(value, str) and value.isdigit():
		parsed = int(value)
		return parsed if parsed > 0 else None
	return None


def extract_port(payload: object) -> int | None:
	direct_port = parse_port(payload)
	if direct_port is not None:
		return direct_port

	if not isinstance(payload, dict):
		return None

	for key in ("port", "freePort"):
		port = parse_port(payload.get(key))
		if port is not None:
			return port

	nested = payload.get("data")
	if isinstance(nested, dict):
		port = parse_port(nested.get("port"))
		if port is not None:
			return port

	return None


def resolve_streamlit_port() -> int:
	default_port = parse_port(os.getenv("STREAMLIT_SERVER_PORT")) or 8501
	port_manager_api_url = os.getenv("PORT_MANAGER_API_URL", "").strip()
	if not port_manager_api_url:
		return default_port

	free_port_url = urllib.parse.urljoin(f"{port_manager_api_url.rstrip('/')}/", "api/free-port")

	try:
		with urllib.request.urlopen(free_port_url, timeout=5) as response:
			payload = json.loads(response.read().decode("utf-8"))
		resolved_port = extract_port(payload)
		if resolved_port is None:
			raise ValueError("response did not include a valid port")

		print(f"Using Streamlit port {resolved_port} from port manager at {free_port_url}", file=sys.stderr)
		return resolved_port
	except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
		print(
			f"Failed to get Streamlit port from {free_port_url}; falling back to {default_port}: {error}",
			file=sys.stderr,
		)
		return default_port


def main() -> None:
	load_workspace_env()
	port = resolve_streamlit_port()
	host = os.getenv("STREAMLIT_SERVER_ADDRESS", "0.0.0.0").strip() or "0.0.0.0"

	env = os.environ.copy()
	env["STREAMLIT_SERVER_PORT"] = str(port)
	env["STREAMLIT_SERVER_HEADLESS"] = "true"

	app_path = str(Path(__file__).with_name("app.py"))
	if host == "0.0.0.0":
		print(f"Streamlit running at: http://localhost:{port} (bound to 0.0.0.0)", file=sys.stderr)
	else:
		print(f"Streamlit running at: http://{host}:{port}", file=sys.stderr)
	command = [
		sys.executable,
		"-m",
		"streamlit",
		"run",
		app_path,
		"--server.headless",
		"true",
		"--server.address",
		host,
		"--server.port",
		str(port),
		*sys.argv[1:],
	]

	os.execvpe(sys.executable, command, env)


if __name__ == "__main__":
	main()