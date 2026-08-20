#!/usr/bin/env python3
import os
import sys
from urllib.parse import parse_qsl, unquote, urlsplit


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("A PostgreSQL command is required.")

    raw_url = os.environ.pop("DATABASE_COMMAND_URL", "")
    parsed = urlsplit(raw_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise SystemExit("DATABASE_COMMAND_URL must be a PostgreSQL URL.")

    database = unquote(parsed.path.removeprefix("/"))
    if not database:
        raise SystemExit("DATABASE_COMMAND_URL must include a database name.")

    environment = os.environ.copy()
    environment["PGHOST"] = parsed.hostname
    environment["PGPORT"] = str(parsed.port or 5432)
    environment["PGDATABASE"] = database
    if parsed.username is not None:
        environment["PGUSER"] = unquote(parsed.username)
    if parsed.password is not None:
        environment["PGPASSWORD"] = unquote(parsed.password)

    supported_options = {
        "application_name": "PGAPPNAME",
        "channel_binding": "PGCHANNELBINDING",
        "connect_timeout": "PGCONNECT_TIMEOUT",
        "options": "PGOPTIONS",
        "sslcert": "PGSSLCERT",
        "sslkey": "PGSSLKEY",
        "sslmode": "PGSSLMODE",
        "sslrootcert": "PGSSLROOTCERT",
        "target_session_attrs": "PGTARGETSESSIONATTRS",
    }
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        environment_name = supported_options.get(key)
        if environment_name:
            environment[environment_name] = value

    tools_container = environment.get("POSTGRES_TOOLS_CONTAINER")
    if tools_container:
        forwarded_names = sorted(name for name in environment if name.startswith("PG"))
        command = ["docker", "exec", "-i"]
        for name in forwarded_names:
            command.extend(["-e", name])
        command.extend([tools_container, *sys.argv[1:]])
        os.execvpe(command[0], command, environment)

    os.execvpe(sys.argv[1], sys.argv[1:], environment)


if __name__ == "__main__":
    main()
