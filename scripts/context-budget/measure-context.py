"""Measure what this machine's Claude Code config costs at session start.

Walks ~/.claude and every installed plugin, reconstructs the skill, command and
agent listings Claude actually receives, and reports characters plus a rough
token estimate (chars / 4) per source.

Gating rules, derived by diffing on-disk files against a real session's listing:
  * a plugin manifest's `skills` array, when present, gates which on-disk
    SKILL.md files register at all
  * `disable-model-invocation: true` keeps an entry out of the model-facing
    listing (it stays reachable as an explicit slash command)
  * an entry with no `description` never reaches the listing
  * skills and commands share ONE listing block; agents get their own

Not covered: Claude Code's built-in skills (dataviz, claude-api, ...) and
SessionStart hook injections, which are not on disk in a parseable form.

Usage: python3 scripts/context-budget/measure-context.py
"""

import json
import re
from pathlib import Path

HOME = Path.home() / ".claude"
KINDS = ("skills", "commands", "agents")


def frontmatter(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    out: dict[str, str] = {}
    key = None
    for line in text[3:end].splitlines():
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if match:
            key = match.group(1)
            out[key] = match.group(2).strip().strip("'\"")
        elif key and line.startswith((" ", "\t")):
            out[key] += " " + line.strip().strip("'\"")
    return out


def hidden(fm: dict) -> bool:
    return str(fm.get("disable-model-invocation", "")).lower() == "true" or not fm.get(
        "description"
    )


def collect(root: Path, prefix: str, allow: set[Path] | None) -> dict[str, list]:
    found: dict[str, list] = {k: [] for k in KINDS}

    for path in sorted((root / "skills").rglob("SKILL.md")):
        if allow is not None and path.parent.resolve() not in allow:
            continue
        fm = frontmatter(path)
        if not hidden(fm):
            found["skills"].append(
                (prefix + (fm.get("name") or path.parent.name), fm["description"])
            )

    for kind, pattern in (("commands", "*.md"), ("agents", "*.md")):
        base = root / kind
        for path in sorted(base.rglob(pattern)) if base.is_dir() else []:
            fm = frontmatter(path)
            # agents are listed even when not model-invocable as a skill
            if not fm.get("description") or (kind == "commands" and hidden(fm)):
                continue
            name = fm.get("name") or str(
                path.relative_to(base).with_suffix("")
            ).replace("/", ":")
            found[kind].append((prefix + name, fm["description"]))

    return found


def cost(entries: list) -> int:
    return sum(len(f"- {name}: {desc}") + 1 for name, desc in entries)


def sources() -> list[dict]:
    settings = json.loads((HOME / "settings.json").read_text())
    enabled = {k for k, v in (settings.get("enabledPlugins") or {}).items() if v}
    installed = json.loads((HOME / "plugins" / "installed_plugins.json").read_text())[
        "plugins"
    ]

    rows = [{"label": "~/.claude (user-level)", "on": True, **collect(HOME, "", None)}]
    for key, records in installed.items():
        root = Path(records[0]["installPath"])
        allow = None
        manifest = root / ".claude-plugin" / "plugin.json"
        if manifest.is_file():
            declared = json.loads(manifest.read_text()).get("skills")
            if declared:
                allow = {(root / s).resolve() for s in declared}
        rows.append(
            {
                "label": key,
                "on": key in enabled,
                **collect(root, key.split("@")[0] + ":", allow),
            }
        )

    dead = enabled - set(installed)
    for key in sorted(dead):
        print(f"warning: {key} is enabled in settings.json but not installed")
    return rows


def report(rows: list[dict], on: bool) -> None:
    print(
        f"\n===== {'ENABLED (loaded every session)' if on else 'DISABLED (on disk only)'} ====="
    )
    print(
        f"{'source':52} {'sk':>3} {'skch':>6} {'cmd':>4} {'cmdch':>6} {'ag':>3} {'agch':>6}"
    )
    total = {k: [0, 0] for k in KINDS}
    for row in sorted(rows, key=lambda r: -sum(cost(r[k]) for k in KINDS)):
        if row["on"] != on or not any(row[k] for k in KINDS):
            continue
        for kind, acc in total.items():
            acc[0] += len(row[kind])
            acc[1] += cost(row[kind])
        print(
            f"{row['label']:52} {len(row['skills']):3} {cost(row['skills']):6} "
            f"{len(row['commands']):4} {cost(row['commands']):6} "
            f"{len(row['agents']):3} {cost(row['agents']):6}"
        )
    print(
        f"{'TOTAL':52} {total['skills'][0]:3} {total['skills'][1]:6} "
        f"{total['commands'][0]:4} {total['commands'][1]:6} "
        f"{total['agents'][0]:3} {total['agents'][1]:6}"
    )
    listing = total["skills"][1] + total["commands"][1]
    entries = total["skills"][0] + total["commands"][0]
    print(
        f"skill+command listing: {entries} entries, {listing} chars (~{listing // 4} tokens)"
    )
    grand = listing + total["agents"][1]
    print(f"all listings: {grand} chars (~{grand // 4} tokens)")


def heaviest(rows: list[dict], limit: int = 15) -> None:
    print(f"\n===== {limit} heaviest enabled breadcrumbs =====")
    items = [
        (len(f"- {n}: {d}"), n, r["label"])
        for r in rows
        if r["on"]
        for k in ("skills", "commands")
        for n, d in r[k]
    ]
    for chars, name, label in sorted(items, reverse=True)[:limit]:
        print(f"{chars:6} {name:48} {label}")


def demo() -> None:
    """Self-check for the gating rules, which are the only non-trivial logic here."""
    assert hidden({"description": "x", "disable-model-invocation": "true"})
    assert hidden({"name": "no-desc"})
    assert not hidden({"description": "x"})
    assert cost([("a", "b")]) == len("- a: b") + 1
    print("demo ok")


if __name__ == "__main__":
    rows = sources()
    report(rows, on=True)
    report(rows, on=False)
    heaviest(rows)
