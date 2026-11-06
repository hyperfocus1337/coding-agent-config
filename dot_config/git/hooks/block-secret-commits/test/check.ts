/**
 * End-to-end check for ../main.ts: builds throwaway repos and runs real
 * commits, with the hook command from dot_config/git/config set through
 * GIT_CONFIG_* variables. HOME is a temporary folder that links to this hook
 * folder, so the check runs this source and not the deployed copy. Checks
 * whether the commit blocks, and the message. Most cases need betterleaks
 * and are skipped without it. The cases without betterleaks always run,
 * because those must block with no tools.
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
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(here, "../../../..");
const tmp = mkdtempSync(join(tmpdir(), "block-secret-commits-test-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
mkdirSync(join(tmp, "home/.config/git/hooks"), { recursive: true });
symlinkSync(here, join(tmp, "home/.config/git/hooks/block-secret-commits"));

// Git parses the value, as it does for ~/.config/git/config: a `;` outside
// quotes starts a comment.
const command = spawnSync(
  "git",
  [
    "config",
    "--file",
    `${repoRoot}/dot_config/git/config`,
    "--get",
    "hook.block-secret-commits.command",
  ],
  { encoding: "utf8" },
).stdout.trim();
assert.ok(command, "no block-secret-commits command in dot_config/git/config");

const gitEnv = {
  ...process.env,
  HOME: join(tmp, "home"),
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "hook.block-secret-commits.event",
  GIT_CONFIG_VALUE_0: "pre-commit",
  GIT_CONFIG_KEY_1: "hook.block-secret-commits.command",
  GIT_CONFIG_VALUE_1: command,
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
const gitPath = spawnSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
// PATH values: node and no betterleaks; no node; a node that fails. Each has
// this git, which supports config-based hooks.
const noBetterleaks = `${bin("node-only", { node: process.execPath, git: gitPath })}:/usr/bin:/bin`;
const noNode = bin("no-node", { git: gitPath });
const oldNode = bin("old-node", { git: gitPath, node: "#!/bin/sh\nexit 1\n" });

/** Runs `git commit` with the args in the repo, as an agent or you would. */
const commit = (repo: string, args = ["-m", "x"], env: Record<string, string> = {}) =>
  spawnSync("git", ["-C", repo, "commit", "-q", ...args], {
    env: { ...gitEnv, ...env },
    encoding: "utf8",
  });

const blocks = (repo: string, args?: string[], env?: Record<string, string>) =>
  assert.notEqual(commit(repo, args, env).status, 0, "the commit was not blocked");
const allows = (repo: string, args?: string[], env?: Record<string, string>) => {
  const ran = commit(repo, args, env);
  assert.equal(ran.status, 0, ran.stderr);
};

// A NUL byte makes git report a blob as binary, which is the same test
// betterleaks uses to skip it in git mode. The token is a random string
// shaped like a GitHub PAT. It matches no live account.
const TOKEN = "ghp_9f3Kd82jSlqQm4Zx7VbNc1Rt6Yu0Ii5Oo3Pp"; // betterleaks:allow
const secret = `token = "${TOKEN}"\n`;
const secretBin = `BIN\0\0${secret.trimEnd()}\0\0\n`;
const plainBin = "PK\x03\x04\0\0plain\0payload\n";

// --- Cases without betterleaks ---

// Without betterleaks the scan cannot judge, so it blocks every added binary.
await check("binary blocked when betterleaks is unavailable", () =>
  blocks(mkrepo("binnobl", { "archive.dat": plainBin }), undefined, { PATH: noBetterleaks }),
);

// The hook command blocks a commit when main.ts cannot give a verdict.
await check("blocks a commit when node is missing, and names the problem", () => {
  const ran = commit(mkrepo("nonode"), ["--allow-empty", "-m", "x"], { PATH: noNode });
  assert.notEqual(ran.status, 0);
  assert.match(ran.stderr, /needs node 23\.6 or later/);
});
await check("blocks a commit when node fails", () =>
  blocks(mkrepo("oldnode"), ["--allow-empty", "-m", "x"], { PATH: oldNode }),
);

// A failed index read must not be treated as an empty binary list.
await check("an error in the binary scan blocks", () => {
  const repo = mkrepo("broken-diff");
  const brokenGit = bin("broken-git", {
    git: `#!/bin/sh\nif [ "$1" = diff ]; then exit 1; fi\nexec "${gitPath}" "$@"\n`,
  });
  const ran = commit(repo, ["--allow-empty", "-m", "x"], {
    GIT_EXEC_PATH: brokenGit,
  });
  assert.notEqual(ran.status, 0);
  assert.match(ran.stderr, /binary scan of this commit failed/);
});

if (haveBetterleaks) {
  await check("ordinary binary and image allowed", () =>
    allows(
      mkrepo("binplain", {
        "archive.dat": plainBin,
        "pic.gif": "GIF89a\0\0\x01\0\x01\0\x80",
      }),
    ),
  );

  // An innocuous name with a secret inside: only the content of the binary
  // can catch it.
  await check("binary holding a secret blocked, and named", () => {
    const ran = commit(mkrepo("binsecret", { "payload.dat": secretBin }));
    assert.notEqual(ran.status, 0);
    assert.match(ran.stderr, /payload\.dat/);
  });

  // The default config exempts these extensions from every rule, so they
  // block only because the hook scans a copy with a neutral name.
  for (const name of ["logo.png", "notes.pdf"])
    await check(`secret inside ${name} blocked`, () => blocks(mkrepo(name, { [name]: secretBin })));

  // Spaces, quotes, newlines, and revision-like names must survive parsing.
  for (const [i, name] of ['we ird".dat', "line\nbreak.dat", ":blob.dat"].entries())
    await check(`binary with unusual name ${JSON.stringify(name)} blocked`, () => {
      const repo = mkrepo(`binodd-${i}`, { [name]: secretBin });
      const ran = commit(repo);
      assert.notEqual(ran.status, 0);
      assert.ok(ran.stderr.includes(name));
    });

  await check("staged binary secret blocks after a clean worktree replacement", () => {
    const repo = mkrepo("bin-staged-secret", { "payload.dat": secretBin });
    write(repo, { "payload.dat": plainBin });
    blocks(repo);
  });
  await check("clean staged binary allows despite a worktree secret", () => {
    const repo = mkrepo("bin-staged-clean", { "payload.dat": plainBin });
    write(repo, { "payload.dat": secretBin });
    allows(repo);
  });
  for (const [name, content, shouldBlock] of [
    ["removed-secret", secretBin, true],
    ["removed-clean", plainBin, false],
  ] as const)
    await check(`staged binary is scanned after worktree removal: ${name}`, () => {
      const repo = mkrepo(name, { "payload.dat": content });
      rmSync(join(repo, "payload.dat"));
      if (shouldBlock) blocks(repo);
      else allows(repo);
    });

  await check("staged secret blocks after replacement with a worktree symlink", () => {
    const repo = mkrepo("bin-symlink", { "payload.dat": secretBin });
    rmSync(join(repo, "payload.dat"));
    symlinkSync("seed.txt", join(repo, "payload.dat"));
    blocks(repo);
  });

  await check("binary scan uses the temporary index of a path-only commit", () => {
    const repo = mkrepo("bin-only", { "payload.dat": secretBin, "clean.txt": "clean\n" });
    allows(repo, ["--only", "-m", "clean only", "clean.txt"]);
    blocks(repo);
  });

  await check("binary secret blocks on the first commit", () => {
    const repo = join(tmp, "bin-initial");
    mkdirSync(repo);
    git(repo, "init", "-q", ".");
    write(repo, { "payload.dat": secretBin });
    git(repo, "add", "-A");
    blocks(repo);
  });

  await check("binary export failure blocks", () => {
    const repo = mkrepo("bin-export-error", { "payload.dat": plainBin });
    const brokenGit = bin("broken-export", {
      git: `#!/bin/sh\nif [ "$1" = cat-file ] && [ "$2" = blob ]; then exit 1; fi\nexec "${gitPath}" "$@"\n`,
    });
    blocks(repo, undefined, { GIT_EXEC_PATH: brokenGit });
  });

  await check("binary above 100 MiB blocks unless allowlisted", () => {
    const repo = mkrepo("bin-large", { "large.png": plainBin });
    truncateSync(join(repo, "large.png"), 100 * 1024 * 1024 + 1);
    git(repo, "add", "large.png");
    const ran = commit(repo);
    assert.notEqual(ran.status, 0);
    assert.match(ran.stderr, /100 MiB/);
    allows(repo, undefined, { AGENT_ALLOW_SECRETS: "large.png" });
  });

  // --diff-filter=A covers added files only.
  await check("modified tracked binary allowed", () => {
    const repo = mkrepo("binmod", { "logo.dat": plainBin });
    git(repo, "commit", "-qm", "addbin");
    write(repo, { "logo.dat": secretBin });
    git(repo, "add", "-A");
    allows(repo);
  });

  await check("binary exempted by .agent-allow-secrets", () =>
    allows(
      mkrepo("binallow", {
        "payload.dat": secretBin,
        ".agent-allow-secrets": "payload.dat\n",
      }),
    ),
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
  const named = commit(mkrepo("names", placeholders(names)));
  await check("secret file names blocked", () => assert.notEqual(named.status, 0));
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
    ),
  );
  // A repo with its own config keeps it, so the name rule stops applying.
  // betterleaks 1.10 loads neither file by itself; the hook passes it with --config.
  for (const name of [".betterleaks.toml", ".gitleaks.toml"]) {
    await check(`repo ${name} wins over the shipped config`, () =>
      allows(
        mkrepo(`ownconfig${name}`, {
          [name]: "[extend]\nuseDefault = true\n",
          ".env": "placeholder\n",
        }),
      ),
    );
  }

  // --- Content scan ---

  await check("block  staged secret", () => blocks(mkrepo("leak", { "app.py": secret })));
  await check("allow  clean staged content", () =>
    allows(mkrepo("clean", { "app.py": 'def main():\n    print("hello")\n' })),
  );
  await check("allow  empty commit", () => allows(mkrepo("empty"), ["--allow-empty", "-m", "x"]));
  await check("allow  unstaged secret", () => {
    const repo = mkrepo("unstaged", { "app.py": "x = 1\n" });
    write(repo, { "app.py": secret });
    allows(repo);
  });

  // The message must name the finding.
  const message = commit(mkrepo("message", { "app.py": secret }));
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
    assert.match(message.stderr, /\* add the fingerprint above to .*\.betterleaksignore/),
  );
  await check("msg    marks .agent-allow-secrets as the fallback", () => {
    assert.match(message.stderr, /last resort/);
    assert.match(message.stderr, /--git-path info\/exclude/);
  });

  // --- A commit that stages for itself: git gives the hook that index ---

  const dirty = mkrepo("dash-a", { "app.py": 'token = "placeholder"\n' });
  git(dirty, "commit", "-qm", "add app");
  write(dirty, { "app.py": secret });
  for (const args of [
    ["-am", "wip"],
    ["--all", "-m", "wip"],
    ["-m", "wip", "app.py"],
  ])
    await check(`block  git commit ${args.join(" ")} on a tracked edit`, () => blocks(dirty, args));
  // Without -a or the path, the change is not part of the commit.
  await check("allow  git commit --allow-empty -m wip", () =>
    allows(dirty, ["--allow-empty", "-m", "wip"]),
  );

  // --- The allowlist covers the content scan ---

  await check("allow  allowlisted by path", () =>
    allows(
      mkrepo("allowed-path", {
        "config/prod.env": secret,
        ".agent-allow-secrets": "config/prod.env\n",
      }),
    ),
  );
  await check("allow  allowlisted by basename", () =>
    allows(
      mkrepo("allowed-base", {
        "config/prod.env": secret,
        ".agent-allow-secrets": "# comment\n\nprod.env\n",
      }),
    ),
  );
  await check("allow  allowlisted by AGENT_ALLOW_SECRETS", () =>
    allows(mkrepo("allowed-env", { "app.py": secret }), undefined, {
      AGENT_ALLOW_SECRETS: "other.txt:app.py",
    }),
  );
  await check("block  second file not allowlisted", () =>
    blocks(
      mkrepo("allowed-partial", {
        "config/prod.env": secret,
        "app.py": secret,
        ".agent-allow-secrets": "config/prod.env\n",
      }),
    ),
  );
} else console.log("skip: betterleaks missing, so only the cases without it ran");

if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
