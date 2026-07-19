#!/usr/bin/env node

// --- Imports ---
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { CliPrettify } from "markdown-table-prettify";

// --- Read hook input ---
let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

// --- Prettify helper ---
function prettify(filePath) {
  if (!filePath || !/\.(md|markdown)$/i.test(filePath)) return;
  try {
    const original = readFileSync(filePath, "utf8");
    const prettified = CliPrettify.prettify(original);
    if (prettified !== original) {
      writeFileSync(filePath, prettified, "utf8");
    }
  } catch {
    // Silent fail - never block Claude on a formatting issue
  }
}

// --- Dispatch by tool ---
const filePath = input?.tool_input?.file_path;

if (filePath) {
  // Write/Edit/MultiEdit: format the single file the tool named.
  prettify(filePath);
} else {
  // Bash (sed/perl/etc.) has no file_path, so format any markdown the working
  // tree changed vs HEAD, plus untracked new markdown.
  try {
    const cwd = input?.cwd || process.cwd();
    // stderr: "ignore" so git's "not a git repository" doesn't leak as hook noise.
    const git = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
    const top = execSync("git rev-parse --show-toplevel", { cwd, ...git }).trim();
    const changed = execSync(
      "git diff --name-only --diff-filter=d HEAD; git ls-files --others --exclude-standard",
      { cwd: top, ...git },
    );
    const seen = new Set();
    for (const rel of changed.split("\n").filter(Boolean)) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      prettify(`${top}/${rel}`);
    }
  } catch {
    // Not a git repo or git failed - nothing to do
  }
}

process.exit(0);
