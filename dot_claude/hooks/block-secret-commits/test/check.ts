/**
 * End-to-end check for ../command.ts and ../pi.ts: builds throwaway repos,
 * runs the hook on a Bash payload, and checks the exit code (0 allows, 2
 * blocks) and the message. Most cases need betterleaks and are skipped
 * without it. The binary case without betterleaks always runs, because that
 * scan must block with no tools.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check as verdict, type Io } from "../core.ts";
import extension from "../pi.ts";

const GUARD = fileURLToPath(new URL("../guard.sh", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "block-secret-commits-test-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};
const haveBetterleaks = spawnSync("betterleaks", ["version"]).status === 0;

let failures = 0;
async function check(what: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

function git(repo: string, ...args: string[]) {
  const ran = spawnSync("git", ["-C", repo, ...args], { env: gitEnv });
  if (ran.status !== 0) throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
}

/** Writes each file, with its folders, under the repo. */
function write(repo: string, files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, name)), { recursive: true });
    writeFileSync(join(repo, name), text);
  }
}

/** A repo with one seed commit, then the files staged. */
function mkrepo(name: string, files: Record<string, string> = {}) {
  const repo = join(tmp, name);
  mkdirSync(repo);
  git(repo, "init", "-q", ".");
  write(repo, { "seed.txt": "seed\n" });
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  write(repo, files);
  git(repo, "add", "-A", "-f");
  return repo;
}

/** A folder for PATH that holds the given programs, as links or scripts. */
function bin(name: string, programs: Record<string, string>) {
  const folder = join(tmp, name);
  mkdirSync(folder);
  for (const [program, target] of Object.entries(programs)) {
    const path = join(folder, program);
    if (target.startsWith("#!")) {
      writeFileSync(path, target);
      chmodSync(path, 0o755);
    } else symlinkSync(target, path);
  }
  return folder;
}
const where = (program: string) =>
  spawnSync("/bin/sh", ["-c", `command -v ${program}`], {
    encoding: "utf8",
  }).stdout.trim();
const tools = { cat: where("cat"), grep: where("grep") };
// PATH values: node and no betterleaks; no node; a node that fails.
const noBetterleaks = `${bin("node-only", { node: process.execPath })}:/usr/bin:/bin`;
const noNode = bin("no-node", tools);
const oldNode = bin("old-node", { ...tools, node: "#!/bin/sh\nexit 1\n" });

/** Runs guard.sh on a Bash payload, as Claude Code does. */
function hook(repo: string, command: string, env: Record<string, string> = {}) {
  const ran = spawnSync("/bin/sh", [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, ...env },
    encoding: "utf8",
  });
  return { code: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

const blocks = (repo: string, command: string, env?: Record<string, string>) =>
  assert.equal(hook(repo, command, env).code, 2);
const allows = (repo: string, command: string, env?: Record<string, string>) =>
  assert.equal(hook(repo, command, env).code, 0);

// A NUL byte makes git report a blob as binary, which is the same test
// betterleaks uses to skip it in git mode. The token is a random string
// shaped like a GitHub PAT. It matches no live account.
const TOKEN = "ghp_9f3Kd82jSlqQm4Zx7VbNc1Rt6Yu0Ii5Oo3Pp"; // betterleaks:allow
const secret = `token = "${TOKEN}"\n`;
const secretBin = `BIN\0\0${secret.trimEnd()}\0\0\n`;
const plainBin = "PK\x03\x04\0\0plain\0payload\n";

// --- Binary scan ---

// Without betterleaks the scan cannot judge, so it blocks every added binary.
await check("binary blocked when betterleaks is unavailable", () =>
  blocks(mkrepo("binnobl", { "archive.dat": plainBin }), "git commit -m x", {
    PATH: noBetterleaks,
  }),
);

// guard.sh blocks a commit when command.ts cannot give a verdict, and lets
// other commands pass.
const plain = mkrepo("guard");
for (const [what, PATH] of [
  ["node is missing", noNode],
  ["node fails", oldNode],
]) {
  await check(`guard: blocks a commit when ${what}`, () => {
    const ran = hook(plain, "git commit -m x", { PATH: PATH! });
    assert.equal(ran.code, 2);
    assert.match(ran.stderr, /could not scan this commit/);
  });
  await check(`guard: allows other commands when ${what}`, () => {
    for (const command of [
      "ls -la",
      "git add .git/hooks/commit-msg",
      "git commits",
    ])
      allows(plain, command, { PATH: PATH! });
  });
}

// A fake Io whose every call throws: the binary scan fails closed and the
// content scan fails open.
await check("an error in the binary scan blocks", async () => {
  const broken = new Proxy({} as Io, {
    get: () => () => Promise.reject(new Error("broken")),
  });
  const result = await verdict("git commit -m x", broken, {
    root: "/",
    config: "",
  });
  assert.match(result.block ?? "", /binary scan of this commit failed/);
});

if (haveBetterleaks) {
  await check("ordinary binary and image allowed", () =>
    allows(
      mkrepo("binplain", {
        "archive.dat": plainBin,
        "pic.gif": "GIF89a\0\0\x01\0\x01\0\x80",
      }),
      "git commit -m x",
    ),
  );

  // An innocuous name with a secret inside: only the content of the binary
  // can catch it.
  await check("binary holding a secret blocked, and named", () => {
    const ran = hook(
      mkrepo("binsecret", { "payload.dat": secretBin }),
      "git commit -m x",
    );
    assert.equal(ran.code, 2);
    assert.match(ran.stderr, /payload\.dat/);
  });

  // The default config exempts these extensions from every rule, so they
  // block only because the hook scans a copy with a neutral name.
  await check("secret inside a .png blocked", () =>
    blocks(mkrepo("binpng", { "logo.png": secretBin }), "git commit -m x"),
  );
  await check("secret inside a .pdf blocked", () =>
    blocks(mkrepo("binpdf", { "notes.pdf": secretBin }), "git commit -m x"),
  );

  // A name with a space and a quote must survive the -z parse.
  await check("binary with space and quote blocked", () =>
    blocks(mkrepo("binodd", { 'we ird".dat': secretBin }), "git commit -m x"),
  );

  // --diff-filter=A covers added files only.
  await check("modified tracked binary allowed", () => {
    const repo = mkrepo("binmod", { "logo.dat": plainBin });
    git(repo, "commit", "-qm", "addbin");
    write(repo, { "logo.dat": secretBin });
    git(repo, "add", "-A");
    allows(repo, "git commit -m x");
  });

  await check("binary exempted by .claude-allow-secrets", () =>
    allows(
      mkrepo("binallow", {
        "payload.dat": secretBin,
        ".claude-allow-secrets": "payload.dat\n",
      }),
      "git commit -m x",
    ),
  );
  await check("binary exempted by CLAUDE_ALLOW_SECRETS", () =>
    allows(mkrepo("binenv", { "payload.dat": secretBin }), "git commit -m x", {
      CLAUDE_ALLOW_SECRETS: "payload.dat",
    }),
  );

  // --- Name rule ---

  const names = [
    ".env",
    ".env.local",
    ".envrc",
    ".netrc",
    ".pgpass",
    ".htpasswd",
    ".git-credentials",
    ".dockercfg",
    "prod.env",
    "production.env",
    "local.env",
    "config/prod.env",
    ".s3cfg",
    ".gitrobrc",
    ".bash_history",
    ".zsh_history",
    "credentials.json",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "server.pem",
    "private.key",
    "deploy.keypair",
    "key.p8",
    "key.pkcs8",
    "putty.ppk",
    "cert.pfx",
    "bundle.p12",
    "bundle.pkcs12",
    "store.keystore",
    "my.keyring",
    "app.jks",
    "vault.kdb",
    "login.keychain",
    "vpn.ovpn",
    "cluster.kubeconfig",
    "conn.tblk/config.ovpn",
    "pw.agilekeychain/data.json",
  ];
  const placeholders = (list: string[]) =>
    Object.fromEntries(list.map((name) => [name, "placeholder\n"]));

  // Every secret name, staged together, must be named in one block.
  const named = hook(mkrepo("names", placeholders(names)), "git commit -m x");
  await check("secret file names blocked", () => assert.equal(named.code, 2));
  await check("every secret name appears in the block message", () =>
    assert.deepEqual(
      names.filter((name) => !named.stderr.includes(name)),
      [],
    ),
  );

  await check("templates and ordinary files allowed", () =>
    allows(
      mkrepo(
        "allowed",
        placeholders([
          ".env.example",
          ".env.sample",
          ".env.template",
          ".env.dist",
          "example.env",
          "sample.env",
          "template.env",
          "dist.env",
          "prod.env.example",
          "main.go",
          "README.md",
          "config.yaml",
          "id_rsa.pub",
          "server.crt",
          "notes.gpg",
        ]),
      ),
      "git commit -m x",
    ),
  );
  await check(".env exempted by .claude-allow-secrets", () =>
    allows(
      mkrepo("nameallow", {
        ".env": "placeholder\n",
        ".claude-allow-secrets": ".env\n",
      }),
      "git commit -m x",
    ),
  );
  // A repo with its own config keeps it, so the name rule stops applying.
  await check("repo .betterleaks.toml wins over the shipped config", () =>
    allows(
      mkrepo("ownconfig", {
        ".betterleaks.toml": "[extend]\nuseDefault = true\n",
        ".env": "placeholder\n",
      }),
      "git commit -m x",
    ),
  );

  // --- Content scan ---

  const leak = mkrepo("leak", { "app.py": secret });
  await check("block  staged secret on commit", () =>
    blocks(leak, "git commit -m wip"),
  );
  // The hook acts on `git commit` alone, so a `git add` never reaches a scan.
  await check("allow  staged secret on git add", () =>
    allows(leak, "git add ."),
  );
  // `commit` inside a path is not the git subcommand.
  await check("allow  'commits' in an added path", () =>
    allows(leak, "git add hooks/block-secret-commits/test"),
  );
  await check("allow  'commit-msg' in an added path", () =>
    allows(leak, "git add .git/hooks/commit-msg"),
  );
  await check("block  commit behind a git flag", () =>
    blocks(leak, "git -C . commit -m wip"),
  );
  await check("allow  unrelated command", () => allows(leak, "ls -la"));

  await check("allow  clean staged content", () =>
    allows(
      mkrepo("clean", { "app.py": 'def main():\n    print("hello")\n' }),
      "git commit -m wip",
    ),
  );
  await check("allow  empty stage", () =>
    allows(mkrepo("empty"), "git commit -m wip"),
  );
  await check("allow  unstaged secret", () => {
    const repo = mkrepo("unstaged");
    write(repo, { "app.py": secret });
    allows(repo, "git commit -m wip");
  });
  await check("allow  non-repo (fails open)", () => {
    const folder = join(tmp, "norepo");
    mkdirSync(folder);
    allows(folder, "git commit -m wip");
  });

  // The message must name the finding: a broken report parse still exits 2.
  const message = hook(
    mkrepo("message", { "app.py": secret }),
    "git commit -m wip",
  );
  await check("msg    names rule, file and line", () =>
    assert.match(message.stderr, /github-pat in app\.py:1/),
  );
  await check("msg    gives the .betterleaksignore entry", () =>
    assert.match(message.stderr, /fingerprint: app\.py:github-pat:1/),
  );
  await check("msg    keeps the secret value out", () =>
    assert.doesNotMatch(message.stderr, new RegExp(TOKEN)),
  );
  // The portable fix must be offered, and the local list marked as the last
  // resort. The fingerprint above comes from the finding line, not from the
  // list of fixes.
  await check("msg    offers the portable ignore file", () =>
    assert.match(
      message.stderr,
      /\* add the fingerprint above to .*\.betterleaksignore/,
    ),
  );
  await check("msg    marks .claude-allow-secrets as the fallback", () =>
    assert.match(message.stderr, /last resort/),
  );
  // Codex reports any stdout of a command hook as a failed hook.
  await check("stdout stays empty on block and on allow", () => {
    assert.equal(message.stdout, "");
    assert.equal(hook(leak, "ls -la").stdout, "");
  });

  // --- git commit -a stages tracked changes after the hook runs ---

  const dirty = mkrepo("dash-a", { "app.py": 'token = "placeholder"\n' });
  git(dirty, "commit", "-qm", "add app");
  write(dirty, { "app.py": secret });
  for (const command of [
    "git commit -am wip",
    "git commit -a -m wip",
    "git commit --all -m wip",
    "git commit -a",
  ])
    await check(`block  ${command} on a tracked edit`, () =>
      blocks(dirty, command),
    );
  // Without -a the change is not part of the commit.
  for (const command of [
    "git commit -m wip",
    'git commit -m "add -a flag"',
    "git commit --allow-empty -m wip",
  ])
    await check(`allow  ${command}`, () => allows(dirty, command));

  // --- The allowlist covers the content scan ---

  await check("allow  allowlisted by path", () =>
    allows(
      mkrepo("allowed-path", {
        "config/prod.env": secret,
        ".claude-allow-secrets": "config/prod.env\n",
      }),
      "git commit -m wip",
    ),
  );
  await check("allow  allowlisted by basename", () =>
    allows(
      mkrepo("allowed-base", {
        "config/prod.env": secret,
        ".claude-allow-secrets": "# comment\n\nprod.env\n",
      }),
      "git commit -m wip",
    ),
  );
  await check("allow  allowlisted by CLAUDE_ALLOW_SECRETS", () =>
    allows(mkrepo("allowed-env", { "app.py": secret }), "git commit -m wip", {
      CLAUDE_ALLOW_SECRETS: "other.txt:app.py",
    }),
  );
  await check("block  second file not allowlisted", () =>
    blocks(
      mkrepo("allowed-partial", {
        "config/prod.env": secret,
        "app.py": secret,
        ".claude-allow-secrets": "config/prod.env\n",
      }),
      "git commit -m wip",
    ),
  );

  // --- pi.ts, with a stub pi that keeps the tool_call handler ---

  type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
  let piHandler: Handler | undefined;
  extension({
    on: (name: string, handler: Handler) => {
      if (name === "tool_call") piHandler = handler;
    },
  } as never);
  const ctx = (cwd: string) => ({ cwd, ui: { notify: () => {} } });
  const piCall = (toolName: string, command: string, cwd: string) =>
    piHandler?.({ toolName, input: { command } }, ctx(cwd));
  await check("pi.ts: blocks a staged secret with the message", async () => {
    const result = (await piCall("bash", "git commit -m wip", leak)) as {
      block: boolean;
      reason: string;
    };
    assert.equal(result.block, true);
    assert.match(result.reason, /github-pat in app\.py:1/);
  });
  await check("pi.ts: allows clean content, and other tools", async () => {
    assert.equal(
      await piCall("bash", "git commit -m wip", mkrepo("piclean")),
      undefined,
    );
    assert.equal(await piCall("write", "git commit -m wip", leak), undefined);
  });
} else
  console.log("skip: betterleaks missing, so only the cases without it ran");

if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
