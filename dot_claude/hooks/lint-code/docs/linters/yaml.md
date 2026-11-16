# YAML: yamllint and ansible-lint

Each `.yml` or `.yaml` file goes to exactly one of `yamllint --strict` or `ansible-lint -q`. YAML warnings fail the check because `--strict` makes warnings actionable.

## Policy and routing

The nearest project `.yamllint`, `.yamllint.yaml`, or `.yamllint.yml` wins. Ansible files use the nearest `.ansible-lint`, `.ansible-lint.yml`, `.ansible-lint.yaml`, `.config/ansible-lint.yml`, or `.config/ansible-lint.yaml`. Discovery starts in the file's directory and stops at the Git root. Without a project configuration, the bundled configuration applies, not a user-global configuration.

YAML tools run from the selected configuration directory, or the repository root for a fallback, with a relative target path. This makes project-relative exclusions apply. Source-tree commands also support chezmoi's `dot_` configuration filenames.

The bundled yamllint configuration checks syntax, duplicate keys, undeclared aliases, ambiguous boolean values, and lines longer than 100 characters. A key with one unbreakable word as its value, such as a URL, can exceed the limit. It allows empty values and octal numbers and leaves other style to oxfmt. Truthy keys are allowed because GitHub Actions uses `on:`. A project configuration can choose stricter or different rules.

Ansible detection uses directories (`roles/`, `tasks/`, `handlers/`, `playbooks/`, `group_vars/`, `host_vars/`, and `molecule/`) or content markers (`hosts:`, `tasks:`, `roles:`, and `ansible.builtin.<module>:`). Generic names such as `main.yaml`, `requirements.yaml`, and `site.yaml` alone are not evidence. Content detection is a heuristic, not a YAML schema check.

Files below a Helm chart's `templates/` directory are skipped when that chart has a `Chart.yaml`. Those files contain Go templates, not plain YAML. Other directories called `templates/` remain eligible. Project exclusions can skip other generated or templated files.

ansible-lint looks for a yamllint config by itself, also in `~/.config/yamllint/config` and `YAMLLINT_CONFIG_FILE`. The hook passes `--yamllint-file` with the nearest project `.yamllint`, `.yamllint.yaml` or `.yamllint.yml`, else the bundled `.yamllint`, so a file outside the repository cannot change the result. ansible-lint merges that file over its own embedded policy, which already accepts the format of oxfmt: one space before a comment and inside braces, and no `---`. The bundled `.ansible-lint` still skips `yaml[line-length]` and `yaml[indentation]`. A project `.ansible-lint` replaces it, and then the 100-character limit of the bundled `.yamllint` applies.
