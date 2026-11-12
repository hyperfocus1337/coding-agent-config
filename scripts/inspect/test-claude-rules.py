"""Check launch modes and rule filters without starting Claude or making API calls."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODES = (
    "claude",
    "claude-full",
    "claude-nohooks",
    "claude-norules",
    "claude-nohooks-norules",
    "claude-vanilla",
    "claude-vanilla-minimal",
)
NO_RULES = MODES[3:]


class RuleSelectionTest(unittest.TestCase):
    shell = "fish"
    source = ROOT / "dot_config/fish/conf.d/claude.fish"

    def setUp(self):
        if not shutil.which(self.shell):
            self.skipTest(f"{self.shell} is not installed")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        rules = self.home / ".claude/rules"
        (rules / "nested").mkdir(parents=True)
        for name in ("code", "tools", "writing", "nested/security"):
            (rules / f"{name}.md").write_text("rule\n")
        self.settings = self.home / ".claude/settings-minimal.json"
        self.settings.write_text(
            json.dumps(
                {
                    "sentinel": True,
                    "disableAllHooks": False,
                    "claudeMdExcludes": ["/existing"],
                }
            )
        )
        (self.home / ".claude/settings-vanilla.json").write_text(
            json.dumps(
                {
                    "vanilla": True,
                    "disableAllHooks": True,
                    "attribution": {"commit": "", "pr": ""},
                }
            )
        )
        (self.home / ".claude/cli").mkdir()
        shutil.copyfile(
            ROOT / "dot_claude/cli/launch.sh", self.home / ".claude/cli/launch.sh"
        )
        binary = self.home / "bin/claude"
        binary.parent.mkdir()
        binary.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            "print(json.dumps({'args': sys.argv[1:], "
            "'mcp': os.environ.get('ENABLE_CLAUDEAI_MCP_SERVERS'), "
            "'disabled_rules': os.environ.get('CLAUDE_CODE_DISABLE_CLAUDE_MDS')}))\n"
        )
        binary.chmod(0o755)

    def launch(self, *args, inherited_rules=None):
        if self.shell == "fish":
            command = [
                "fish",
                "--no-config",
                "-c",
                "source $argv[1]; $argv[2..-1]",
                "--",
            ]
        else:
            flags = ["--noprofile", "--norc"] if self.shell == "bash" else ["-f"]
            command = [self.shell, *flags, "-c", 'source "$1"; shift; "$@"', "--"]
        env = {
            **os.environ,
            "HOME": str(self.home),
            "PATH": f"{self.home}/bin:{os.environ['PATH']}",
            "ENABLE_CLAUDEAI_MCP_SERVERS": "true",
        }
        env.pop("CLAUDE_CODE_DISABLE_CLAUDE_MDS", None)
        if inherited_rules is not None:
            env["CLAUDE_CODE_DISABLE_CLAUDE_MDS"] = inherited_rules
        return subprocess.run(
            [*command, str(self.source), *args],
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def decode(self, result):
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        args = output["args"]
        self.assertEqual(args.count("--settings"), 1)
        index = args.index("--settings")
        settings = json.loads(args[index + 1])
        return output, settings, args[:index] + args[index + 2 :]

    def assert_exclusions(self, settings, names, *, minimal=True):
        expected = ["/existing"] if minimal else []
        expected += [str(self.home / f".claude/rules/{name}.md") for name in names]
        self.assertEqual(sorted(settings["claudeMdExcludes"]), sorted(expected))

    def test_modes_and_shortcuts(self):
        for mode in MODES:
            with self.subTest(mode=mode):
                direct = self.launch(mode, "--model", "sonnet", "a prompt")
                generic = self.launch(
                    "claude-rules",
                    "--mode",
                    mode,
                    "--",
                    "--model",
                    "sonnet",
                    "a prompt",
                )
                output, settings, args = self.decode(direct)
                self.assertEqual(json.loads(direct.stdout), json.loads(generic.stdout))
                self.assertEqual(generic.returncode, 0, generic.stderr)
                minimal = mode not in ("claude-full", "claude-vanilla")
                self.assertEqual(settings.get("sentinel", False), minimal)
                nohooks = "nohooks" in mode or "vanilla" in mode
                self.assertEqual(settings.get("disableAllHooks", False), nohooks)
                self.assertEqual(
                    output["mcp"], None if mode == "claude-full" else "false"
                )
                self.assertEqual(
                    output["disabled_rules"], "1" if mode in NO_RULES else None
                )
                prefix = (
                    ["--setting-sources", "", "--strict-mcp-config"]
                    if "vanilla" in mode
                    else []
                )
                self.assertEqual(args, prefix + ["--model", "sonnet", "a prompt"])
                if "vanilla" in mode:
                    self.assertEqual(settings["attribution"], {"commit": "", "pr": ""})

    def test_selection_and_forwarding(self):
        for mode, selection, excluded in (
            ("include", "code,writing.md", ["tools", "nested/security"]),
            ("exclude", "tools,nested/security", ["tools", "nested/security"]),
            ("exclude", "tools,tools.md", ["tools"]),
            ("include", "code,code.md", ["tools", "writing", "nested/security"]),
            ("include", "code,tools,writing,nested/security", []),
        ):
            with self.subTest(mode=mode, selection=selection):
                output, settings, args = self.decode(
                    self.launch(
                        f"claude-{mode}-rules",
                        selection,
                        "--model",
                        "sonnet",
                        "a prompt",
                    )
                )
                self.assertTrue(settings["sentinel"])
                self.assert_exclusions(settings, excluded)
                self.assertEqual(args, ["--model", "sonnet", "a prompt"])
                self.assertEqual(output["mcp"], "false")

    def test_mode_with_both_filters(self):
        for mode in MODES[:3]:
            with self.subTest(mode=mode):
                output, settings, args = self.decode(
                    self.launch(
                        "claude-rules",
                        "--mode",
                        mode,
                        "--include",
                        "code,writing.md",
                        "--exclude",
                        "writing,tools",
                        "--",
                        "a prompt",
                    )
                )
                self.assert_exclusions(
                    settings,
                    ["tools", "writing", "nested/security"],
                    minimal=mode != "claude-full",
                )
                self.assertEqual(settings.get("sentinel", False), mode != "claude-full")
                self.assertEqual(
                    settings.get("disableAllHooks", False), mode == "claude-nohooks"
                )
                self.assertEqual(output["disabled_rules"], None)
                self.assertEqual(args, ["a prompt"])

    def test_default_mode(self):
        _, settings, _ = self.decode(self.launch("claude-rules", "--exclude", "tools"))
        self.assertTrue(settings["sentinel"])
        self.assert_exclusions(settings, ["tools"])

    def test_full_mode_does_not_read_minimal_settings(self):
        self.settings.unlink()
        _, settings, _ = self.decode(
            self.launch("claude-rules", "--mode", "claude-full", "--exclude", "tools")
        )
        self.assert_exclusions(settings, ["tools"], minimal=False)

    def test_forwarded_empty_argument(self):
        _, _, args = self.decode(
            self.launch(
                "claude-rules", "--include", "code", "--", "--model", "sonnet", ""
            )
        )
        self.assertEqual(args, ["--model", "sonnet", ""])

    def test_rule_names_with_spaces(self):
        rule = self.home / ".claude/rules/space name.md"
        rule.write_text("rule\n")
        _, settings, _ = self.decode(self.launch("claude-exclude-rules", "space name"))
        self.assert_exclusions(settings, ["space name"])

    def test_symlink_and_unusual_file_names(self):
        target = self.home / "shared-rules"
        target.mkdir()
        (target / "shared.md").write_text("rule\n")
        (self.home / ".claude/rules/linked").symlink_to(
            target, target_is_directory=True
        )
        (self.home / ".claude/rules/odd,\nname.md").write_text("rule\n")
        _, settings, _ = self.decode(
            self.launch("claude-include-rules", "code,linked/shared")
        )
        self.assert_exclusions(
            settings, ["tools", "writing", "nested/security", "odd,\nname"]
        )

    def test_invalid_selection(self):
        for args in (
            (),
            ("",),
            (",",),
            ("code,",),
            ("code,,tools",),
            ("unknown",),
            ("code,unknown",),
        ):
            for filter_mode in ("include", "exclude"):
                result = self.launch(f"claude-{filter_mode}-rules", *args)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertTrue(result.stderr)

    def test_invalid_interface(self):
        for args in (
            ("--mode",),
            ("--include",),
            ("--exclude",),
            ("--mode", "unknown"),
            ("--model", "sonnet"),
        ):
            result = self.launch("claude-rules", *args)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
        result = self.launch("claude-rules", "--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Usage:", result.stdout)

    def test_disabled_modes_reject_filters(self):
        for mode in NO_RULES:
            for flag in ("--include", "--exclude"):
                result = self.launch("claude-rules", "--mode", mode, flag, "code")
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertIn("Rule filters cannot", result.stderr)

    def test_settings_override(self):
        for mode in MODES:
            _, settings, _ = self.decode(
                self.launch(
                    mode, "--settings", '{"first":true}', '--settings={"last":true}'
                )
            )
            self.assertEqual(settings, {"last": True})
        for args in (("--settings", "{}"), ("--settings={}",)):
            result = self.launch("claude-rules", "--include", "code", "--", *args)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")

    def test_inherited_rule_disable_is_preserved(self):
        output, _, _ = self.decode(
            self.launch("claude-include-rules", "code", inherited_rules="1")
        )
        self.assertEqual(output["disabled_rules"], "1")

    def test_invalid_settings_do_not_launch(self):
        self.settings.write_text("invalid json")
        result = self.launch("claude-exclude-rules", "tools")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")

    def test_failed_scan_does_not_launch(self):
        (self.home / ".claude/rules").rename(self.home / ".claude/other-rules")
        result = self.launch("claude-exclude-rules", "code")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")


class BashRuleSelectionTest(RuleSelectionTest):
    shell = "bash"
    source = ROOT / "dot_claude/cli/claude.sh"


class ZshRuleSelectionTest(BashRuleSelectionTest):
    shell = "zsh"


if __name__ == "__main__":
    unittest.main()
