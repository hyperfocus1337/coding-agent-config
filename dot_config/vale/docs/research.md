# Vale research

Tests of rules for the `Writing` style. The [`styles` README](../styles/README.md) lists the rules in use.

## Rules that were left out

`ParagraphWords`, `SectionWords`, and `ListInDisguise` come from a set of 9 rules that was tested on the 234 Markdown files of this repository on 2026-11-01. `ParagraphWords` gave 22 alerts, `SectionWords` 23, and `ListInDisguise` 0. The other 6 rules were left out:

| Rule                                          | Alerts | Why it was left out                                                                                                  |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Sentence over 30 words                        | 193    | Many alerts, and it is about sentences, not about the size of a block. Add it later if long sentences stay a problem |
| List item over 40 words                       | 164    | `ParagraphWords` covers list items                                                                                   |
| More than 3 commas in a sentence              | 321    | Fires on normal series of items                                                                                      |
| More than one `;`, `:`, or dash in a sentence | 35     | Fires on `**Label:** text` and on link titles                                                                        |
| Flesch-Kincaid grade over 12, LIX over 55     | 277    | 158 of the alerts are on paragraphs under 20 words, where the score is not stable                                    |
