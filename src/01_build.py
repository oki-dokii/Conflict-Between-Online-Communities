"""Build the signed Reddit hyperlink data tables and directed igraph graph."""

import argparse
import json
from pathlib import Path
import random
from tempfile import TemporaryDirectory
import warnings

import igraph as ig
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from common import (
    EMBEDDING_DIMENSIONS,
    PROCESSED,
    PROPERTY_COUNT,
    RAW,
    RESULTS,
    ROOT,
    SEED,
    normalize_names,
    read_feature_names,
    read_raw_embeddings,
)


CHUNK_SIZE = 20_000
CORE_COLUMNS = ["source", "target", "post_id", "timestamp", "link_sentiment", "source_file"]
ALIASES = {
    "SOURCE_SUBREDDIT": "source",
    "TARGET_SUBREDDIT": "target",
    "POST_ID": "post_id",
    "TIMESTAMP": "timestamp",
    "LINK_SENTIMENT": "link_sentiment",
    "POST_LABEL": "link_sentiment",
    "PROPERTIES": "properties",
    "POST_PROPERTIES": "properties",
}


def read_link_chunks(path, source_file, features):
    """Yield typed edge records in input order with fixed Parquet columns."""
    with pd.read_csv(path, sep="\t", dtype=str, keep_default_na=False,
                     chunksize=CHUNK_SIZE, index_col=False, encoding="utf-8-sig") as reader:
        for frame in reader:
            frame = frame.rename(columns=ALIASES)
            required = set(CORE_COLUMNS) - {"source_file"} | {"properties"}
            if not frame.columns.is_unique or not required.issubset(frame.columns):
                raise ValueError(f"{path}: missing or ambiguous hyperlink columns")
            if frame.empty:
                continue

            for column in ("source", "target"):
                frame[column] = normalize_names(frame[column])
            frame["post_id"] = frame["post_id"].str.strip()
            if frame[["source", "target", "post_id"]].eq("").any().any():
                raise ValueError(f"{path}: blank subreddit or POST_ID")
            sign = frame["link_sentiment"].str.strip().map({"-1": -1, "1": 1, "+1": 1})
            if sign.isna().any():
                raise ValueError(f"{path}: expected sentiment -1 or +1")
            frame["link_sentiment"] = sign.astype("int8")
            frame["timestamp"] = pd.to_datetime(
                frame["timestamp"], format="ISO8601", utc=True
            ).astype("datetime64[ns, UTC]")
            if frame["timestamp"].isna().any():
                raise ValueError(f"{path}: missing TIMESTAMP")
            frame["source_file"] = source_file

            width = frame["properties"].str.count(",") + 1
            if not width.eq(PROPERTY_COUNT).all():
                raise ValueError(f"{path}: expected {PROPERTY_COUNT} properties on every row")
            values = frame["properties"].str.split(",", expand=True).astype("float64")
            if not np.isfinite(values.to_numpy()).all():
                raise ValueError(f"{path}: properties must be finite numeric values")
            values.columns = features
            yield frame[CORE_COLUMNS], values


def write_edges(paths, features, output):
    """Append title and body chunks to one Parquet file and retain only edge metadata."""
    schema = pa.schema([
        ("source", pa.string()), ("target", pa.string()), ("post_id", pa.string()),
        ("timestamp", pa.timestamp("ns", tz="UTC")), ("link_sentiment", pa.int8()),
        ("source_file", pa.string()), *((name, pa.float64()) for name in features),
    ])
    metadata = []
    with pq.ParquetWriter(output, schema) as writer:
        for source_file, path in paths.items():
            for core, values in read_link_chunks(path, source_file, features):
                chunk = pd.concat([core, values], axis=1)
                writer.write_table(pa.Table.from_pandas(chunk, schema=schema, preserve_index=False))
                metadata.append(core)
    if not metadata:
        raise ValueError("The title and body files contain no hyperlink records")
    return pd.concat(metadata, ignore_index=True)


def make_pairs(edges):
    # Group by ordered endpoints so opposite directions remain independent.
    return (
        edges.assign(is_pos=edges["link_sentiment"].eq(1), is_neg=edges["link_sentiment"].eq(-1))
        .groupby(["source", "target"], as_index=False, sort=True)
        .agg(n_pos=("is_pos", "sum"), n_neg=("is_neg", "sum"),
             n_total=("link_sentiment", "size"), first_ts=("timestamp", "min"),
             last_ts=("timestamp", "max"))
    )


def write_graph(pairs, nodes, covered_nodes, output):
    names = sorted(nodes)
    vertex_ids = {name: index for index, name in enumerate(names)}
    endpoints = [(vertex_ids[source], vertex_ids[target])
                 for source, target in zip(pairs["source"], pairs["target"])]
    graph = ig.Graph(n=len(names), edges=endpoints, directed=True)
    graph.vs["name"] = names
    graph.vs["has_embedding"] = [name in covered_nodes for name in names]
    for column in ("n_pos", "n_neg", "n_total"):
        graph.es[column] = pairs[column].tolist()
    # GraphML stores timestamp attributes as strings.
    for column in ("first_ts", "last_ts"):
        graph.es[column] = [timestamp.isoformat() for timestamp in pairs[column]]
    graph.write_graphml(str(output))


def summarize(edges, pairs, nodes, covered_nodes, embedding_rows):
    negative = edges["link_sentiment"].eq(-1)
    source_missing = ~edges["source"].isin(covered_nodes)
    target_missing = ~edges["target"].isin(covered_nodes)
    loops = edges["source"].eq(edges["target"])
    overlap = edges.groupby("source_file")["post_id"].agg(set).to_dict()
    numbers = {
        "title_rows": int(edges["source_file"].eq("title").sum()),
        "body_rows": int(edges["source_file"].eq("body").sum()),
        "hyperlink_rows": len(edges),
        "distinct_post_ids": int(edges["post_id"].nunique()),
        "post_ids_shared_by_title_and_body": len(overlap.get("title", set()) & overlap.get("body", set())),
        "subreddit_nodes": len(nodes),
        "directed_pairs": len(pairs),
        "pairs_with_negative_links": int(pairs["n_neg"].gt(0).sum()),
        "pairs_with_both_labels": int((pairs["n_neg"].gt(0) & pairs["n_pos"].gt(0)).sum()),
        "negative_links": int(negative.sum()),
        "neutral_or_positive_links": int((~negative).sum()),
        "negative_link_share": float(negative.mean()),
        "self_loop_links": int(loops.sum()),
        "negative_self_loop_links": int((negative & loops).sum()),
        "self_loop_pairs": int(pairs["source"].eq(pairs["target"]).sum()),
        "embedding_rows": embedding_rows,
        "nodes_with_embeddings": len(covered_nodes),
        "nodes_without_embeddings": len(nodes - covered_nodes),
        "negative_links_missing_at_least_one_embedding": int(
            (negative & (source_missing | target_missing)).sum()
        ),
        "negative_links_missing_both_embeddings": int(
            (negative & source_missing & target_missing).sum()
        ),
        "negative_links_with_both_embeddings": int(
            (negative & ~source_missing & ~target_missing).sum()
        ),
        "first_timestamp": edges["timestamp"].min().isoformat(),
        "last_timestamp": edges["timestamp"].max().isoformat(),
        "text_features": PROPERTY_COUNT,
        "embedding_dimensions": EMBEDDING_DIMENSIONS,
    }
    return numbers


def build(args):
    features = read_feature_names(args.feature_names, reserved=CORE_COLUMNS)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)

    # Stage a complete build before publishing the four processed artifacts.
    with TemporaryDirectory(prefix=".build-", dir=PROCESSED) as work:
        staged = Path(work)
        edges = write_edges(
            {"title": args.title, "body": args.body}, features, staged / "edges.parquet"
        )
        pairs = make_pairs(edges)
        pairs.to_parquet(staged / "pairs.parquet", index=False)

        nodes = set(edges["source"]) | set(edges["target"])
        embeddings = read_raw_embeddings(args.embeddings)
        aligned = embeddings.loc[embeddings["subreddit"].isin(nodes)].sort_values("subreddit")
        covered_nodes = set(aligned["subreddit"])
        aligned.to_parquet(staged / "embeddings.parquet", index=False)
        write_graph(pairs, nodes, covered_nodes, staged / "graph.graphml")

        numbers = summarize(edges, pairs, nodes, covered_nodes, len(embeddings))
        key_file = RESULTS / "key_numbers.json"
        key_numbers = json.loads(key_file.read_text(encoding="utf-8")) if key_file.exists() else {}
        key_numbers["build"] = numbers
        for artifact in staged.iterdir():
            artifact.replace(PROCESSED / artifact.name)
        with TemporaryDirectory(prefix=".build-", dir=RESULTS) as results_work:
            summary = Path(results_work) / key_file.name
            summary.write_text(json.dumps(key_numbers, separators=(",", ":")) + "\n",
                               encoding="utf-8")
            summary.replace(key_file)

    for label, value in numbers.items():
        display = f"{value:.2%}" if label == "negative_link_share" else value
        print(f"{label.replace('_', ' ')}: {display}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title", type=Path, default=RAW / "soc-redditHyperlinks-title.tsv")
    parser.add_argument("--body", type=Path, default=RAW / "soc-redditHyperlinks-body.tsv")
    parser.add_argument("--embeddings", type=Path, default=RAW / "web-redditEmbeddings-subreddits.csv")
    parser.add_argument("--feature-names", type=Path, default=ROOT / "feature_names.txt")
    args = parser.parse_args()

    random.seed(SEED)
    np.random.seed(SEED)
    ig.set_random_number_generator(random)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", pd.errors.ParserWarning)
            build(args)
    except (OSError, ValueError, pd.errors.ParserWarning) as error:
        parser.exit(1, f"Build failed: {error}\n")


if __name__ == "__main__":
    main()
