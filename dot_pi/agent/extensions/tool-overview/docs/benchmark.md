# Latency benchmark

## Results

A scan on November 12, 2026 measured an estimated **4.70 seconds of added delay per completed tool batch**, with a median of **3.89 seconds**. The summary request blocks the next agent turn; it does not run in the background.

The scan covered 160 JSONL session files under `/home/user/.pi/agent/sessions/`. After excluding the conversation that performed the scan, three sessions contained 79 saved `tool-overview` entries. All 79 batches used `gpt-6.1-sol`.

| Added delay per batch   | Seconds |
| ----------------------- | ------: |
| Mean                    |   4.699 |
| Median                  |   3.888 |
| 90th percentile         |   8.060 |
| 95th percentile         |   9.281 |
| Minimum                 |   2.522 |
| Maximum                 |  11.068 |
| Total across 79 batches | 371.237 |

At the measured mean, a user request with 10 tool batches adds about **47 seconds**. A batch is one assistant response containing tool calls, not each individual tool call or the whole user request.

Of the 79 batches, 56 completed the summary step in less than 5 seconds and 78 in less than 10 seconds. Two entries reported `summary unavailable`; their delays are included. No measured delay exceeded 20 seconds.

### Per-session results

Session names below are the JSONL filename prefixes. All dates and times are UTC.

| Session                    | Batches | Mean delay | Median delay | Total delay |
| -------------------------- | ------: | ---------: | -----------: | ----------: |
| `2026-11-12T10-30-03-397Z` |      14 |    5.776 s |      5.135 s |    80.867 s |
| `2026-11-12T11-08-40-616Z` |      43 |    4.366 s |      3.654 s |   187.750 s |
| `2026-11-12T11-14-18-647Z` |      22 |    4.665 s |      3.996 s |   102.620 s |

The sampled overview entries span `2026-11-12T11:08:23.972Z` through `2026-11-12T11:21:40.024Z`. These sessions were still available to append entries during the scan, so a later scan can return different counts.

## Measurement method

For each custom session entry with `customType: "tool-overview"`:

1. Read the tool-call IDs from `data.ids`.
2. Follow the entry's parent chain to find matching tool-result messages on the same session branch.
3. Select the latest matching tool-result entry timestamp.
4. Subtract that timestamp from the overview entry timestamp.

```text
estimated added delay = overview entry timestamp - last matching tool-result entry timestamp
```

All 79 entries had matching results for every saved tool-call ID. The scan checked for negative gaps and duplicate tool-call IDs within each session. Percentiles use the nearest-rank method.

The overview entry is appended after the summary request finishes. This gap excludes tool execution time but can include other end-of-turn work before the summary request starts. It is an estimate of the added wait at this boundary, not a direct measurement of model request duration or an isolated enabled-versus-disabled benchmark.

The saved `data.elapsed` value and the duration shown in the overview header measure the batch before summarization. **They do not include the summary request delay** and must not be used to measure this overhead.

## Why the delay occurs

In `../index.ts`, the async `turn_end` handler awaits `ctx.modelRegistry.streamSimple(...).result()`. Pi waits for the handler before it continues to the next turn.

At the time of this scan:

- Each completed interactive tool batch made one extra request to the current model.
- The request had a 256-token output limit and a 20-second abort deadline.
- Print, JSON, and RPC modes made no summary requests.
- Failed or invalid summaries still consumed time before the fallback overview was saved.

Across the 79 entries, saved summary usage totaled 44,612 input tokens and 4,845 output tokens, including 2,669 reasoning tokens. The reported total was 49,457 tokens. These extra requests are not included in Pi's native usage totals.

## Limits

This sample covers three sessions on one day and one model. It does not establish latency for other models, providers, network conditions, or evidence sizes. The measurements include small session-persistence and event-handler costs, which were not measured separately.

The scan did not measure rendering overhead, startup time, or latency with the extension disabled. The source code's abort deadline is not a measured guarantee that every provider request returns within exactly 20 seconds.
