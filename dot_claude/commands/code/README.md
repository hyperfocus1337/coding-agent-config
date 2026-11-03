---
disable-model-invocation: true
---

# code slash commands

| Command                             | Description                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| `/code:explain`                     | Explain a code snippet step-by-step.                           |
| `/code:tools:format [check\|apply]` | Check repository formatting, or apply it explicitly.           |
| `/code:tools:lint [check\|fix]`     | Lint repository code and prose, or apply safe automatic fixes. |
| `/code:tools:types`                 | Type-check TypeScript and Python projects without fixes.       |
| `/code:cleanup:dead-code`           | Find and remove dead code, with tests run before and after.    |
| `/code:review:bugs`                 | Review code for bugs.                                          |
| `/code:review:improvements`         | Review code for maintainability.                               |
| `/code:review:performance`          | Review code for performance issues.                            |
| `/code:review:tests`                | Review tests for gaps.                                         |
| `/code:review:types`                | Review code for type safety.                                   |
| `/code:security:supply-chain`       | Review dependencies for supply chain risks.                    |
| `/code:security:vulnerabilities`    | Review code for security issues.                               |

See [tools/README.md](tools/README.md) for tool coverage and execution rules.
