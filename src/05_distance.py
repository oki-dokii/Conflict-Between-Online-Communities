"""Compare subreddit embedding similarity across hyperlink signs and random pairs."""

import argparse
from itertools import combinations

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import ks_2samp, rankdata

from common import save_numbers, FIGURES, PROCESSED, RESULTS, SEED, load_edges, load_embeddings, load_pairs


RANDOM_PAIRS = 100_000
COSINE_CHUNK = 20_000
DEGREE_BOUNDS = [10, 100, 1000]
DEGREE_LABELS = ["0–9", "10–99", "100–999", "1000+"]
GROUPS = {
    "negative": ("Negative", "#B54521"),
    "neutral_or_positive": ("Neutral or positive", "#35629A"),
    "random": ("Uniform random pairs", "#565656"),
}


def node_degree(pairs):
    # Count distinct neighbors in either direction across the full hyperlink network.
    distinct = pairs.loc[pairs["source"].ne(pairs["target"]), ["source", "target"]]
    reversed_pairs = distinct.rename(columns={"source": "target", "target": "source"})
    return pd.concat([distinct, reversed_pairs]).drop_duplicates().groupby("source").size()


def cosines(unit_vectors, source, target):
    similarities = np.empty(len(source), dtype=np.float64)
    for start in range(0, len(source), COSINE_CHUNK):
        part = slice(start, start + COSINE_CHUNK)
        similarities[part] = np.einsum(
            "ij,ij->i", unit_vectors[source[part]], unit_vectors[target[part]]
        )
    return np.clip(similarities, -1.0, 1.0)


def edge_similarities(edges, names, unit_vectors, degrees):
    source = names.get_indexer(edges["source"])
    target = names.get_indexer(edges["target"])
    covered = (source >= 0) & (target >= 0)
    eligible = edges.loc[covered].copy()
    source, target = source[covered], target[covered]

    # Cosine is symmetric, so reciprocal links can also share a dot product.
    low, high = np.minimum(source, target), np.maximum(source, target)
    unique_keys, inverse = np.unique(low * len(names) + high, return_inverse=True)
    similarities = cosines(unit_vectors, unique_keys // len(names), unique_keys % len(names))
    eligible["cosine_similarity"] = np.where(source == target, 1.0, similarities[inverse])
    eligible["source_degree"] = degrees[source]
    return eligible


def random_similarities(unit_vectors, degrees):
    n = len(unit_vectors)
    if n < 2:
        return pd.DataFrame({"cosine_similarity": np.array([], dtype=float),
                             "source_degree": np.array([], dtype=int), "source_index": [], "target_index": []})
    rng = np.random.default_rng(SEED)
    source = rng.integers(n, size=RANDOM_PAIRS)
    target = rng.integers(n - 1, size=RANDOM_PAIRS)
    # Each target is uniform over all nodes other than its sampled source.
    target += target >= source
    return pd.DataFrame({
        "cosine_similarity": cosines(unit_vectors, source, target),
        "source_degree": degrees[source], "source_index": source, "target_index": target,
    })


def neighbour_ranks(unit, sources, targets):
    """Rank among all other covered nodes by descending cosine, averaging exact ties."""
    ranks = np.full(len(sources), np.nan)
    order = np.argsort(sources, kind="stable")
    unique, starts = np.unique(sources[order], return_index=True)
    ends = np.r_[starts[1:], len(order)]
    for first in range(0, len(unique), 32):
        ids = unique[first:first + 32]
        scores = unit[ids] @ unit.T
        scores[np.arange(len(ids)), ids] = -np.inf
        for row, node in enumerate(ids):
            idx = order[starts[first + row]:ends[first + row]]
            idx = idx[targets[idx] != node]
            ranks[idx] = rankdata(-scores[row], method="average")[targets[idx]]
    return ranks


def group_values(edges, baseline):
    scores = edges["cosine_similarity"]
    return {
        "negative": scores.loc[edges["link_sentiment"].eq(-1)].to_numpy(),
        "neutral_or_positive": scores.loc[edges["link_sentiment"].eq(1)].to_numpy(),
        "random": baseline["cosine_similarity"].to_numpy(),
    }


def compare(groups):
    summaries = {}
    for name, values in groups.items():
        n = len(values)
        summaries[name] = {
            "n": n,
            "mean": float(values.mean()) if n else None,
            "median": float(np.median(values)) if n else None,
            "std": float(values.std(ddof=1)) if n > 1 else None,
        }
    comparisons = {}
    for left, right in combinations(groups, 2):
        a, b = summaries[left], summaries[right]
        statistic = None
        difference = None
        effect = None
        if a["n"] and b["n"]:
            # Report only the empirical CDF distance, since links share nodes.
            statistic = float(ks_2samp(groups[left], groups[right], method="asymp").statistic)
            difference = a["mean"] - b["mean"]
        if a["n"] > 1 and b["n"] > 1:
            pooled = np.sqrt(
                ((a["n"] - 1) * a["std"]**2 + (b["n"] - 1) * b["std"]**2)
                / (a["n"] + b["n"] - 2)
            )
            if pooled > 0:
                effect = float(difference / pooled)
        comparisons[f"{left}_vs_{right}"] = {
            "ks_statistic": statistic, "cohens_d": effect, "mean_difference": difference,
        }
    return {"groups": summaries, "comparisons": comparisons}


def analyze(edges, random_pairs):
    results = {"overall": compare(group_values(edges, random_pairs)), "degree_bins": {}}
    edge_bins = np.digitize(edges["source_degree"], DEGREE_BOUNDS)
    random_bins = np.digitize(random_pairs["source_degree"], DEGREE_BOUNDS)
    for index, label in enumerate(DEGREE_LABELS):
        values = group_values(edges.loc[edge_bins == index], random_pairs.loc[random_bins == index])
        results["degree_bins"][label] = compare(values)
    return results


def plot_densities(all_groups, pair_groups, output):
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.6), sharex=True, sharey=True,
                             layout="constrained")
    bins = np.linspace(-1, 1, 81)
    for ax, title, groups in zip(axes, ("All hyperlink rows", "One row per directed pair"),
                                 (all_groups, pair_groups)):
        for key, (label, color) in GROUPS.items():
            if len(groups[key]):
                ax.hist(groups[key], bins=bins, density=True, histtype="step", linewidth=1.8,
                        label=label, color=color, linestyle="--" if key == "random" else "-")
        ax.set(title=title, xlabel="Cosine similarity", xlim=(-1, 1))
        ax.spines[["top", "right"]].set_visible(False)
        ax.grid(axis="y", alpha=0.2)
        if ax.get_legend_handles_labels()[0]:
            ax.legend(frameon=False)
    axes[0].set_ylabel("Density")
    fig.savefig(output, dpi=200)
    plt.close(fig)


def fmt(value):
    return "undefined" if value is None else f"{value:.4f}"


def print_report(label, result):
    print(f"\n{label}")
    for name, scope in [("Overall", result["overall"]), *result["degree_bins"].items()]:
        print(f"  {name}")
        for key, stats in scope["groups"].items():
            print(f"    {GROUPS[key][0]}: n={stats['n']:,}, mean {fmt(stats['mean'])}, "
                  f"median {fmt(stats['median'])}, SD {fmt(stats['std'])}")
        for key, stats in scope["comparisons"].items():
            left, right = key.split("_vs_")
            print(f"    {GROUPS[left][0]} vs {GROUPS[right][0]}: "
                  f"KS {fmt(stats['ks_statistic'])}, Cohen's d {fmt(stats['cohens_d'])}")


def interpret(all_links, deduplicated):
    comparison = "negative_vs_neutral_or_positive"
    first = all_links["overall"]["comparisons"][comparison]["mean_difference"]
    second = deduplicated["overall"]["comparisons"][comparison]["mean_difference"]
    if first is None or second is None:
        print("The covered links do not provide both sign groups for an overall comparison.")
    else:
        print(f"The negative-minus-neutral-or-positive mean cosine difference is {first:+.4f} "
              f"for all links and {second:+.4f} after counting each directed pair once.")
    print("A higher cosine indicates communities with more similar user participation patterns "
          "in these embeddings, so the contrast concerns audience similarity.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        edges = load_edges(columns=["source", "target", "post_id", "source_file", "timestamp",
                                    "link_sentiment"])
        pairs = load_pairs(columns=["source", "target"])
        embeddings = load_embeddings().sort_index()
    except FileNotFoundError as error:
        parser.exit(1, f"Could not load the build outputs. Run src/01_build.py first. {error}\n")

    vectors = embeddings.to_numpy(dtype=float)
    norms = np.linalg.norm(vectors, axis=1)
    nonzero = norms > 0
    names = embeddings.index[nonzero]
    unit_vectors = vectors[nonzero] / norms[nonzero, None]
    degrees = node_degree(pairs).reindex(names, fill_value=0).to_numpy(dtype=np.int64)
    eligible = edge_similarities(edges, names, unit_vectors, degrees)
    random_pairs = random_similarities(unit_vectors, degrees)
    ranks = neighbour_ranks(unit_vectors,
        np.r_[names.get_indexer(eligible.source), random_pairs.source_index.to_numpy(dtype=int)],
        np.r_[names.get_indexer(eligible.target), random_pairs.target_index.to_numpy(dtype=int)])
    eligible["target_rank"] = ranks[:len(eligible)]
    random_pairs["target_rank"] = ranks[len(eligible):]
    # The earliest link supplies the sign, with ties resolved by build row order.
    deduplicated = eligible.sort_values("timestamp", kind="stable").drop_duplicates(
        ["source", "target"]
    )
    all_links = analyze(eligible, random_pairs)
    pair_links = analyze(deduplicated, random_pairs)
    numbers = {
        "hyperlink_rows": len(edges), "rows_with_cosine": len(eligible),
        "rows_without_cosine": len(edges) - len(eligible),
        "self_links_with_cosine": int(eligible["source"].eq(eligible["target"]).sum()),
        "zero_norm_embeddings": int((~nonzero).sum()), "random_pairs": len(random_pairs),
        "deduplicated_directed_pairs": len(deduplicated),
        "all_links": all_links, "deduplicated_links": pair_links,
    }

    for label, table in (("all_links", eligible), ("deduplicated_links", deduplicated)):
        groups = {key: table.loc[table.link_sentiment.eq(sign), "target_rank"].dropna().to_numpy()
                  for key, sign in (("negative", -1), ("neutral_or_positive", 1))}
        groups["random"] = random_pairs.target_rank.to_numpy()
        numbers[label]["target_rank"] = compare(groups)
        print(label, "median target rank (1 = nearest):",
              {key: stats["median"] for key, stats in numbers[label]["target_rank"]["groups"].items()})
    numbers["other_rank_candidates_per_source"] = max(len(names) - 1, 0)
    FIGURES.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    eligible.to_parquet(PROCESSED / "edge_similarities.parquet", index=False)
    plot_densities(group_values(eligible, random_pairs), group_values(deduplicated, random_pairs),
                   FIGURES / "distance_densities.png")
    save_numbers("distance", numbers)

    print(f"Cosine computed for {len(eligible):,}/{len(edges):,} links, including "
          f"{numbers['self_links_with_cosine']:,} self-links.")
    print(f"Excluded {numbers['zero_norm_embeddings']:,} zero-norm vectors. "
          f"Uniform baseline: {len(random_pairs):,} sampled pairs.")
    print("Degree bins use the source's distinct undirected neighbors.")
    print_report("All covered hyperlink rows", all_links)
    print_report("One row per directed pair, using the earliest link label", pair_links)
    print()
    interpret(all_links, pair_links)


if __name__ == "__main__":
    main()
