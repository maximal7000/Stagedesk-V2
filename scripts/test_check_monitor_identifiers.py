import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "check-monitor-identifiers.py"


def load_module():
    spec = importlib.util.spec_from_file_location("check_monitor_identifiers", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CheckerTestCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.empty_allow = self.write("empty.allow", "")

    def write(self, name, content):
        path = self.tmp / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, "-I", str(SCRIPT), *map(str, args)],
            capture_output=True,
            text=True,
            cwd=self.tmp,
        )

    def tokens(self, path, allow=None):
        """Run the CLI on one file and return the flagged tokens."""
        result = self.run_cli("--allow", allow or self.empty_allow, path)
        self.assertIn(result.returncode, (0, 1), result.stderr)
        return [line.rsplit(": ", 1)[1] for line in result.stdout.splitlines()]


class RuleTests(CheckerTestCase):
    def test_snake_case_with_stem_is_flagged(self):
        path = self.write("a.py", "x = config.zeige_uhr\n")
        self.assertEqual(self.tokens(path), ["zeige_uhr"])

    def test_camel_case_with_stem_is_flagged(self):
        path = self.write("a.js", "const bildschirmSlug = 1\n")
        self.assertEqual(self.tokens(path), ["bildschirmSlug"])

    def test_visible_german_text_is_ignored(self):
        path = self.write(
            "a.jsx",
            "const a = <p>Bildschirm nicht gefunden</p>\n"
            'const b = "Linien und Richtungen"\n',
        )
        self.assertEqual(self.tokens(path), [])

    def test_whole_lowercase_literal_in_words_is_flagged(self):
        path = self.write("a.js", "const t = {'von': '07:00'}\n")
        self.assertEqual(self.tokens(path), ["von"])

    def test_whole_lowercase_literal_with_stem_is_flagged(self):
        path = self.write("a.py", "KEY = 'ferien-modus'\n")
        self.assertEqual(self.tokens(path), ["ferien-modus"])

    def test_python_old_model_name_flagged_but_not_in_string(self):
        path = self.write("a.py", "from .models import Bildschirm\n")
        self.assertEqual(self.tokens(path), ["Bildschirm"])
        path = self.write("b.py", 'msg = "Bildschirm"\n')
        self.assertEqual(self.tokens(path), [])

    def test_old_model_names_only_apply_to_python(self):
        path = self.write("a.jsx", "const x = Bildschirm\n")
        self.assertEqual(self.tokens(path), [])

    def test_allowlist_suppresses(self):
        path = self.write("a.js", "const k = 'neu_laden_zeit'\n")
        self.assertEqual(self.tokens(path), ["neu_laden_zeit"])
        allow = self.write("my.allow", "# Uebergangsschluessel\nneu_laden_zeit\n")
        self.assertEqual(self.tokens(path, allow=allow), [])

    def test_stagedesk_is_not_a_finding(self):
        path = self.write("a.py", "stagedesk_url = 1\n")
        self.assertEqual(self.tokens(path), [])

    def test_ist_stem_only_matches_at_word_start(self):
        path = self.write("a.py", "exist_ok = 1\nlist_items = 2\nist_online = 3\n")
        self.assertEqual(self.tokens(path), ["ist_online"])

    def test_template_literal_with_interpolation_is_code(self):
        path = self.write("a.js", "const u = `/api/${zeige_uhr}/x`\nconst v = 'von'\n")
        self.assertEqual(self.tokens(path), ["zeige_uhr", "von"])

    def test_identifiers_in_comments_are_flagged(self):
        path = self.write("a.js", "// siehe zeige_uhr\n")
        self.assertEqual(self.tokens(path), ["zeige_uhr"])

    def test_output_format_and_sorting(self):
        path = self.write("a.py", "ok = 1\nb = zeige_uhr\na = farbe_x\n")
        result = self.run_cli("--allow", self.empty_allow, path)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stdout.splitlines(),
            ["a.py:2: zeige_uhr", "a.py:3: farbe_x"],
        )

    def test_clean_file_exits_0(self):
        path = self.write("a.py", "x = 1\n")
        result = self.run_cli("--allow", self.empty_allow, path)
        self.assertEqual((result.returncode, result.stdout), (0, ""))

    def test_missing_path_exits_2(self):
        result = self.run_cli(self.tmp / "does-not-exist")
        self.assertEqual(result.returncode, 2)
        self.assertIn("does-not-exist", result.stderr)

    def test_directory_is_scanned_recursively(self):
        self.write("d/sub/a.py", "x = zeige_uhr\n")
        self.write("d/sub/__pycache__/b.py", "x = zeige_uhr\n")
        self.write("d/readme.txt", "zeige_uhr\n")
        result = self.run_cli("--allow", self.empty_allow, "d")
        self.assertEqual(result.stdout.splitlines(), ["d/sub/a.py:1: zeige_uhr"])


class DefaultScopeTests(CheckerTestCase):
    def test_default_scope_excludes_migrations_and_migration_tests(self):
        mod = load_module()
        root = self.tmp / "repo"
        for rel in (
            "backend/monitor/api.py",
            "backend/monitor/migrations/0001_initial.py",
            "backend/monitor/tests_migrations.py",
            "backend/monitor/migrations/0042_mediapage.py",
            "frontend/src/pages/MonitorPage.jsx",
            "frontend/src/components/display/views/InfoView.jsx",
            "frontend/src/components/monitor-admin/pages/Settings.jsx",
            "frontend/src/components/other/Unrelated.jsx",
        ):
            self.write(f"repo/{rel}", "x = 1\n")
        found = sorted(p.relative_to(root).as_posix() for p in mod.default_files(root))
        self.assertEqual(
            found,
            [
                "backend/monitor/api.py",
                "frontend/src/components/display/views/InfoView.jsx",
                "frontend/src/components/monitor-admin/pages/Settings.jsx",
                "frontend/src/pages/MonitorPage.jsx",
            ],
        )

    def test_default_run_works_from_any_cwd(self):
        result = self.run_cli()
        self.assertIn(result.returncode, (0, 1), result.stderr)


if __name__ == "__main__":
    unittest.main()
