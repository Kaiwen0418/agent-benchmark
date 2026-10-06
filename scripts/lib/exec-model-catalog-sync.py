#!/usr/bin/env python3
"""Launch maintenance with a validated loopback DB URL, not runtime secrets."""
import os
from pathlib import Path
import shlex
import stat
import sys
from urllib.parse import quote, unquote, urlsplit

SOURCES = {"openrouter", "litellm", "openai", "anthropic", "google", "xai", "kimi", "deepseek"}
TARGETS = {
    "development": ("agentbench-local-development", "agentbench_development", "55433"),
    "production": ("agentbench-single-vm", "agentbench_production", "55432"),
}


def read_settings(path: Path) -> dict[str, str]:
    # Reject symlinks and world-accessible files before reading any credentials.
    with path.open("r") as stream:
        info = os.fstat(stream.fileno())
        if (path.is_symlink() or not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                or info.st_mode & 0o007 or info.st_mode & 0o111):
            raise ValueError("Runtime file must be root-owned, non-executable and inaccessible to others.")
        settings = {}
        for line in stream:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            key, separator, raw = line.partition("=")
            key = key.strip()
            if not separator or not key.isidentifier() or key in settings:
                raise ValueError("Invalid runtime environment key layout.")
            parts = shlex.split(raw, comments=True)
            if len(parts) > 1:
                raise ValueError("Invalid runtime environment value layout.")
            settings[key] = parts[0] if parts else ""
    return settings


def connection_url(settings: dict[str, str], environment: str) -> str:
    if environment not in TARGETS:
        raise ValueError("Unsupported maintenance environment.")
    project, database, port = TARGETS[environment]
    if any(settings.get(key) != value for key, value in {
        "SINGLE_VM_ENVIRONMENT": environment,
        "SINGLE_VM_PROJECT": project,
        "SINGLE_VM_DATABASE_NAME": database,
        "PRODUCTION_DATABASE_DIRECT_PORT": port,
    }.items()):
        raise ValueError("Maintenance environment, project, database or listener mismatch.")
    user = settings.get("SINGLE_VM_DATABASE_USER", "")
    password = settings.get("PRODUCTION_DATABASE_PASSWORD", "")
    url = urlsplit(settings.get("DATABASE_URL", ""))
    if (not user or not password or url.scheme not in {"postgres", "postgresql"}
            or url.hostname != "pgbouncer" or url.port != 5432
            or unquote(url.path) != "/" + database or url.username is None
            or unquote(url.username) != user or url.password is None
            or unquote(url.password) != password or url.query or url.fragment):
        raise ValueError("Protected database credentials do not match the runtime target.")
    return f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@127.0.0.1:{port}/{database}"


def maintenance_environment(parent: dict[str, str], url: str) -> dict[str, str]:
    environment = {
        key: value for key, value in parent.items()
        if not key.startswith(("AUTH_", "RUNNER_", "DATABASE_", "PRODUCTION_DATABASE_", "PG"))
        and "SUPABASE" not in key
    }
    environment["DATABASE_DIRECT_URL"] = url
    return environment


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[3] not in SOURCES:
        raise SystemExit("Expected a protected runtime file, environment and supported source.")
    try:
        url = connection_url(read_settings(Path(sys.argv[1])), sys.argv[2])
    except (OSError, ValueError):
        # Parser exceptions can include raw input. Never print their contents.
        raise SystemExit("Model sync runtime validation failed; check file permissions and environment identity.") from None
    command = ["pnpm", "--filter", "@agentbench/model-catalog-sync", "sync", sys.argv[3]]
    os.execvpe(command[0], command, maintenance_environment(dict(os.environ), url))


if __name__ == "__main__":
    main()
