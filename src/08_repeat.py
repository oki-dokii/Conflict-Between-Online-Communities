"""Measure repeat negative links, reciprocity, and negative-link patterns around neighbours."""

import argparse
import json
from itertools import permutations

import igraph as ig
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from numba import njit
from scipy.sparse import csr_matrix

from common import save_numbers, FIGURES, RESULTS, SEED, load_edges, load_pairs


SHUFFLES = 500


def pair_topology(pairs):
    names = sorted(set(pairs["source"]) | set(pairs["target"]))
    ids = {name: index for index, name in enumerate(names)}
    source = pairs["source"].map(ids).to_numpy(dtype=np.int64)
    target = pairs["target"].map(ids).to_numpy(dtype=np.int64)
    n = len(names)

    # Encode ordered pairs so both directions can be looked up in vectorized form.
    keys = source * n + target
    order = np.argsort(keys)
    sorted_keys = keys[order]
    absent = len(keys)

    def lookup(a, b):
        query = a * n + b
        if not len(keys):
            return np.full(query.shape, absent, dtype=np.intp)
        index = np.searchsorted(sorted_keys, query)
        safe = np.minimum(index, absent - 1)
        return np.where((index < absent) & (sorted_keys[safe] == query), order[safe], absent)

    graph = ig.Graph(n=n, edges=list(zip(source, target)), directed=True)
    undirected = graph.as_undirected(mode="collapse")
    # Every eligible A, B, C forms an undirected triangle. Retain only
    # orientations with observed A→B and A→C links, regardless of their signs.
    triangles = np.asarray(undirected.list_triangles(), dtype=np.int64).reshape(-1, 3)
    motifs = []
    for i, j, k in permutations(range(3)):
        a, b, c = triangles[:, i], triangles[:, j], triangles[:, k]
        anchor, candidate = lookup(a, b), lookup(a, c)
        valid = (anchor < absent) & (candidate < absent)
        motifs.append(np.array([anchor[valid], candidate[valid], lookup(c[valid], b[valid])]))
    return lookup(target, source), np.concatenate(motifs, axis=1), len(triangles)


def rates(n_neg, reverse, motifs):
    n_pairs = int(np.count_nonzero(n_neg))
    n_links = int(n_neg.sum())
    if not n_pairs:
        return None
    negative = np.r_[n_neg > 0, False]  # Last entry marks a missing directed pair.
    anchor, candidate, attacker = motifs
    candidate_negative = negative[candidate]
    attack_chain = candidate_negative & negative[attacker]
    neighbour_anchors = np.bincount(anchor[candidate_negative], minlength=len(n_neg)) > 0
    attacker_anchors = np.bincount(anchor[attack_chain], minlength=len(n_neg)) > 0
    active = negative[:-1]
    return {
        "reciprocity": np.count_nonzero(active & negative[reverse]) / n_pairs,
        "neighbour_link_weighted": int(n_neg[neighbour_anchors].sum()) / n_links,
        "attacker_link_weighted": int(n_neg[attacker_anchors].sum()) / n_links,
        "neighbour_pair_weighted": np.count_nonzero(active & neighbour_anchors) / n_pairs,
        "attacker_pair_weighted": np.count_nonzero(active & attacker_anchors) / n_pairs,
    }


def compare_null(n_neg, n_total, reverse, motifs, draws=SHUFFLES):
    observed = rates(n_neg, reverse, motifs)
    if observed is None:
        return None
    # Shuffle one Boolean per hyperlink and immediately sum it back into the
    # existing directed pairs. Pair capacities and total negatives stay fixed.
    starts = np.cumsum(n_total) - n_total
    signs = np.arange(int(n_total.sum())) < int(n_neg.sum())
    rng = np.random.default_rng(SEED)
    null = {name: np.empty(draws) for name in observed}
    for draw in range(draws):
        rng.shuffle(signs)
        shuffled_neg = np.add.reduceat(signs, starts, dtype=np.int64)
        shuffled = rates(shuffled_neg, reverse, motifs)
        for name, value in shuffled.items():
            null[name][draw] = value

    result = {}
    for name, value in observed.items():
        mean = float(null[name].mean())
        # Constant draws can still show tiny roundoff if std computes a new mean.
        sd = float(null[name].std(ddof=1)) if np.ptp(null[name]) else 0.0
        result[name] = {
            "observed": value, "null_mean": mean, "null_std": sd,
            "observed_minus_null_pp": 100 * (value - mean),
            "z_score": (value - mean) / sd if sd else None,
        }
    return result


def plot_repeats(counts, frequencies, path):
    fig, ax = plt.subplots(figsize=(6.8, 4.6), layout="constrained")
    ax.set(xscale="log", yscale="log", title="Negative links per directed subreddit pair",
           xlabel="Negative links on a pair", ylabel="Directed pairs")
    if len(counts):
        ax.scatter(counts, frequencies, s=22, color="#35629A")
    else:
        ax.text(0.5, 0.5, "No directed pairs with negative links",
                transform=ax.transAxes, ha="center")
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(alpha=0.2)
    fig.savefig(path, dpi=200)
    plt.close(fig)


def print_comparisons(result):
    if result is None:
        print("No negative links between distinct nodes, so the rates are undefined.")
        return
    labels = {
        "reciprocity": "Reciprocal negative directed pairs",
        "neighbour_link_weighted": "A also links negatively to a neighbour of B (link-weighted)",
        "attacker_link_weighted": "A also links negatively to a negative sender to B (link-weighted)",
        "neighbour_pair_weighted": "A also links negatively to a neighbour of B (pair-weighted)",
        "attacker_pair_weighted": "A also links negatively to a negative sender to B (pair-weighted)",
    }
    for key, label in labels.items():
        row = result[key]
        z = "undefined" if row["z_score"] is None else f"{row['z_score']:+.2f}"
        print(f"{label}: observed {row['observed']:.2%}, null {row['null_mean']:.2%} "
              f"± {row['null_std']:.2%} SD, difference {row['observed_minus_null_pp']:+.2f} pp, z {z}.")


@njit
def share_neighbour(a, c, ptr, idx, other_ptr, other_idx):
    result = np.zeros(len(a), dtype=np.bool_)
    for row in range(len(a)):
        i, j = ptr[a[row]], other_ptr[c[row]]
        while i < ptr[a[row]+1] and j < other_ptr[c[row]+1]:
            x, y = idx[i], other_idx[j]
            if x == y:
                result[row] = True
                break
            if x < y:
                i += 1
            else:
                j += 1
    return result


def risk_contrast(exposed, outcome):
    result = {}
    for label, mask in (("exposed", exposed), ("unexposed", ~exposed)):
        count = int(mask.sum())
        result[label] = {"pairs": count, "later_negative_pairs": int(outcome[mask].sum()),
                         "risk": float(outcome[mask].mean()) if count else None}
    a, b = (result[k]["risk"] for k in ("exposed", "unexposed"))
    result["difference_pp"] = 100 * (a - b) if a is not None and b is not None else None
    result["risk_ratio"] = a / b if a is not None and b else None
    return result


def temporal_test(edges, cutoff):
    edges = edges.loc[edges.source != edges.target]
    early = edges.loc[edges.timestamp < cutoff]
    late = edges.loc[edges.timestamp >= cutoff]
    if early.empty or late.empty:
        raise ValueError("The cutoff must leave non-loop links in both periods.")
    def paired(frame):
        return frame.groupby(["source", "target"]).link_sentiment.min().eq(-1)
    before, after = paired(early), paired(late)
    names = pd.Index(sorted(set(edges.source) | set(edges.target)))
    def endpoints(index):
        return tuple(names.get_indexer(index.get_level_values(i)) for i in (0, 1))
    def adjacency(index):
        a, b = endpoints(index)
        return csr_matrix((np.ones(len(a), dtype=bool), (a, b)), shape=(len(names), len(names)))
    negative = adjacency(before.index[before])
    all_early = adjacency(before.index)
    neighbours = all_early.maximum(all_early.T).tocsr()
    neighbours.sort_indices()
    a, c = endpoints(after.index)
    def exposed(graph):
        return share_neighbour(a, c, negative.indptr, negative.indices, graph.indptr, graph.indices)
    return {
        "cutoff_utc": cutoff.isoformat(), "early_links": len(early), "late_links": len(late),
        "early_pairs_including_later_inactive": risk_contrast(before.to_numpy(),
            after.reindex(before.index, fill_value=False).to_numpy()),
        "later_active_pairs": {
            "same_pair": risk_contrast(before.reindex(after.index, fill_value=False).to_numpy(), after.to_numpy()),
            "early_neighbour": risk_contrast(exposed(neighbours), after.to_numpy()),
            "early_attacker": risk_contrast(exposed(negative), after.to_numpy())},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cutoff", default="2016-01-01", help="Start of follow-up (UTC)")
    parser.add_argument("--dev-shuffles", type=int, metavar="N",
                        help="Run a shorter shuffle check and print results only.")
    args = parser.parse_args()
    draws = SHUFFLES if args.dev_shuffles is None else args.dev_shuffles
    if not 2 <= draws <= SHUFFLES:
        parser.error(f"Use between 2 and {SHUFFLES} shuffles.")
    cutoff = pd.to_datetime(args.cutoff, utc=True)
    temporal = temporal_test(load_edges(columns=["source", "target", "link_sentiment", "timestamp"]), cutoff)
    print("Time-ordered directed-pair risks:", json.dumps(temporal), flush=True)
    try:
        pairs = load_pairs(columns=["source", "target", "n_pos", "n_neg"])
    except FileNotFoundError as error:
        parser.exit(1, f"Run src/01_build.py first. {error}\n")

    loops = pairs["source"].eq(pairs["target"])
    links = pairs.loc[~loops]
    negative = links["n_neg"].to_numpy(dtype=np.int64)
    totals = links[["n_pos", "n_neg"]].sum(axis=1).to_numpy(dtype=np.int64)
    counts, frequencies = np.unique(negative[negative > 0], return_counts=True)
    n_pairs = int(frequencies.sum())
    repeated = int(frequencies[counts >= 2].sum())
    reverse, motifs, triangles = pair_topology(links)
    comparisons = compare_null(negative, totals, reverse, motifs, draws)
    numbers = {
        "directed_pairs": len(links), "negative_directed_pairs": n_pairs,
        "negative_links": int(negative.sum()), "excluded_self_loop_pairs": int(loops.sum()),
        "pairs_with_two_or_more": repeated,
        "repeat_share": repeated / n_pairs if n_pairs else None,
        "negative_links_per_pair_distribution": dict(zip(map(int, counts), map(int, frequencies))),
        "undirected_triangles": triangles, "shuffles": draws if comparisons is not None else 0,
        "comparisons": comparisons, "temporal": temporal,
    }
    if args.dev_shuffles is None:
        FIGURES.mkdir(parents=True, exist_ok=True)
        RESULTS.mkdir(parents=True, exist_ok=True)
        plot_repeats(counts, frequencies, FIGURES / "repeat_negative_pairs.png")
        save_numbers("repeat", numbers)
    else:
        print(f"Development run: {draws} shuffles, console output only.")

    print(f"{len(links):,} directed pairs, {n_pairs:,} with negative links. "
          f"Excluded {numbers['excluded_self_loop_pairs']:,} self-loop pairs.")
    repeat_pct = "undefined" if not n_pairs else f"{numbers['repeat_share']:.2%}"
    print(f"Pairs with at least two negative links: {repeated:,} ({repeat_pct} of negative pairs).")
    print(f"{triangles:,} undirected triangles; {numbers['shuffles']:,} fixed-structure shuffles.")
    print_comparisons(comparisons)
    print("Parallel hyperlinks stay aggregated by directed pair. Link-weighted rates give a pair "
          "one vote per negative link; pair-weighted rates give each negative pair one vote.")
    print("A neighbour can link to B in either direction with either label. For the attacker "
          "variant the neighbour must send a negative link to B.")
    print("These are patterns of co-occurrence in classifier labels. The pooled shuffle uses no event "
          "ordering, so a difference from the shuffle does not establish transmission.")


if __name__ == "__main__":
    main()
