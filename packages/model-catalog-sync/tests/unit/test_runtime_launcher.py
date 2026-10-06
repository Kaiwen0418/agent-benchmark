import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import quote, urlsplit, unquote

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("catalog_launcher", ROOT / "scripts/lib/exec-model-catalog-sync.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def settings(environment="production"):
    project, database, port = launcher.TARGETS[environment]
    password = "fake:p@ss/% word'"
    return {
        "SINGLE_VM_ENVIRONMENT": environment,
        "SINGLE_VM_PROJECT": project,
        "SINGLE_VM_DATABASE_NAME": database,
        "SINGLE_VM_DATABASE_USER": "agentbench_test",
        "PRODUCTION_DATABASE_DIRECT_PORT": port,
        "PRODUCTION_DATABASE_PASSWORD": password,
        "DATABASE_URL": f"postgresql://agentbench_test:{quote(password, safe='')}@pgbouncer:5432/{database}",
        "AUTH_SECRET": "must-not-be-forwarded",
    }


class RuntimeLauncherTests(unittest.TestCase):
    def test_both_environment_urls_and_password_encoding(self):
        for environment in launcher.TARGETS:
            with self.subTest(environment=environment):
                values = settings(environment)
                url = urlsplit(launcher.connection_url(values, environment))
                self.assertEqual(url.hostname, "127.0.0.1")
                self.assertEqual(str(url.port), launcher.TARGETS[environment][2])
                self.assertEqual(unquote(url.password), values["PRODUCTION_DATABASE_PASSWORD"])

    def test_identity_drift_rejected(self):
        for key in ("SINGLE_VM_ENVIRONMENT", "SINGLE_VM_PROJECT", "SINGLE_VM_DATABASE_NAME", "PRODUCTION_DATABASE_DIRECT_PORT", "SINGLE_VM_DATABASE_USER", "PRODUCTION_DATABASE_PASSWORD", "DATABASE_URL"):
            values = settings()
            values[key] = "wrong"
            with self.subTest(key=key), self.assertRaises(ValueError):
                launcher.connection_url(values, "production")
        with self.assertRaises(ValueError):
            launcher.connection_url(settings("development"), "production")
        with self.assertRaises(ValueError):
            launcher.connection_url(settings(), "preview")

    def test_url_options_and_remote_hosts_rejected(self):
        for suffix in ("?host=remote", "#fragment"):
            values = settings()
            values["DATABASE_URL"] += suffix
            with self.assertRaises(ValueError): launcher.connection_url(values, "production")
        values = settings()
        values["DATABASE_URL"] = values["DATABASE_URL"].replace("@pgbouncer:", "@remote:")
        with self.assertRaises(ValueError): launcher.connection_url(values, "production")

    def test_only_selected_database_and_provider_secrets_forwarded(self):
        parent = {"PATH":"/bin", "OPENAI_API_KEY":"provider", "AUTH_SECRET":"private",
                  "RUNNER_SHARED_SECRET":"private", "SUPABASE_SERVICE_ROLE_KEY":"private",
                  "DATABASE_URL":"legacy", "DATABASE_DIRECT_URL":"legacy", "PGPASSWORD":"private",
                  "PROD_SUPABASE_DB_URL":"legacy", "TEST_SUPABASE_DB_URL":"legacy",
                  "PRODUCTION_DATABASE_PASSWORD":"private", "PRODUCTION_DATABASE_ADMIN_PASSWORD":"private"}
        parent["NEXT_PUBLIC_" + "SUPABASE_URL"] = "legacy"
        self.assertEqual(launcher.maintenance_environment(parent, "new-direct-url"),
                         {"PATH":"/bin", "OPENAI_API_KEY":"provider", "DATABASE_DIRECT_URL":"new-direct-url"})

    def test_permissions_duplicates_and_quoted_values(self):
        import shlex
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.env"
            values = settings()
            path.write_text("".join(f"{key}={shlex.quote(value)}\n" for key,value in values.items()))
            def info(mode=0o660, uid=0):
                return os.stat_result((stat.S_IFREG | mode, 0, 0, 1, uid, 0, 0, 0, 0, 0))
            with patch.object(launcher.os, "fstat", return_value=info()):
                self.assertEqual(launcher.read_settings(path), values)
            for mode,uid in ((0o664,0),(0o770,0),(0o660,1000)):
                with patch.object(launcher.os, "fstat", return_value=info(mode,uid)), self.assertRaises(ValueError):
                    launcher.read_settings(path)
            with patch.object(launcher.os, "fstat", return_value=info()):
                link = Path(directory) / "link.env"
                link.symlink_to(path)
                with self.assertRaises(ValueError): launcher.read_settings(link)
                path.write_text("DATABASE_URL=one\nDATABASE_URL=two\n")
                with self.assertRaises(ValueError): launcher.read_settings(path)

    def test_invalid_input_never_executes_or_prints_credential(self):
        with patch.object(launcher.sys, "argv", ["launcher", "file", "production", "unknown"]), patch.object(launcher.os, "execvpe") as execute:
            with self.assertRaises(SystemExit): launcher.main()
            execute.assert_not_called()
        with patch.object(launcher.sys, "argv", ["launcher", "file", "production", "openrouter"]), patch.object(launcher, "read_settings", side_effect=ValueError("sensitive-value")), patch.object(launcher.os, "execvpe") as execute:
            with self.assertRaises(SystemExit) as error: launcher.main()
            self.assertNotIn("sensitive-value", str(error.exception))
            execute.assert_not_called()

    def test_credentials_not_passed_in_arguments(self):
        values = settings()
        with patch.object(launcher.sys, "argv", ["launcher", "file", "production", "openrouter"]), patch.object(launcher, "read_settings", return_value=values), patch.object(launcher.os, "execvpe") as execute:
            launcher.main()
            command = execute.call_args.args[1]
            environment = execute.call_args.args[2]
            self.assertEqual(command, ["pnpm", "--filter", "@agentbench/model-catalog-sync", "sync", "openrouter"])
            self.assertNotIn(values["PRODUCTION_DATABASE_PASSWORD"], " ".join(command))
            self.assertIn("127.0.0.1:55432", environment["DATABASE_DIRECT_URL"])
            self.assertNotIn("AUTH_SECRET", environment)


if __name__ == "__main__":
    unittest.main()
