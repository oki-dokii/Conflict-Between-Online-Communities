"""Compare signed triangle counts with a fixed-graph sign-shuffle null."""

import argparse
import json
from math import comb
from pathlib import Path
from tempfile import TemporaryDirectory

import igraph as ig
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np

from common import FIGURES, RESULTS, SEED, load_pairs


SHUFFLES = 1000
BALANCED_TYPES = [0, 2]


def make_graph(pairs):
    # Self-links cannot belong to triangles of three distinct subreddits.
    links = pairs.loc[pairs["source"].ne(pairs["target"])].copy()
    links["left"] = links[["source", "target"]].min(axis=1)
    links["right"] = links[["source", "target"]].max(axis=1)
    undirected = links.groupby(["left", "right"], sort=True)[["n_pos", "n_neg"]].sum()

    names = sorted(set(pairs["source"]) | set(pairs["target"]))
    vertex_id = {name: index for index, name in enumerate(names)}
    endpoints = [(vertex_id[left], vertex_id[right]) for left, right in undirected.index]
    graph = ig.Graph(n=len(names), edges=endpoints, directed=False)
    graph.vs["name"] = names
    graph.es["n_pos"] = undirected["n_pos"].tolist()
    graph.es["n_neg"] = undirected["n_neg"].tolist()
    return graph


def triangle_edge_ids(graph):
    # Store each triangle as three edge IDs so every shuffle reuses the topology.
    edge_ids = {edge: index for index, edge in enumerate(graph.get_edgelist())}
    triangles = graph.list_triangles()
    result = np.empty((3, len(triangles)), dtype=np.intp)
    for i, vertices in enumerate(triangles):
        a, b, c = sorted(vertices)
        result[:, i] = (edge_ids[a, b], edge_ids[a, c], edge_ids[b, c])
    return result


def count_types(signs, triangle_edges):
    first, second, third = triangle_edges
    totals = signs[first] + signs[second] + signs[third]
    return np.bincount(totals, minlength=4)


def simulate(signs, triangle_edges, rng):
    observed = count_types(signs, triangle_edges)
    null = np.empty((SHUFFLES, 4), dtype=np.int64)
    for draw in range(SHUFFLES):
        null[draw] = count_types(rng.permutation(signs), triangle_edges)

    n_triangles = int(observed.sum())
    n_negative = int(signs.sum())
    p_neg = n_negative / len(signs) if len(signs) else None
    means = null.mean(axis=0)
    stds = null.std(axis=0, ddof=1)
    # This probability-only check assumes independent signs on a triangle.
    independent = [None] * 4
    if p_neg is not None:
        independent = [
            n_triangles * comb(3, k) * p_neg**k * (1 - p_neg)**(3 - k)
            for k in range(4)
        ]
    by_type = [
        {
            "negative_edges": k,
            "observed": int(observed[k]),
            "null_mean": float(means[k]),
            "null_std": float(stds[k]),
            "z_score": float((observed[k] - means[k]) / stds[k]) if stds[k] else None,
            "independent_expected": independent[k],
        }
        for k in range(4)
    ]

    balanced_count = int(observed[BALANCED_TYPES].sum())
    balanced_fraction = balanced_count / n_triangles if n_triangles else None
    null_balanced = null[:, BALANCED_TYPES].sum(axis=1)
    null_mean = float(null_balanced.mean() / n_triangles) if n_triangles else None
    null_std = float(null_balanced.std(ddof=1) / n_triangles) if n_triangles else None
    return {
        "negative_edges": n_negative,
        "p_neg": p_neg,
        "types": by_type,
        "balanced_count": balanced_count,
        "balanced_fraction": balanced_fraction,
        "null_balanced_fraction_mean": null_mean,
        "null_balanced_fraction_std": null_std,
    }


def plot_counts(results, output):
    fig, axes = plt.subplots(1, 2, figsize=(10.4, 4.4), sharey=True, layout="constrained")
    x = np.arange(4)
    width = 0.36
    for ax, (label, stats) in zip(axes, results.items()):
        types = stats["types"]
        ax.bar(x - width / 2, [row["observed"] for row in types], width,
               label="Observed", color="#35629A", zorder=3)
        ax.bar(x + width / 2, [row["null_mean"] for row in types], width,
               yerr=[row["null_std"] for row in types], capsize=3,
               label="Shuffle mean ± 1 SD", color="#D9853B", zorder=3)
        ax.set(title=label, xlabel="Negative edges per triangle", xticks=x)
        ax.grid(axis="y", alpha=0.2, zorder=0)
        ax.spines[["top", "right"]].set_visible(False)
    axes[0].set_ylabel("Triangles")
    axes[0].legend(frameon=False)
    fig.savefig(output, dpi=200)
    plt.close(fig)


def format_number(value, spec):
    return "undefined" if value is None else format(value, spec)


def explain(label, stats):
    p_neg = format_number(stats["p_neg"], ".2%")
    print(f"\n{label}: {stats['negative_edges']:,} negative edges ({p_neg})")
    for row in stats["types"]:
        k = row["negative_edges"]
        observed, mean, std = row["observed"], row["null_mean"], row["null_std"]
        z, expected = row["z_score"], row["independent_expected"]
        parity = "balanced" if k in BALANCED_TYPES else "unbalanced"
        print(f"  {k} negatives ({parity}): observed {observed:,}, "
              f"shuffle mean {mean:,.2f}, SD {std:,.2f}, "
              f"z {format_number(z, '+.2f')}, "
              f"independent-sign expectation {format_number(expected, ',.2f')}")
        if z is not None:
            direction = "above" if z > 0 else "below"
            comparison = f"{abs(z):.2f} shuffle SDs {direction} the mean" if z else "at the shuffle mean"
            print(f"    This triangle type is {comparison}.")
        else:
            print("    The shuffle count has zero variance, so a z-score is undefined.")

    observed = stats["balanced_fraction"]
    mean = stats["null_balanced_fraction_mean"]
    std = stats["null_balanced_fraction_std"]
    if observed is None:
        print("There are no triangles, so this graph cannot test structural balance.")
        return
    print(f"Balanced triangles: {stats['balanced_count']:,} ({observed:.2%}) "
          f"versus shuffle mean {mean:.2%} (SD {std:.2%}).")
    if std == 0:
        print("The shuffle gives a constant balanced fraction. This comparison has no null variation.")
    if np.isclose(observed, mean, rtol=0, atol=1e-12):
        print("The observed balanced fraction matches the shuffle mean.")
    elif observed > mean:
        print("Even-sign triangles occur more often than the shuffle mean, in the direction "
              "predicted by structural balance.")
    else:
        print("Even-sign triangles occur less often than the shuffle mean, opposite to "
              "the direction predicted by structural balance.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        pairs = load_pairs(columns=["source", "target", "n_pos", "n_neg"])
    except FileNotFoundError as error:
        parser.exit(1, f"Run src/01_build.py first: {error}\n")

    graph = make_graph(pairs)
    triangles = triangle_edge_ids(graph)
    n_neg = np.asarray(graph.es["n_neg"], dtype=np.int64)
    n_pos = np.asarray(graph.es["n_pos"], dtype=np.int64)
    rules = {
        "Any negative link": n_neg > 0,
        "Majority negative": n_neg > n_pos,
    }
    results = {
        label: simulate(negative.astype(np.int8), triangles, np.random.default_rng(SEED))
        for label, negative in rules.items()
    }
    numbers = {
        "nodes": graph.vcount(),
        "undirected_edges": graph.ecount(),
        "triangles": triangles.shape[1],
        "excluded_self_loop_pairs": int(pairs["source"].eq(pairs["target"]).sum()),
        "majority_ties_labeled_nonnegative": int((n_pos == n_neg).sum()),
        "shuffles_per_rule": SHUFFLES,
        "any_negative": results["Any negative link"],
        "majority_negative": results["Majority negative"],
    }

    FIGURES.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    key_file = RESULTS / "key_numbers.json"
    all_numbers = json.loads(key_file.read_text(encoding="utf-8")) if key_file.exists() else {}
    all_numbers["balance"] = numbers
    plot_counts(results, FIGURES / "structural_balance.png")
    with TemporaryDirectory(prefix=".balance-", dir=RESULTS) as work:
        summary = Path(work) / key_file.name
        summary.write_text(json.dumps(all_numbers, separators=(",", ":"), allow_nan=False) + "\n",
                           encoding="utf-8")
        summary.replace(key_file)

    print(f"{graph.vcount():,} nodes, {graph.ecount():,} undirected edges, "
          f"{triangles.shape[1]:,} triangles, {SHUFFLES:,} shuffles per rule.")
    print(f"Excluded {numbers['excluded_self_loop_pairs']:,} self-loop pairs. "
          f"Majority rule assigns {numbers['majority_ties_labeled_nonnegative']:,} ties "
          "to the nonnegative sign.")
    for label, stats in results.items():
        explain(label, stats)
    print("\nThe sign shuffle keeps the graph and the overall number of negative edges fixed. "
          "The probability-only expectation assumes independent signs. "
          "The comparison measures triangle patterns in classifier labels. "
          "A departure can also reflect where negative labels cluster around particular nodes.")


if __name__ == "__main__":
    main()
