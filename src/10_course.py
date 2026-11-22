"""Compare graph and audience embeddings, study bridges, and predict later link labels."""

import json
import random

import igraph as ig
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from numba import njit
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import auc, average_precision_score, precision_recall_curve
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from common import FIGURES, PROCESSED, SEED, load_edges, load_embeddings, load_pairs, save_numbers


def graph_from_pairs(pairs):
    names = pd.Index(sorted(set(pairs.source) | set(pairs.target)), name="subreddit")
    ends = zip(names.get_indexer(pairs.source), names.get_indexer(pairs.target))
    graph = ig.Graph(n=len(names), edges=list(ends), directed=False).simplify()
    return graph, names


@njit
def walk_embedding(ptr, neighbours, noise_cdf, seed, dimensions=32, epochs=8, length=20):
    """Skip-gram on unbiased walks, one sampled context in radius three per centre."""
    np.random.seed(seed)
    n = len(ptr) - 1
    vectors = ((np.random.random((n, dimensions)) - 0.5) / dimensions).astype(np.float32)
    context = np.zeros_like(vectors)
    walk = np.empty(length, dtype=np.int64)
    for epoch in range(epochs):
        rate = 0.035 * (1 - epoch / epochs)
        for start in np.random.permutation(n):
            if ptr[start] == ptr[start + 1]:
                vectors[start] = 0
                continue
            walk[0] = start
            for j in range(1, length):
                u = walk[j - 1]
                walk[j] = neighbours[np.random.randint(ptr[u], ptr[u + 1])]
            for j, u in enumerate(walk):
                low, high = max(0, j - 3), min(length, j + 4)
                pos = np.random.randint(low, high - 1)
                v = walk[pos + int(pos >= j)]
                for trial in range(4):
                    other = v if trial == 0 else np.searchsorted(noise_cdf, np.random.random())
                    if trial and other == v:
                        continue
                    score = np.dot(vectors[u], context[other])
                    update = rate * ((1.0 if trial == 0 else 0.0) - 1 / (1 + np.exp(-min(30., max(-30., score)))))
                    for k in range(dimensions):
                        old = vectors[u, k]
                        vectors[u, k] += update * context[other, k]
                        context[other, k] += update * old
    return vectors


def pair_cosines(frame, names, vectors):
    norms = np.linalg.norm(vectors, axis=1)
    a, b = names.get_indexer(frame.source), names.get_indexer(frame.target)
    scores = np.full(len(frame), np.nan)
    for start in range(0, len(frame), 8192):
        ids = np.arange(start, min(start + 8192, len(frame)))
        ids = ids[(a[ids] >= 0) & (b[ids] >= 0)]
        ids = ids[(norms[a[ids]] > 0) & (norms[b[ids]] > 0)]
        scores[ids] = np.einsum("ij,ij->i", vectors[a[ids]], vectors[b[ids]]) / (
            norms[a[ids]] * norms[b[ids]])
    return scores


def correlation(x, y):
    if len(x) < 2 or np.ptp(x) == 0 or np.ptp(y) == 0:
        return None
    return float(spearmanr(x, y).statistic)


def compare_spaces(pairs, graph, names, audience):
    adjacency = graph.get_adjacency_sparse().tocsr()
    cdf = np.cumsum(np.asarray(graph.degree(), dtype=float) ** 0.75)
    if not len(cdf) or cdf[-1] == 0:
        raise ValueError("DeepWalk needs at least one non-loop edge.")
    vectors = walk_embedding(adjacency.indptr, adjacency.indices, cdf / cdf[-1], SEED)
    pd.DataFrame(vectors, index=names, columns=[f"dim_{i}" for i in range(vectors.shape[1])]).to_parquet(
        PROCESSED / "deepwalk.parquet")
    topology = pair_cosines(pairs, names, vectors)
    users = pair_cosines(pairs, audience.index, audience.to_numpy())
    covered = np.isfinite(topology) & np.isfinite(users)
    result = {}
    for label, weights in (("negative", pairs.n_neg), ("nonnegative", pairs.n_pos)):
        mask = covered & (weights.to_numpy() > 0)
        multiplicity = weights.to_numpy()[mask]
        x, y = np.repeat(topology[mask], multiplicity), np.repeat(users[mask], multiplicity)
        result[label] = {"rows": len(x), "pairs": int(mask.sum()),
                         "graph_mean_cosine": float(x.mean()) if len(x) else None,
                         "audience_mean_cosine": float(y.mean()) if len(y) else None,
                         "row_spearman": correlation(x, y),
                         "pair_spearman": correlation(topology[mask], users[mask])}
    return result


def bridge_analysis(pairs, graph, names):
    # Uniform sampled shortest-path sources estimate full undirected betweenness.
    n = len(names)
    roots = np.random.default_rng(SEED).choice(n, min(256, n), replace=False)
    score = np.asarray(graph.betweenness(directed=False, sources=roots.tolist())) * n / len(roots)
    table = pd.DataFrame({"betweenness_estimate": score, "degree": graph.degree()}, index=names)
    ig.set_random_number_generator(random.Random(SEED))
    membership = np.asarray(graph.community_multilevel().membership)
    a, b = np.asarray(graph.get_edgelist(), dtype=int).reshape(-1, 2).T
    crosses = membership[a] != membership[b]
    outside = np.bincount(np.r_[a[crosses], b[crosses]], minlength=n)
    table["external_neighbours"] = outside
    result = {"sampled_sources": len(roots), "nodes": n}
    for role in ("source", "target"):
        counts = pairs.groupby(role).n_neg.sum().reindex(names, fill_value=0).to_numpy()
        heavy = counts >= np.sort(counts)[-max(1, int(np.ceil(n * 0.01)))]
        table["negative_" + role] = counts
        result[role] = {"top_group_including_ties": int(heavy.sum()), "threshold": int(counts[heavy].min()),
                        "top_median_betweenness": float(np.median(score[heavy])),
                        "others_median_betweenness": float(np.median(score[~heavy])) if (~heavy).any() else None,
                        "top_median_external_neighbours": float(np.median(outside[heavy])),
                        "others_median_external_neighbours": float(np.median(outside[~heavy])) if (~heavy).any() else None,
                        "spearman": correlation(counts, score)}
    table.to_parquet(PROCESSED / "node_betweenness.parquet")
    return result


def predict(edges, embeddings):
    # Freeze topology before either model-training or evaluation labels are observed.
    history = edges.loc[edges.timestamp < "2015-01-01", ["source", "target"]].drop_duplicates()
    graph, names = graph_from_pairs(history)
    ig.set_random_number_generator(random.Random(SEED))
    membership = np.array(graph.community_multilevel().membership)
    degree = np.log1p(graph.degree())
    later = edges.loc[edges.timestamp >= "2015-01-01"]
    cosine = pair_cosines(later, embeddings.index, embeddings.to_numpy())
    a, b = names.get_indexer(later.source), names.get_indexer(later.target)
    covered = np.isfinite(cosine) & (a >= 0) & (b >= 0)
    a, b = a[covered], b[covered]
    x = np.column_stack((cosine[covered], degree[a], degree[b], membership[a] == membership[b]))
    train = (later.timestamp[covered] < "2016-01-01").to_numpy()
    y = later.link_sentiment[covered].eq(-1).to_numpy()
    if any(len(np.unique(y[mask])) < 2 for mask in (train, ~train)):
        raise ValueError("The 2015 training and 2016+ test sets each need both signs.")
    model = make_pipeline(StandardScaler(), LogisticRegression(random_state=SEED, max_iter=500))
    model.fit(x[train], y[train])
    scores = model.predict_proba(x[~train])[:, 1]
    precision, recall, _ = precision_recall_curve(y[~train], scores)
    fig, ax = plt.subplots(figsize=(6.4, 4.3), layout="constrained")
    ax.plot(recall, precision, color="#38588A", label="Link-label model")
    ax.axhline(y[~train].mean(), color="#A85329", linestyle="--", label="Test prevalence")
    ax.set(xlim=(0, 1), ylim=(0, 1), xlabel="Recall", ylabel="Precision",
           title="Negative labels on held-out links from 2016 onward")
    ax.legend(frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    FIGURES.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURES / "link_prediction_pr.png", dpi=180)
    plt.close(fig)
    return {"train_rows": int(train.sum()), "test_rows": int((~train).sum()),
            "test_total_before_coverage_filter": int((later.timestamp >= "2016-01-01").sum()),
            "test_prevalence": float(y[~train].mean()), "pr_auc": float(auc(recall, precision)),
            "average_precision": float(average_precision_score(y[~train], scores))}


def main():
    pairs = load_pairs()
    graph, names = graph_from_pairs(pairs)
    audience = load_embeddings()
    numbers = {"embedding_comparison": compare_spaces(pairs, graph, names, audience),
               "betweenness": bridge_analysis(pairs, graph, names),
               "prediction": predict(load_edges(columns=["source", "target", "timestamp", "link_sentiment"]), audience)}
    save_numbers("course", numbers)
    print(json.dumps(numbers, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
