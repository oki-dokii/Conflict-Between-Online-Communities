# Network Semantics Project

AIM608 project on signed, directed hyperlinks between Reddit communities.

## Setup

Use Python 3.11. The checker uses the standard library. The project requirements include python-igraph and the analysis libraries, with PyArrow for Parquet.

```sh
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Place the two hyperlink TSVs and the headerless subreddit embeddings CSV in `data/raw/`.

- `soc-redditHyperlinks-title.tsv` and `soc-redditHyperlinks-body.tsv` are on the [SNAP Reddit Hyperlink Network page](https://snap.stanford.edu/data/soc-RedditHyperlinks.html).
- `web-redditEmbeddings-subreddits.csv` is on the [SNAP Reddit User and Subreddit Embeddings page](https://snap.stanford.edu/data/web-RedditEmbeddings.html).

The project keeps scripts in `src/`, Parquet intermediates in `data/processed/`, PNG figures in `figures/`, key numbers in `results/`, and demo code in `app/`.

## `src/00_check_data.py`

```sh
python src/00_check_data.py
```

Use `--title`, `--body`, and `--embeddings` to override the raw file paths.

The script counts link rows and distinct source-or-target subreddits by file and across both files. It divides the count of links labeled `-1` by the total number of link rows. Each distinct post ID found in both files counts once toward the overlap, and all link rows remain in the totals. Subreddit matching ignores case and surrounding whitespace. The script counts the number of comma-separated positions in every properties vector and saves the summary in a single line in `results/key_numbers.json` under `data_check`.

For the feature names and their order, read **Data format → POST_PROPERTIES** on SNAP’s Reddit Hyperlink Network page. Copy the names into `feature_names.txt`, one per line in the published order. [SNAP Reddit Hyperlink Network](https://snap.stanford.edu/data/soc-RedditHyperlinks.html)

Missing files, unexpected headers, malformed rows, or unexpected sentiment labels can stop the checker. A width other than 86 is reported, and a vector of the expected width can still contain a bad value or use a different feature order. The embedding check counts fields and names. Missing embeddings limit later similarity analyses. Negative labels are classifier outputs and can be wrong. The checker reports aggregate counts without printing subreddit names.

## `src/01_build.py`

Fill in all 86 lines of `feature_names.txt` in SNAP's published order before running the build. The names must be distinct and cannot match the edge metadata columns. Blank lines and lines beginning with `#` are ignored.

```sh
python src/01_build.py
```

The build accepts `--title`, `--body`, `--embeddings`, and `--feature-names` to override the input paths. It uses seed 42, prints the counts and date range for the data slide, and updates the `build` entry in `results/key_numbers.json`.

| File in `data/processed/` | Contents and design choices |
| --- | --- |
| `edges.parquet` | One record for each raw post–hyperlink row, with `source`, `target`, `post_id`, `timestamp`, `link_sentiment`, `source_file`, and 86 float64 text features. Title rows precede body rows. The build writes chunks to limit memory use. Repeated post IDs and parallel links remain in the data because a post can contribute multiple link records. Quote the distinct post ID count for posts and the row count for links. |
| `pairs.parquet` | One record per ordered `source`, `target` pair. `n_pos` counts labels of +1, which include neutral links, and `n_neg` counts labels of −1. `n_total` includes both. `first_ts` and `last_ts` bound the observed timestamps across both labels. Each direction gets its own row. |
| `embeddings.parquet` | One row per hyperlink node with an available embedding, with `subreddit` and float64 columns `dim_000` through `dim_299` in source order. Names in all three inputs are stripped and lowercased before matching. Embedding-only subreddits are excluded from this table. |
| `graph.graphml` | Directed python-igraph graph. Vertices include every hyperlink subreddit and carry `name` and `has_embedding`. Each ordered pair becomes one edge with its three counts and two timestamps. Vertex names are sorted for stable IDs. GraphML stores timestamps as ISO 8601 strings and may read integral counts back as floats. |

Self-loops stay in the edge table, pair table, graph, and slide totals because they are observed links. The slide output includes their counts so analyses that require distinct endpoints can explicitly filter them. Nodes with no embedding stay in the graph and all edge counts. Embedding comparisons can use only rows whose two endpoints have vectors. The script reports negative rows missing at least one endpoint vector and the subset missing both.

The build treats timezone-free timestamps as UTC and converts explicit offsets to UTC. Bad dates, invalid signs, malformed feature or embedding vectors, and duplicate normalized embedding names fail the build. A correctly sized vector can still be assigned incorrect names if the feature list is out of order. The script stages the processed files before replacing prior outputs. Run the build to completion before starting downstream scripts.

`src/common.py` provides `load_edges()`, `load_pairs()`, `load_embeddings()`, and `load_graph()`. Use `load_edges(columns=[...])` to read only the needed columns. `load_embeddings()` indexes the vectors by normalized subreddit name.

## `src/02_node_stats.py`

```sh
python src/02_node_stats.py
```

Run after `01_build.py`. The script sums each pair's link counts by sender and receiver and saves one row per subreddit to `data/processed/node_stats.parquet`. Incoming-only and outgoing-only subreddits get zero counts in the opposite direction. Each self-loop contributes once to outgoing and once to incoming counts, and parallel links retain their multiplicity. A +1 label includes neutral links. Classifier errors can affect both link counts and rates.

Both rates are published only for subreddits with at least 20 outgoing links. This outgoing activity cutoff limits the effect of very small sending denominators and defines the same eligibility group for both rates. The incoming rate divides negative incoming links by all incoming links and is also missing when there are no incoming links. Eligible subreddits can still have low incoming volume, so use `total_in` when interpreting those rates.

The concentration analysis uses every hyperlink subreddit, including zero-count nodes, for negative outgoing links, all outgoing links, and negative incoming links. Each metric ranks subreddits separately. The top 0.1%, 1%, and 10% groups round up to a whole subreddit. The Lorenz curves accumulate counts from the lowest-count subreddit upward, and the Gini measures the area between each curve and equality. Pearson correlation uses the paired raw negative outgoing and incoming counts across all nodes.

The script overlays the two outgoing Lorenz curves in `figures/lorenz_out_links.png`. It prints the Ginis, top-group shares, correlation, rate eligibility counts, and whether the top 10% send a majority of negative links. The same numeric results are saved under `node_stats` in `results/key_numbers.json`. A metric with zero total links has undefined concentration, and Pearson correlation is undefined if either count is constant. Rebuild the pair table first if the raw inputs have changed.

## `src/03_balance.py`

```sh
python src/03_balance.py
```

Run after `01_build.py`. The script removes self-loops, combines the link counts of both directions for each pair, and uses python-igraph to enumerate triangles of three distinct subreddits. The main rule marks a pair negative if it has any negative link. The robustness rule marks it negative only if negative links outnumber neutral-or-positive links. Ties receive the nonnegative sign so both rules use the same topology.

A triangle is balanced under this definition when it has zero or two negative edges. For each rule, 1,000 seeded shuffles redistribute the signs among existing edges while keeping the number of negative edges fixed. The script prints the observed triangle counts, shuffle means, sample standard deviations, and z-scores for all four types. It also compares the balanced fraction with the shuffle distribution and reports an independent-sign expectation using the observed negative-edge fraction and the binomial formula.

The chart in `figures/structural_balance.png` shows both rules, with error bars of one shuffle standard deviation. Numbers are saved under `balance` in `results/key_numbers.json`. A graph without triangles has no balanced fraction, and a shuffle count with zero variance has no z-score. The any-negative rule gives more active pairs more chances to receive a negative label. The shuffle preserves topology and overall sign frequency but can change each node's negative degree. Label errors and node-level clustering can therefore affect the comparison.
