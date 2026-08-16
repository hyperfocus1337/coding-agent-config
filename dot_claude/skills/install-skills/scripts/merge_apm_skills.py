#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["ruamel.yaml>=0.18"]
# ///
"""Merge skill packages into a project apm.yml under dependencies.apm.

Only needed for a skill SUBSET: `apm install owner/repo` takes every skill in
the package and has no CLI flag for picking some, so a subset has to be written
into apm.yml as a `skills:` key. Whole-package installs skip this script.

Idempotent, and dedups by git ref. A re-run with the same ref UNIONS its skills
list rather than replacing it, so adding `neon-postgres` to a project that
already takes `neon` keeps both. This differs from merge_apm_mcp.py, where a
re-declared server replaces the old definition: a server is one config, a
package is a set.

An entry with no `skills` key means the whole package. That is wider than any
subset, so it wins: merging a subset into it changes nothing.

Usage:
  merge_apm_skills.py --project DIR --targets claude,codex --deps-json '<json>'
  merge_apm_skills.py --self-check
"""

import argparse
import json
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
        "description": "Project-scoped agent skills (managed by install-skills).",
        "targets": [],
        "dependencies": {"apm": []},
        "includes": "auto",
        "scripts": {},
    }


def _merge_one(existing, dep):
    """Union the skills subsets of two entries for the same git ref, in place."""
    if existing.get("skills") is None:
        return  # already the whole package
    if dep.get("skills") is None:
        existing.pop("skills")  # widened to the whole package
        return
    for skill in dep["skills"]:
        if skill not in existing["skills"]:
            existing["skills"].append(skill)


def merge(manifest, targets, deps):
    """Add the targets and the skill packages to the manifest, without duplicates."""
    keep = [*(manifest.get("targets") or []), *targets]
    manifest["targets"] = list(dict.fromkeys(keep))  # union, order preserved

    section = manifest.setdefault("dependencies", {})
    if section.get("apm") is None:
        section["apm"] = []
    apm = section["apm"]

    for dep in deps:
        # ponytail: linear scan per dep, fine for the handful a manifest holds.
        # Re-scanning also merges a dup ref inside one batch, with no bookkeeping.
        # isinstance: a hand-edited manifest may hold a bare string entry.
        existing = next(
            (d for d in apm if isinstance(d, dict) and d.get("git") == dep["git"]), None
        )
        if existing is None:
            apm.append(dep)
        else:
            _merge_one(existing, dep)
    return manifest


def check_refs(deps):
    """Refuse a dep without a git ref, or with an empty skills list.

    An empty list is not "no subset": apm would deploy nothing and the install
    would look like it worked. Omit the key to take the whole package.
    """
    for dep in deps:
        if not dep.get("git"):
            raise ValueError(f"dep without a git ref: {dep}")
        if dep.get("skills") == []:
            raise ValueError(
                f"empty skills list for {dep['git']}: omit the key to take the whole package"
            )


def run(project: Path, targets, deps):
    """Check the deps, merge them into the project apm.yml, and write the file."""
    check_refs(deps)
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
        # fresh create with a subset
        run(
            proj, ["claude"], [{"git": "neondatabase/agent-skills", "skills": ["neon"]}]
        )
        m = load(proj / "apm.yml")
        assert m["targets"] == ["claude"], m["targets"]
        assert m["dependencies"]["apm"][0]["skills"] == ["neon"]
        # same ref again = union, not replace, and not a second entry
        run(
            proj,
            ["codex"],
            [{"git": "neondatabase/agent-skills", "skills": ["neon-postgres"]}],
        )
        m = load(proj / "apm.yml")
        assert m["targets"] == ["claude", "codex"], m["targets"]
        assert len(m["dependencies"]["apm"]) == 1, m["dependencies"]["apm"]
        assert m["dependencies"]["apm"][0]["skills"] == ["neon", "neon-postgres"]
        # re-adding an existing skill does not duplicate it
        run(proj, [], [{"git": "neondatabase/agent-skills", "skills": ["neon"]}])
        m = load(proj / "apm.yml")
        assert m["dependencies"]["apm"][0]["skills"] == ["neon", "neon-postgres"]
        # whole package wins over a subset
        run(proj, [], [{"git": "neondatabase/agent-skills"}])
        m = load(proj / "apm.yml")
        assert "skills" not in m["dependencies"]["apm"][0], m["dependencies"]["apm"][0]
        # and a later subset does not narrow it back
        run(proj, [], [{"git": "neondatabase/agent-skills", "skills": ["neon"]}])
        m = load(proj / "apm.yml")
        assert "skills" not in m["dependencies"]["apm"][0]
        # second package appends
        run(proj, [], [{"git": "manaflow-ai/cmux", "skills": ["cmux"]}])
        m = load(proj / "apm.yml")
        assert [x["git"] for x in m["dependencies"]["apm"]] == [
            "neondatabase/agent-skills",
            "manaflow-ai/cmux",
        ]
        # a dup ref within one batch merges into a single entry
        run(
            proj, [], [{"git": "a/b", "skills": ["x"]}, {"git": "a/b", "skills": ["y"]}]
        )
        m = load(proj / "apm.yml")
        refs = [x["git"] for x in m["dependencies"]["apm"]]
        assert refs.count("a/b") == 1, refs
        assert m["dependencies"]["apm"][refs.index("a/b")]["skills"] == ["x", "y"]
        # bad input is refused
        for bad in ([{"skills": ["x"]}], [{"git": "a/b", "skills": []}]):
            try:
                run(proj, [], bad)
            except ValueError:
                pass
            else:
                raise AssertionError(f"expected ValueError for {bad}")
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
        sys.exit(f"merge_apm_skills: {e}")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
