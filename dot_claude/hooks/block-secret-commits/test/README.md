# Tests

## test.sh

Smoke test for the `is_dangerous` classifier in `../hook.sh`, the function that decides which filenames count as secrets that must never be committed.

Run it:

```bash
bash test.sh
```

It sources `../hook.sh` and calls `is_dangerous` directly. The hook defines the classifier at the top, then a sourcing guard (`[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0`) stops before the hook body, so sourcing loads only the function without reading stdin or scanning the repo.

Each case asserts one basename: real secrets (`.env`, `id_rsa`, `*.pem`, `credentials.json`, ...) must block, templates and ordinary files (`.env.example`, `main.go`, ...) must pass. Prints `ok`/`FAIL` per case and exits non-zero if any case fails, so it doubles as a CI check. Add a case here whenever you tune the `is_dangerous` list.
