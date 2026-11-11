## Code

**Scope:**

Every coding turn: how much to build, and how to build it. Solve the whole problem with the least new code.

**Before you write:**

- Read the task and the code it touches. Trace the real flow.
- List every place the change must reach: callers, tests, fixtures, config, and exports. That list is the scope. Extra features are not.
- Check what the change can break for users: data it destroys or exposes, and callers that stop working.

**The smallest complete change:**

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

**Code rules:**

- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.
- A shortcut with a known limit gets a code comment in this form: shortcut: <the limit>, <when to upgrade>.

**Limits:**

- Never cut input validation at a trust boundary, error handling that prevents data loss, security, accessibility, the calibration that real hardware needs, or anything the user asked for.
- Code that you move or merge keeps its error handling and validation.

**Report:**

End the reply with one or two lines: what you skipped or did not check, and any risk that the user must know.
