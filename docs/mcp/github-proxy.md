# Built-in GitHub proxy (Claude Code on the web)

Claude Code on the web has native GitHub access, so you do **not** need to add a GitHub MCP server or a personal access token for normal work. A cloud session ships a full built-in GitHub MCP server (tools prefixed `mcp__github__`), and all git and API traffic is routed through a proxy that holds the real credential outside the sandbox. This page documents what that gives you.

## What it is

All GitHub operations go through a dedicated proxy service that transparently handles git interactions. Inside the sandbox the git client authenticates with a custom-built scoped credential; the proxy verifies it and translates it to your actual GitHub token, which never enters the container. The proxy:

- Manages GitHub authentication securely (scoped credential in the sandbox, real token stays with the proxy).
- Restricts `git push` to the current working branch for safety.
- Enables cloning, fetching, and PR operations while keeping security boundaries.
- Limits GitHub API and release-asset requests to repositories attached to the session.

## Authentication

Two options, either one works. Either grants a cloud session access to any repository the connecting GitHub account can see:

| Method           | How                                                                                        | Notes                                                                            |
|------------------|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| **GitHub App**   | Authorize the Claude GitHub App during web onboarding                                      | Also enables PR webhooks for Auto-fix. It is not a session-level access control. |
| **`/web-setup`** | Run `/web-setup` in your terminal to sync your local `gh` CLI token to your Claude account | Uses your existing `gh` auth.                                                    |

## Git operations

Standard git works against the attached repositories through the proxy:

- **Clone** the session's repositories.
- **Fetch** from them.
- **Push** — restricted to the current working branch only.

## Built-in GitHub MCP tools

The built-in server is GitHub's own MCP server, so it goes well beyond simple reads. All tools are prefixed `mcp__github__`. Confirmed by inspecting a live web session:

**Repositories & files**
- `create_repository`, `fork_repository`, `search_repositories`
- `get_file_contents`, `create_or_update_file`, `delete_file`, `push_files`
- `create_branch`, `list_branches`
- `list_tags`, `get_tag`, `list_commits`, `get_commit`, `search_commits`, `search_code`

**Pull requests**
- `create_pull_request`, `update_pull_request`, `list_pull_requests`, `search_pull_requests`, `pull_request_read`
- `update_pull_request_branch`
- `merge_pull_request`, `enable_pr_auto_merge`, `disable_pr_auto_merge`
- `pull_request_review_write`, `add_comment_to_pending_review`, `add_reply_to_pull_request_comment`
- `resolve_review_thread`, `unresolve_review_thread`, `request_copilot_review`
- `subscribe_pr_activity`, `unsubscribe_pr_activity`

**Issues**
- `issue_read`, `issue_write` (create and update), `list_issues`, `search_issues`
- `add_issue_comment`, `sub_issue_write`
- `list_issue_types`, `list_issue_fields`, `get_label`

**Actions / CI**
- `actions_list`, `actions_get`, `actions_run_trigger`
- `get_check_run`, `get_job_logs`

**Releases** (read-only)
- `list_releases`, `get_latest_release`, `get_release_by_tag`

**Users, teams & org**
- `get_me`, `search_users`
- `get_teams`, `get_team_members`, `list_repository_collaborators`

**Security**
- `run_secret_scanning`

### Usage notes

- Tools are **deferred** in a session: the names are known but schemas load on demand. Load a schema with `ToolSearch` (e.g. `select:mcp__github__get_me`) before calling.
- The server's own guidance: call `get_me` first to establish permissions and context, use `list_*` for broad retrieval and `search_*` for targeted queries, and prefer `minimal_output` plus pagination to keep results small.
- Writes succeed only within the permissions the proxy credential (GitHub App or synced `gh` token) actually holds for the attached repositories.

## Operations still not covered

The built-in set has no tool for a few things. These need the `gh` CLI (not pre-installed) or a direct API call, both requiring a token you supply yourself:

- **Creating or editing releases and uploading release assets** — the release tools above are read-only.
- **Repo administration** the tools don't expose (settings, webhooks, deletion, etc.).

To cover those: add `apt update && apt install -y gh` to your setup script and set a `GH_TOKEN` environment variable to a PAT. `gh` reads `GH_TOKEN` automatically (no `gh auth login`), and `api.github.com` is already in the default allowed domains.

Do **not** add the GitHub Copilot MCP server (`https://api.githubcopilot.com/mcp`) to `.mcp.json` on the web. It is the same GitHub MCP server that already ships built-in, so a manual copy with a PAT is redundant.

## Sources

- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) (GitHub proxy, GitHub authentication options, working with issues and pull requests)
- Tool inventory confirmed by inspecting a live Claude Code web session (2026-07-15).
