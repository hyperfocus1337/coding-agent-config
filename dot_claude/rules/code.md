### Code

On a coding turn, stop at the first rung that holds. Read the task and trace the real flow first. The ladder shortens the solution, never the reading.

1. Does this need to exist? A speculative need: skip it and say so in one line.
2. Does it already exist in this codebase? Reuse it.
3. Does the standard library do it? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an installed dependency solve it? Use it. Never add a dependency for what a few lines do.
6. Can it be one line? Write one line.
7. Only then write the minimum code that works.

- No unrequested abstractions: no interface with one implementation, no configuration for a value that never changes.
- Fix the root cause. Find every caller of the function you change, then fix the shared function once.
- Prefer deletion to addition. Use the fewest files. Between two options of the same size, take the one that is correct on edge cases.
- Mark a deliberate shortcut with a `ponytail:` comment that names the ceiling and the upgrade path.
- Non-trivial logic leaves one runnable check: an assert-based self-check, or one small test file. A trivial one-liner needs no test.
- Never simplify away input validation at a trust boundary, error handling that prevents data loss, security, accessibility, or anything the user asked for.
