# OpenRouter filter links

Links that open [openrouter.ai/models](https://openrouter.ai/models) with the filters already applied, so pricing stays interactive instead of frozen in a table. For the parameters behind these URLs, see [`filter-parameters.md`](filter-parameters.md).

The page applies the filters in the browser, so a `curl` of these URLs returns the unfiltered HTML. Open them in a browser.

## Ready-made links

Pricing filters use dollars per million input tokens, matched against the cheapest endpoint.

| Link                                                                                                                                        | Shows                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [The models in `enabledModels`](https://openrouter.ai/models?fmt=table&model_authors=deepseek,moonshotai&order=pricing-low-to-high)         | DeepSeek and Moonshot, by price         |
| [Open-weight authors](https://openrouter.ai/models?fmt=table&model_authors=deepseek,moonshotai,z-ai,qwen,minimax&order=pricing-low-to-high) | DeepSeek, Moonshot, Z.ai, Qwen, MiniMax |
| [GPT and Claude only](https://openrouter.ai/models?fmt=table&arch=GPT,Claude&order=pricing-high-to-low)                                     | The frontier price ceiling              |
| [Best coding score first](https://openrouter.ai/models?fmt=table&order=coding-high-to-low)                                                  | Ranked by coding index, not price       |
| [Best agentic score first](https://openrouter.ai/models?fmt=table&order=agentic-high-to-low)                                                | Ranked by agentic index                 |
| [Cheap and good at coding](https://openrouter.ai/models?fmt=table&max_price=1&min_coding_index=50&order=pricing-low-to-high)                | Price ceiling plus a quality floor      |
| [Top of the programming category this week](https://openrouter.ai/models?fmt=table&categories=programming&order=top-weekly)                 | Ranked by real token volume             |
| [Free tier](https://openrouter.ai/models?fmt=table&variant=free&order=newest)                                                               | `:free` variants                        |

## Per-model and comparison pages

| Link                                                                                                                                                                 | Shows                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [Flash vs K3 vs Sonnet 5 vs GPT-5.6 Sol](https://openrouter.ai/compare/deepseek/deepseek-v4.1-flash/moonshotai/kimi-k3/anthropic/claude-sonnet-5/openai/gpt-5.6-sol) | Side-by-side price, context, and scores |
| [All DeepSeek models](https://openrouter.ai/deepseek)                                                                                                                | Author page                             |
| [Programming rankings](https://openrouter.ai/rankings/programming)                                                                                                   | Token share by model                    |

The compare path takes any number of models: append `/<author>/<model>` for each one. A model page also has a `/providers` tab with every endpoint and its quantization, and a `/uptime` tab.
