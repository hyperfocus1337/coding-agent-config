#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { CliPrettify } from "markdown-table-prettify";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path ?? "";

if (!filePath || !/\.(md|markdown)$/i.test(filePath)) {
  process.exit(0);
}

try {
  const original = readFileSync(filePath, "utf8");
  const prettified = CliPrettify.prettify(original);
  if (prettified !== original) {
    writeFileSync(filePath, prettified, "utf8");
  }
} catch {
  // Silent fail - never block Claude on a formatting issue
}

process.exit(0);
