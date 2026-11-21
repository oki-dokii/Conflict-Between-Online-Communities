"""Measure subreddit activity and the concentration of negative link labels."""

import argparse
import json
from pathlib import Path
import random
from tempfile import TemporaryDirectory

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from common import FIGURES, PROCESSED, RESULTS, SEED, load_pairs


MIN_OUT_LINKS = 20
TOP_SHARES = (0.001, 0.01, 0.10)


def make_node_stats(pairs):
    outgoing = pairs.groupby("source")[["n_pos", "n_neg"]].sum()
    incoming = pairs.groupby("target")[["n_pos", "n_neg"]].sum()
    outgoing.columns = ["pos_out", "neg_out"]
    incoming.columns = ["pos_in", "neg_in"]

    # The outer join includes communities seen in only one direction.
    nodes = outgoing.join(incoming, how="outer").fillna(0).astype("int64").sort_index()
    nodes.index.name = "subreddit"
    nodes["total_out"] = nodes["pos_out"] + nodes["neg_out"]
    nodes["total_in"] = nodes["pos_in"] + nodes["neg_in"]
    eligible = nodes["total_out"].ge(MIN_OUT_LINKS)
    nodes["neg_out_rate"] = nodes["neg_out"] / nodes["total_out"].where(eligible)
    nodes["neg_in_rate"] = nodes["neg_in"] / nodes["total_in"].where(
        eligible & nodes["total_in"].gt(0)
    )
    return nodes.reset_index()


def concentration(counts):
    # Sort least to most active. Keep zero-count nodes in the denominator.
    ordered = np.sort(counts.to_numpy(dtype=np.int64))
    n = len(ordered)
    total = int(ordered.sum())
    population = np.arange(n + 1) / n
    cumulative = np.r_[0, np.cumsum(ordered)]
    shares = cumulative / total if total else None
    # The Lorenz points are equally spaced, so trapezoid integration is exact.
    gini = float(1 - (shares[:-1] + shares[1:]).sum() / n) if total else None
    top = {}
    for fraction in TOP_SHARES:
        k = int(np.ceil(fraction * n))
        top[f"{fraction:.1%}"] = {
            "nodes": k,
            "share": float((total - cumulative[n - k]) / total) if total else None,
        }
    return population, shares, {"gini": gini, "total_links": total, "top": top}


def plot_lorenz(metrics, path):
    fig, ax = plt.subplots(figsize=(6.4, 5.3), layout="constrained")
    ax.plot([0, 1], [0, 1], linestyle="--", color="#777777", label="Equal shares")
    for column, label, color in [
        ("total_out", "All outgoing links", "#35629A"),
        ("neg_out", "Negative outgoing links", "#B54521"),
    ]:
        population, shares, stats = metrics[column]
        if shares is not None:
            ax.plot(population, shares, color=color, linewidth=2.3,
                    label=f"{label} (Gini {stats['gini']:.3f})")
        else:
            ax.plot([], [], color=color, label=f"{label} (no links)")
    ax.set(xlim=(0, 1), ylim=(0, 1), title="Concentration of outgoing Reddit links",
           xlabel="Cumulative share of subreddits",
           ylabel="Cumulative share of outgoing links")
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1))
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1))
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(alpha=0.18)
    ax.legend(loc="upper left", frameon=False)
    fig.savefig(path, dpi=200)
    plt.close(fig)


def print_numbers(numbers):
    for key in ("subreddit_nodes", "min_out_links_for_rates", "subreddits_with_out_rate",
                "subreddits_with_in_rate"):
        print(f"{key.replace('_', ' ').capitalize()}: {numbers[key]:,}")
    for metric, label in [("neg_out", "Negative outgoing links"),
                          ("total_out", "All outgoing links"),
                          ("neg_in", "Negative incoming links")]:
        stats = numbers[metric]
        gini = "undefined" if stats["gini"] is None else f"{stats['gini']:.4f}"
        print(f"{label}: {stats['total_links']:,}, Gini {gini}")
        for fraction, entry in stats["top"].items():
            share = "undefined" if entry["share"] is None else f"{entry['share']:.2%}"
            print(f"  Top {fraction} ({entry['nodes']:,} subreddits): {share}")
    correlation = numbers["pearson_neg_out_neg_in"]
    print("Pearson correlation of neg_out and neg_in: "
          + ("undefined" if correlation is None else f"{correlation:.4f}"))

    top_tenth = numbers["neg_out"]["top"]["10.0%"]["share"]
    negative_gini = numbers["neg_out"]["gini"]
    all_gini = numbers["total_out"]["gini"]
    if top_tenth is not None:
        majority = "a majority" if top_tenth > 0.5 else "half or less"
        print(f"The top 10% of subreddits send {majority} of negative links ({top_tenth:.2%}).")
        difference = negative_gini - all_gini
        print(f"Outgoing Gini difference (negative minus all): {difference:+.4f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    random.seed(SEED)
    np.random.seed(SEED)

    try:
        pairs = load_pairs(columns=["source", "target", "n_pos", "n_neg"])
    except FileNotFoundError as error:
        parser.exit(1, f"Run src/01_build.py first: {error}\n")
    if pairs.empty:
        parser.exit(1, "The pair table has no hyperlink records.\n")

    nodes = make_node_stats(pairs)
    metrics = {column: concentration(nodes[column]) for column in ("neg_out", "total_out", "neg_in")}
    # Pearson correlation is undefined when either count has zero variance.
    correlation = None
    if nodes["neg_out"].nunique() > 1 and nodes["neg_in"].nunique() > 1:
        correlation = float(nodes["neg_out"].corr(nodes["neg_in"]))
    numbers = {
        "subreddit_nodes": len(nodes),
        "min_out_links_for_rates": MIN_OUT_LINKS,
        "subreddits_with_out_rate": int(nodes["neg_out_rate"].count()),
        "subreddits_with_in_rate": int(nodes["neg_in_rate"].count()),
        "pearson_neg_out_neg_in": correlation,
        **{column: stats for column, (_, _, stats) in metrics.items()},
    }

    FIGURES.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    key_file = RESULTS / "key_numbers.json"
    key_numbers = json.loads(key_file.read_text(encoding="utf-8")) if key_file.exists() else {}
    key_numbers["node_stats"] = numbers
    nodes.to_parquet(PROCESSED / "node_stats.parquet", index=False)
    plot_lorenz(metrics, FIGURES / "lorenz_out_links.png")
    with TemporaryDirectory(prefix=".node-stats-", dir=RESULTS) as work:
        summary = Path(work) / key_file.name
        summary.write_text(json.dumps(key_numbers, separators=(",", ":"), allow_nan=False) + "\n",
                           encoding="utf-8")
        summary.replace(key_file)
    print_numbers(numbers)


if __name__ == "__main__":
    main()
