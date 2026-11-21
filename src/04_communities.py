"""Compare structural and embedding communities and test within-community links."""

import argparse
from itertools import combinations
import json
from pathlib import Path
import random
from tempfile import TemporaryDirectory

import igraph as ig
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score, silhouette_score

from common import PROCESSED, RESULTS, SEED, load_embeddings, load_graph, load_pairs


LOUVAIN_SEEDS = range(SEED, SEED + 5)
MAX_K = 12
SILHOUETTE_SAMPLE = 3000
SHUFFLES = 1000


def structural_partition(graph):
    # Reciprocal links collapse to a single unweighted tie for Louvain.
    simple = graph.as_undirected(mode="collapse").simplify()
    runs = []
    memberships = []
    for seed in LOUVAIN_SEEDS:
        ig.set_random_number_generator(random.Random(seed))
        if simple.ecount():
            partition = simple.community_multilevel()
            membership = partition.membership
            modularity = float(partition.modularity)
        else:
            membership = list(range(simple.vcount()))
            modularity = None
        memberships.append(membership)
        runs.append({"seed": seed, "modularity": modularity,
                     "communities": len(set(membership))})
    best = max(range(len(runs)), key=lambda i: runs[i]["modularity"] or 0.0)
    stability = [
        {
            "seed_a": runs[i]["seed"],
            "seed_b": runs[j]["seed"],
            "ari": float(adjusted_rand_score(memberships[i], memberships[j])),
        }
        for i, j in combinations(range(len(runs)), 2)
    ]
    return memberships[best], {
        "runs": runs, "selected_seed": runs[best]["seed"],
        "stability_pairwise_ari": stability,
        "stability_mean_ari": float(np.mean([pair["ari"] for pair in stability])),
        "stability_min_ari": min(pair["ari"] for pair in stability),
    }


def embedding_partition(vectors):
    values = vectors.to_numpy()
    n = len(values)
    candidates = []
    best_score = -np.inf
    best_labels = None
    best_k = None
    if n >= 3:
        # Evaluate every candidate on the same seeded sample for comparability.
        rng = np.random.default_rng(SEED)
        sample = rng.choice(n, size=min(n, SILHOUETTE_SAMPLE), replace=False)
        for k in range(2, min(MAX_K, n - 1) + 1):
            model = KMeans(n_clusters=k, random_state=SEED, n_init=5)
            labels = model.fit_predict(values)
            sample_labels = labels[sample]
            distinct = len(set(sample_labels))
            score = None
            if len(set(labels)) == k and 1 < distinct < len(sample):
                score = float(silhouette_score(values[sample], sample_labels))
                if score > best_score:
                    best_score, best_labels, best_k = score, labels, k
            candidates.append({"k": k, "silhouette": score})
    return best_labels, {
        "nodes_with_embeddings": n, "selected_k": best_k,
        "silhouette_sample_size": min(n, SILHOUETTE_SAMPLE),
        "candidates": candidates,
    }


def within_links(pairs, labels, rng):
    source = pairs["source"].map(labels)
    target = pairs["target"].map(labels)
    eligible = source.notna() & target.notna()
    within = source[eligible].eq(target[eligible]).to_numpy(dtype=bool)
    counts = pairs.loc[eligible, ["n_neg", "n_pos"]].to_numpy(dtype=np.int64)
    n_neg, n_pos = map(int, counts.sum(axis=0))
    neg_within, pos_within = map(int, counts[within].sum(axis=0))
    total = n_neg + n_pos
    total_within = neg_within + pos_within

    # Sampling which within links are negative is exactly equivalent to
    # permuting labels over individual directed hyperlink rows for this test.
    if n_neg and n_pos and 0 < total_within < total:
        shuffled_neg = rng.hypergeometric(total_within, total - total_within, n_neg, SHUFFLES)
    else:
        shuffled_neg = np.full(SHUFFLES, neg_within)

    def summarize_sign(observed, count, shuffled):
        null_mean = float(shuffled.mean() / count) if count else None
        null_sd = float(shuffled.std(ddof=1) / count) if count else None
        observed_rate = observed / count if count else None
        return {
            "links": count, "within_links": observed, "within_fraction": observed_rate,
            "null_mean": null_mean, "null_sd": null_sd,
            "observed_minus_null_pp": 100 * (observed_rate - null_mean) if count else None,
        }

    negative = summarize_sign(neg_within, n_neg, shuffled_neg)
    positive = summarize_sign(pos_within, n_pos, total_within - shuffled_neg)
    gap = null_gap = null_gap_sd = None
    if n_neg and n_pos:
        gap = 100 * (neg_within / n_neg - pos_within / n_pos)
        # Both rates use the same shuffled labels, so retain their covariance.
        null_gap = 100 * (negative["null_mean"] - positive["null_mean"])
        null_gap_sd = 100 * (1 / n_neg + 1 / n_pos) * float(shuffled_neg.std(ddof=1))
    return {
        "eligible_links": total, "negative": negative, "neutral_or_positive": positive,
        "negative_minus_neutral_or_positive_pp": gap,
        "null_gap_mean_pp": null_gap, "null_gap_sd_pp": null_gap_sd,
    }


def show(value, spec):
    return "undefined" if value is None else format(value, spec)


def print_comparison(label, stats):
    if stats is None:
        print(f"{label}: unavailable because no embedding partition could be fitted.")
        return
    print(f"{label}: {stats['eligible_links']:,} eligible links")
    for key, name in [("negative", "Negative"), ("neutral_or_positive", "Neutral or positive")]:
        sign = stats[key]
        rate = sign["within_fraction"]
        between = 1 - rate if rate is not None else None
        print(f"  {name}: {sign['within_links']:,}/{sign['links']:,} within "
              f"({show(rate, '.2%')}), {show(between, '.2%')} between; "
              f"shuffle {show(sign['null_mean'], '.2%')} ± {show(sign['null_sd'], '.2%')} SD; "
              f"observed minus shuffle {show(sign['observed_minus_null_pp'], '+.2f')} pp")
    gap = stats["negative_minus_neutral_or_positive_pp"]
    if gap is not None:
        print(f"  Negative minus neutral/positive within-share: {gap:+.2f} pp "
              f"(shuffle mean {stats['null_gap_mean_pp']:+.2f} pp, "
              f"SD {stats['null_gap_sd_pp']:.2f} pp)")
        if gap > 0:
            print("  Negative links stay within groups more often than neutral-or-positive links.")
        elif gap < 0:
            print("  Negative links cross group boundaries more often than neutral-or-positive links.")
        else:
            print("  Both labels cross group boundaries at the same rate.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        graph = load_graph()
        pairs = load_pairs(columns=["source", "target", "n_pos", "n_neg"])
        vectors = load_embeddings()
    except (FileNotFoundError, ig.InternalError) as error:
        parser.exit(1, f"Could not load the build outputs. Run src/01_build.py first. {error}\n")
    if not graph.vcount():
        parser.exit(1, "The graph contains no subreddit nodes.\n")

    component = graph.connected_components(mode="weak").giant()
    names = pd.Index(component.vs["name"], name="subreddit")
    membership, structural = structural_partition(component)
    nodes = pd.DataFrame({"structural_community": membership}, index=names)
    matched = vectors.reindex(names.intersection(vectors.index))
    embedding_labels, embedding = embedding_partition(matched)
    nodes["embedding_cluster"] = pd.Series(pd.NA, index=names, dtype="Int64")
    nmi = ari = None
    if embedding_labels is not None:
        nodes.loc[matched.index, "embedding_cluster"] = embedding_labels
        structural_matched = nodes.loc[matched.index, "structural_community"]
        nmi = float(normalized_mutual_info_score(structural_matched, embedding_labels))
        ari = float(adjusted_rand_score(structural_matched, embedding_labels))

    in_component = pairs["source"].isin(names) & pairs["target"].isin(names)
    loop = pairs["source"].eq(pairs["target"])
    links = pairs.loc[in_component & ~loop]
    structural_links = within_links(links, nodes["structural_community"], np.random.default_rng(SEED))
    embedding_links = None
    if embedding_labels is not None:
        embedding_links = within_links(links, nodes["embedding_cluster"], np.random.default_rng(SEED))
    numbers = {
        "graph_nodes": graph.vcount(), "component_nodes": component.vcount(),
        "dropped_nodes": graph.vcount() - component.vcount(),
        "excluded_self_loop_links": int(pairs.loc[in_component & loop, ["n_pos", "n_neg"]].to_numpy().sum()),
        "component_nodes_without_embeddings": len(names) - len(matched),
        "structural": structural, "embedding": embedding,
        "partition_comparison_nodes": len(matched) if embedding_labels is not None else 0,
        "partition_nmi": nmi, "partition_ari": ari, "shuffles_per_partition": SHUFFLES,
        "structural_links": structural_links, "embedding_links": embedding_links,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    key_file = RESULTS / "key_numbers.json"
    key_numbers = json.loads(key_file.read_text(encoding="utf-8")) if key_file.exists() else {}
    key_numbers["communities"] = numbers
    nodes.reset_index().to_parquet(PROCESSED / "communities.parquet", index=False)
    with TemporaryDirectory(prefix=".communities-", dir=RESULTS) as work:
        summary = Path(work) / key_file.name
        summary.write_text(json.dumps(key_numbers, separators=(",", ":"), allow_nan=False) + "\n",
                           encoding="utf-8")
        summary.replace(key_file)

    print(f"Largest weak component: {len(names):,}/{graph.vcount():,} subreddits "
          f"({numbers['dropped_nodes']:,} dropped).")
    for run in structural["runs"]:
        print(f"Louvain seed {run['seed']}: {run['communities']:,} communities, "
              f"modularity {show(run['modularity'], '.4f')}")
    print(f"Selected seed {structural['selected_seed']}; pairwise seed ARI "
          f"mean {structural['stability_mean_ari']:.4f}, min {structural['stability_min_ari']:.4f}.")
    for candidate in embedding["candidates"]:
        print(f"K-means k={candidate['k']}: silhouette {show(candidate['silhouette'], '.4f')}")
    print(f"K-means selected k={show(embedding['selected_k'], 'd')}; {len(matched):,} matched "
          f"vectors, {numbers['component_nodes_without_embeddings']:,} nodes without vectors.")
    print(f"Partition agreement on {numbers['partition_comparison_nodes']:,} nodes: "
          f"NMI {show(nmi, '.4f')}, adjusted Rand index {show(ari, '.4f')}.")
    print(f"Within means both endpoints share an ID under the chosen partition. Between means "
          f"their IDs differ. Excluded {numbers['excluded_self_loop_links']:,} self-links.")
    print(f"The null uses {SHUFFLES:,} sign shuffles within each eligible link set. "
          "Each hyperlink row counts once, including repeated links between two subreddits.")
    print_comparison("Structural communities", structural_links)
    print_comparison("Embedding clusters", embedding_links)
    print("The differences describe classifier labels in the observed network. "
          "The embedding comparison covers only links with two clustered endpoints.")


if __name__ == "__main__":
    main()
