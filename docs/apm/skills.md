# Matt Pocock skills

The [`mattpocock/skills`](https://github.com/mattpocock/skills) bundle in [`apm.yml`](../../apm.yml) is deployed selectively: only the skills listed below are installed, by basename (they resolve across the bundle's category subdirs). Each links to its reference page on aihero.dev.

APM re-resolves the bundle to latest upstream on every install (no lockfile), so this list is the source of truth for which skills are pulled, not a pinned snapshot.

| Skill                         | Reference                                                   |
| ----------------------------- | ----------------------------------------------------------- |
| grilling                      | https://www.aihero.dev/skills-grilling                      |
| grill-me                      | https://www.aihero.dev/skills-grill-me                      |
| grill-with-docs               | https://www.aihero.dev/skills-grill-with-docs               |
| codebase-design               | https://www.aihero.dev/skills-codebase-design               |
| domain-modeling               | https://www.aihero.dev/skills-domain-modeling               |
| wayfinder                     | https://www.aihero.dev/skills-wayfinder                     |
| handoff                       | https://www.aihero.dev/skills-handoff                       |
| improve-codebase-architecture | https://www.aihero.dev/skills-improve-codebase-architecture |
| setup-matt-pocock-skills      | https://www.aihero.dev/skills-setup-matt-pocock-skills      |
| tdd                           | https://www.aihero.dev/skills-tdd                           |
| triage                        | https://www.aihero.dev/skills-triage                        |
| to-tickets                    | https://www.aihero.dev/skills-to-tickets                    |
| to-spec                       | https://www.aihero.dev/skills-to-spec                       |

To add or drop a skill, edit the `skills:` list under `mattpocock/skills` in [`apm.yml`](../../apm.yml) and keep this table in sync.
