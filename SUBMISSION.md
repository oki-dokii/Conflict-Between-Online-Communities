# Submission prep

Every number below is copied from [`results/key_numbers.json`](results/key_numbers.json), the full SNAP run, or from the bundled Atlas export [`app/dist/atlas-data.json.gz`](app/dist/atlas-data.json.gz).

## Data slide

| Quantity | Value | Key in `key_numbers.json` |
| --- | ---: | --- |
| Subreddits in the hyperlink network | 67,180 | `build.subreddit_nodes` |
| Hyperlink records | 858,488 (571,927 title + 286,561 body) | `build.hyperlink_rows`, `build.title_rows`, `build.body_rows` |
| Distinct source posts | 831,014 | `build.distinct_post_ids` |
| Directed subreddit pairs | 339,643 | `build.directed_pairs` |
| Negative-labeled links | 82,210 (9.58%) | `build.negative_links`, `build.negative_link_share` |
| Negative share by file | Title 10.69%, body 7.35% | `data_check.title/body.negative_share` |
| Observed period (UTC) | 31 Dec 2013 to 30 Apr 2017, 41 calendar months | `build.first_timestamp`, `build.last_timestamp`, `time.months` |
| Text properties per link | 86 (every row has exactly 86) | `build.text_features`, `data_check.*.properties_wrong_width_rows` = 0 |
| Subreddit embeddings | 51,278 × 300 dimensions | `build.embedding_rows`, `build.embedding_dimensions` |
| Hyperlink subreddits with an embedding | 31,238 (46.5%) | `build.nodes_with_embeddings` |
| Negative links with both endpoints embedded | 76,797 (93.4%) | `build.negative_links_with_both_embeddings` |

Footnote for the slide: SNAP's summary page says 55,863 subreddits and 858,490 links. We count 67,180 and 858,488 from the files themselves, which matches Netzschleuder. Labels are classifier outputs: −1 is negative, and +1 is neutral or positive.

## Conclusions

1. **A few communities send most of the negativity.** The top 1% of senders (672 subreddits) send 78.75% of negative links, compared with 52.10% of all outgoing links. The top 0.1% (68 subreddits) send 50.3%. The Gini is 0.979 for negative out-links and 0.882 for all out-links, so negativity is more concentrated than general linking activity.
2. **Structural balance is not robust.** Under the any-negative rule, 57.06% of 2,405,288 triangles are balanced, against 70.52% under a global sign shuffle (z = −107.95). Once each sender's negative volume is preserved, the null gives 57.10% (z = −0.55), so the apparent deviation mostly reflects who sends negative links, not triangle structure.
3. **Negativity recurs, though less than the crude figure suggests.** Among directed pairs active before 2016, 19.28% of pairs that were already negative had a later negative link, versus 2.49% of other pairs (crude risk ratio 7.73). Busier pairs have more chances to be labeled negative. Comparing pairs with similar early link volume gives **3.06×** (95% CI 2.92–3.21), and also matching on later volume gives 2.74×. Earlier negativity toward a target's neighbour is associated with later negativity toward the target (21.57% vs 7.14%). These are temporal associations, not causal effects. Quote 3.06× as the headline and 7.73× as the unadjusted figure.
4. **Negative links cross structural boundaries slightly more often.** 61.70% of negative links stay within a Louvain community, against a null of 64.62% (−2.92 pp). Neutral-or-positive links sit at the null (+0.31 pp). Shared-user embedding clusters show no comparable gap (+0.27 pp). The two partitions are almost unrelated (NMI 0.010), so link structure and shared audiences describe different things.
5. **Negative targets have less audience overlap than other targets.** The median rank of the target among 31,237 candidates is 16,306 for negative links, 7,959 for non-negative links and 15,596 for random pairs. Negative targets look about as close in shared users as a random subreddit would.
6. **The labels are mostly driven by sentiment words.** The largest effects are LIWC negative emotion (SMD 1.60), LIWC anger (1.57) and VADER negative (1.44). On 11,173 held-out source subreddits, boosted-model PR-AUC falls from 0.643 to 0.415 when the nine sentiment and emotion features are removed. That is still well above the 9.58% prevalence, so other text features still carry signal.
7. **Network features alone predict negativity weakly.** Degree, shared-user similarity and community agreement give PR-AUC 0.163 at 10.73% prevalence on links from 2016 onward.

Limitations to state: labels come from a classifier, raw post text is unavailable, 53.5% of hyperlink subreddits have no embedding, and all comparisons are observational.

## Live demo

Public Atlas: <https://aim608-conflict-atlas.violet-horse-4096.chatgpt.site>. It opens on r/cooking with real SNAP data.

**Main pick: r/books, March 2016 to August 2016.** This is r/books' busiest six-month stretch of negative links: 2 outgoing, 35 incoming, from 31 distinct counterparts, out of 477 links in either direction. Over the full period the totals are 11 outgoing and 152 incoming.

1. Search **books**, then set the month menus to **2016-03** and **2016-08**.
2. Open **Who links to whom?** and point out the asymmetry: 35 negative links come in from the left, 2 go out on the right.
3. Open **Top Counterparts** and select the top one to show both directions and the all-link denominator.
4. Switch **Colour and group by** between structural communities and embedding clusters to illustrate conclusion 4.
5. Set the range to **All** and brush the timeline to show the negative links spread across all 39 active months.
6. Finish on **Analytics → Structural balance**. Switch from *Global shuffle* to *Within-sender shuffle* under *Any negative link*: the conclusion changes from "fewer balanced than chance (z = −64.4)" to "no clear departure (z = −0.45)" (conclusion 2). Then show the repeat-conflict chart (conclusion 3).

**Backups** (each also checked in the export):
- **r/baseball, May 2015 to October 2015:** 4 outgoing and 29 incoming negative links, 16 counterparts. This covers the 2015 MLB season.
- **r/cooking, set to All:** the site's default view. It's small (6 outgoing, 25 incoming), so it's the safe fallback if time is short.
