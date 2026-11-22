"""Compare signed triangle counts with a fixed-graph sign-shuffle null."""

import argparse
from math import comb

import igraph as ig
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from numba import njit

from common import save_numbers, FIGURES, RESULTS, SEED, load_pairs


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


@njit
def shuffle_senders(slots, starts, negatives, totals, triangles, draws, seed):
    # Partial Fisher–Yates samples distinct outgoing hyperlink slots for each sender.
    np.random.seed(seed)
    counts = np.empty((2, draws, 4), dtype=np.int64)
    for draw in range(draws):
        assigned = np.zeros(len(totals), dtype=np.int64)
        for group in range(len(negatives)):
            end = starts[group + 1]
            for idx in range(starts[group], starts[group] + negatives[group]):
                pick = np.random.randint(idx, end)
                slots[idx], slots[pick] = slots[pick], slots[idx]
                assigned[slots[idx]] += 1
        for rule in range(2):
            signs = assigned > 0 if rule == 0 else assigned > totals - assigned
            bins = np.zeros(4, dtype=np.int64)
            for a, b, c in triangles.T:
                bins[int(signs[a]) + int(signs[b]) + int(signs[c])] += 1
            counts[rule, draw] = bins
    return counts


def sender_null(pairs, graph, triangles, draws=SHUFFLES):
    links = pairs.loc[pairs.source != pairs.target].sort_values(["source", "target"]).copy()
    links["capacity"] = links.n_pos + links.n_neg
    grouped = links.groupby("source", sort=False)[["capacity", "n_neg"]].sum()
    ids = {name: i for i, name in enumerate(graph.vs["name"])}
    endpoints = list(zip(links.source.map(ids), links.target.map(ids)))
    slots = np.repeat(graph.get_eids(endpoints), links.capacity.to_numpy()).astype(np.int64)
    starts = np.r_[0, grouped.capacity.cumsum()].astype(np.int64)
    totals = np.asarray(graph.es["n_pos"]) + np.asarray(graph.es["n_neg"])
    return shuffle_senders(slots, starts, grouped.n_neg.to_numpy(), totals, triangles, draws, SEED)


def summarize_null(signs, triangle_edges, null):
    observed = count_types(signs, triangle_edges)
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
    width = 0.25
    for ax, (label, stats) in zip(axes, results.items()):
        types = stats["types"]
        ax.bar(x - width, [row["observed"] for row in types], width,
               label="Observed", color="#35629A", zorder=3)
        ax.bar(x, [row["null_mean"] for row in types], width,
               yerr=[row["null_std"] for row in types], capsize=3,
               label="Global ± 1 SD", color="#D9853B", zorder=3)
        sender = stats["sender_conditioned"]["types"]
        ax.bar(x + width, [r["null_mean"] for r in sender], width,
               yerr=[r["null_std"] for r in sender], capsize=3, label="Within sender ± 1 SD", color="#54866B")
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
    parser.add_argument("--dev-shuffles", type=int, metavar="N",
                        help="Run a shorter shuffle check and print results only.")
    args = parser.parse_args()
    draws = SHUFFLES if args.dev_shuffles is None else args.dev_shuffles
    if not 2 <= draws <= SHUFFLES:
        parser.error(f"Use between 2 and {SHUFFLES} shuffles.")
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
    conditioned = sender_null(pairs, graph, triangles, draws)
    results = {}
    for index, (label, negative) in enumerate(rules.items()):
        signs = negative.astype(np.int8)
        rng = np.random.default_rng(SEED)
        global_null = np.array([count_types(rng.permutation(signs), triangles)
                                for _ in range(draws)])
        stats = summarize_null(signs, triangles, global_null)
        stats["sender_conditioned"] = summarize_null(signs, triangles, conditioned[index])
        results[label] = stats
    numbers = {
        "nodes": graph.vcount(),
        "undirected_edges": graph.ecount(),
        "triangles": triangles.shape[1],
        "excluded_self_loop_pairs": int(pairs["source"].eq(pairs["target"]).sum()),
        "majority_ties_labeled_nonnegative": int((n_pos == n_neg).sum()),
        "shuffles_per_rule": draws,
        "any_negative": results["Any negative link"],
        "majority_negative": results["Majority negative"],
    }

    if args.dev_shuffles is None:
        FIGURES.mkdir(parents=True, exist_ok=True)
        RESULTS.mkdir(parents=True, exist_ok=True)
        plot_counts(results, FIGURES / "structural_balance.png")
        save_numbers("balance", numbers)
    else:
        print(f"Development run: {draws} shuffles, console output only.")

    print(f"{graph.vcount():,} nodes, {graph.ecount():,} undirected edges, "
          f"{triangles.shape[1]:,} triangles, {draws:,} shuffles per rule.")
    print(f"Excluded {numbers['excluded_self_loop_pairs']:,} self-loop pairs. "
          f"Majority rule assigns {numbers['majority_ties_labeled_nonnegative']:,} ties "
          "to the nonnegative sign.")
    for label, stats in results.items():
        explain(label + " / global shuffle", stats)
        explain(label + " / within-sender shuffle", stats["sender_conditioned"])
    print("\nThe sign shuffle keeps the graph and the overall number of negative edges fixed. "
          "The probability-only expectation assumes independent signs. "
          "The comparison measures triangle patterns in classifier labels. "
          "A departure can also reflect where negative labels cluster around particular nodes.")


if __name__ == "__main__":
    main()
