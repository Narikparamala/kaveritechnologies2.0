"""
Kaveri secure-code runner (built-in, server-side).

Called ONLY by the secure-grade Supabase edge function over HTTPS with a
shared bearer token. Executes one Python program against one stdin payload
inside a hardened subprocess and returns go-judge-compatible status strings:

    Accepted | Nonzero Exit Status | Signalled | Time Limit Exceeded
    Memory Limit Exceeded | Internal Error

Hardening (best effort on Vercel's Firecracker microVM):
- subprocess runs with `-I` (CPython isolated mode: no user site, no env leaks)
- sanitized environment: executed code sees PATH/HOME/PYTHONIOENCODING only,
  so the runner token in the function's env can never be read by student code
- CPU, address-space, process and file-size rlimits via preexec_fn
- wall-clock kill switch, output truncated to 64 KiB
- code/stdin size limits mirrored from the edge function

The runner is stateless and holds no database credentials. Scores are always
computed in secure-grade from actual stdout, so this endpoint alone can never
fabricate a grade.
"""

import hmac
import json
import os
import resource
import signal
import subprocess
import sys
import tempfile

from flask import Flask, jsonify, request

app = Flask(__name__)

MAX_CODE_BYTES = 20_000
MAX_STDIN_BYTES = 20_000
MAX_OUTPUT_BYTES = 65_536
CPU_LIMIT_SECONDS = 2
WALL_LIMIT_SECONDS = 4.5
ADDRESS_SPACE_LIMIT = 256 * 1024 * 1024
PROC_LIMIT = 32


def _apply_limits() -> None:  # pragma: no cover - runs inside the forked child
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (CPU_LIMIT_SECONDS, CPU_LIMIT_SECONDS))
    except (ValueError, OSError):
        pass
    try:
        resource.setrlimit(resource.RLIMIT_AS, (ADDRESS_SPACE_LIMIT, ADDRESS_SPACE_LIMIT))
    except (ValueError, OSError):
        pass
    try:
        resource.setrlimit(resource.RLIMIT_NPROC, (PROC_LIMIT, PROC_LIMIT))
    except (ValueError, OSError):
        pass
    try:
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    except (ValueError, OSError):
        pass
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except (ValueError, OSError):
        pass
    # A killed child must never linger past the wall clock.
    signal.alarm(int(WALL_LIMIT_SECONDS) + 1)


def _authorized() -> bool:
    expected = os.environ.get("EXECUTE_TOKEN", "")
    if not expected:
        return False
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        return False
    return hmac.compare_digest(header[len("Bearer "):], expected)


def _truncate(value: str) -> str:
    return value[:MAX_OUTPUT_BYTES]


@app.route("/", methods=["POST"])
@app.route("/api/execute", methods=["POST"])
def execute():
    if not _authorized():
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON body"}), 400

    code = payload.get("code")
    stdin_data = payload.get("stdin", "")
    if not isinstance(code, str) or not code.strip():
        return jsonify({"error": "Code is required"}), 400
    if not isinstance(stdin_data, str):
        return jsonify({"error": "stdin must be a string"}), 400
    if len(code.encode("utf-8")) > MAX_CODE_BYTES:
        return jsonify({"error": "Code is too large"}), 413
    if len(stdin_data.encode("utf-8")) > MAX_STDIN_BYTES:
        return jsonify({"error": "stdin is too large"}), 413

    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".py", prefix="kaveri_run_", dir=tempfile.gettempdir())
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(code)

        child_env = {
            "PATH": os.environ.get("LMS_CHILD_PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": tempfile.gettempdir(),
            "PYTHONIOENCODING": "utf-8",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        result = subprocess.run(
            [os.environ.get("LMS_CHILD_PYTHON", sys.executable), "-I", tmp_path],
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=WALL_LIMIT_SECONDS,
            env=child_env,
            cwd=tempfile.gettempdir(),
            preexec_fn=_apply_limits,
        )
    except subprocess.TimeoutExpired as expired:
        stdout = expired.stdout or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", "replace")
        return jsonify({
            "status": "Time Limit Exceeded",
            "stdout": _truncate(stdout),
            "stderr": "",
            "timeMs": int(WALL_LIMIT_SECONDS * 1000),
        })
    except Exception:  # noqa: BLE001 - never leak internals
        return jsonify({
            "status": "Internal Error",
            "stdout": "",
            "stderr": "",
            "timeMs": None,
        }), 500
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    if result.returncode == 0:
        status = "Accepted"
    elif result.returncode in (-signal.SIGKILL, -signal.SIGSEGV, -signal.SIGALRM):
        status = "Memory Limit Exceeded" if result.returncode == -signal.SIGKILL else "Signalled"
    elif result.returncode < 0:
        status = "Signalled"
    else:
        status = "Nonzero Exit Status"

    return jsonify({
        "status": status,
        "stdout": _truncate(result.stdout or ""),
        "stderr": _truncate(result.stderr or ""),
        "timeMs": None,
    })
