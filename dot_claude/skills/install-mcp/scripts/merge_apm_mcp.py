#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["ruamel.yaml>=0.18"]
# ///
"""Merge project-scoped MCP server deps into a project apm.yml.

Idempotent: dedups by server name (a re-run with the same name replaces the
entry, never duplicates it). Creates a minimal apm.yml when the project has
none, and preserves comments/formatting when one already exists (ruamel).
`targets` becomes the union of existing and requested so we never silently drop
an agent the project already fans out to.

The caller (the install-mcp skill) resolves prompts/secrets into the dep dicts
BEFORE handing them here; this script only merges and writes.

Usage:
  merge_apm_mcp.py --project DIR --targets claude,cursor --deps-json '<json>'
  merge_apm_mcp.py --self-check
"""

import argparse
import json
import re
import sys
from pathlib import Path

# uv inline-script dep, not in the project environment the type checkers see
from ruamel.yaml import YAML  # pyrefly: ignore  # ty: ignore[unresolved-import]

yaml = YAML()
yaml.preserve_quotes = True
yaml.indent(mapping=2, sequence=2, offset=0)


def load(path: Path):
    """Read an existing apm.yml, or return a blank manifest for a new project."""
    if path.exists():
        with path.open() as f:
            return yaml.load(f) or {}
    return {
        "name": path.parent.name or "project",
        "version": "0.0.0",
        "description": "Project-scoped MCP servers (managed by install-mcp).",
        "targets": [],
        "dependencies": {"mcp": []},
        "includes": "auto",
        "scripts": {},
    }


def merge(manifest, targets, deps):
    """Add the targets and the MCP servers to the manifest, without duplicates."""
    keep = [*(manifest.get("targets") or []), *targets]
    manifest["targets"] = list(dict.fromkeys(keep))  # union, order preserved

    section = manifest.setdefault("dependencies", {})
    if section.get("mcp") is None:
        section["mcp"] = []
    mcp = section["mcp"]

    for dep in deps:
        # ponytail: linear scan per dep, fine for the handful a manifest holds.
        # Re-scanning also collapses a dup name inside one batch, no bookkeeping.
        for i, d in enumerate(mcp):
            # isinstance: a hand-edited manifest may hold a bare string entry.
            if isinstance(d, dict) and d.get("name") == dep["name"]:
                mcp[i] = dep  # a re-declared server is one config: replace it
                break
        else:
            mcp.append(dep)
    return manifest


_PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}")


def check_resolved(deps):
    """Refuse to write a dep that still carries an unresolved {{PLACEHOLDER}}.

    The skill substitutes `prompts` values before calling us; an unresolved one
    means it was skipped, and writing it would produce a broken server config
    (a literal `{{DIRECTUS_URL}}` in the URL). Fail loudly instead.
    """
    blob = json.dumps(deps)
    hits = sorted(set(_PLACEHOLDER.findall(blob)))
    if hits:
        raise ValueError(f"unresolved placeholder(s) in deps: {', '.join(hits)}")


def run(project: Path, targets, deps):
    """Check the deps, merge them into the project apm.yml, and write the file."""
    check_resolved(deps)
    path = project / "apm.yml"
    manifest = merge(load(path), targets, deps)
    with path.open("w") as f:
        yaml.dump(manifest, f)
    return path


def self_check():
    """Run the merge rules against a temporary manifest. Fails on any regression."""
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        proj = Path(d)
        dep_a = {
            "name": "a",
            "registry": False,
            "transport": "http",
            "url": "https://x/mcp",
        }
        # fresh create
        run(proj, ["claude"], [dep_a])
        m = load(proj / "apm.yml")
        assert m["targets"] == ["claude"], m["targets"]
        assert m["dependencies"]["mcp"][0]["name"] == "a"
        # add second target + second server; existing target kept
        dep_b = {
            "name": "b",
            "registry": False,
            "transport": "stdio",
            "command": "uvx",
            "args": ["b"],
        }
        run(proj, ["cursor"], [dep_b])
        m = load(proj / "apm.yml")
        assert m["targets"] == ["claude", "cursor"], m["targets"]
        assert {x["name"] for x in m["dependencies"]["mcp"]} == {"a", "b"}
        # re-run same server = replace, not duplicate (idempotent)
        run(proj, ["claude"], [{**dep_a, "url": "https://y/mcp"}])
        m = load(proj / "apm.yml")
        names = [x["name"] for x in m["dependencies"]["mcp"]]
        assert names.count("a") == 1, names
        assert m["dependencies"]["mcp"][names.index("a")]["url"] == "https://y/mcp"
        # unresolved placeholder is refused
        try:
            run(proj, ["claude"], [{"name": "c", "url": "{{MISSING_URL}}"}])
        except ValueError as e:
            assert "MISSING_URL" in str(e), e
        else:
            raise AssertionError("expected unresolved-placeholder ValueError")
        # a dup name within a single batch collapses to one entry
        run(
            proj,
            ["claude"],
            [{"name": "d", "url": "https://1"}, {"name": "d", "url": "https://2"}],
        )
        m = load(proj / "apm.yml")
        dnames = [x["name"] for x in m["dependencies"]["mcp"]]
        assert dnames.count("d") == 1, dnames
    print("self-check: OK")


def main():
    """Parse the command line, then run the merge or the self-check."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", type=Path)
    ap.add_argument("--targets", default="")
    ap.add_argument("--deps-json", default="")
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        self_check()
        return
    if not a.project or not a.deps_json:
        ap.error("--project and --deps-json are required")
    targets = [t.strip() for t in a.targets.split(",") if t.strip()]
    try:
        deps = json.loads(a.deps_json)
        path = run(a.project, targets, deps)
    except (ValueError, OSError) as e:
        sys.exit(f"merge_apm_mcp: {e}")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
