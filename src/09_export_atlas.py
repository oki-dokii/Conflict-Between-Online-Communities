"""Export monthly links and a 2D embedding projection to Conflict Atlas JSON."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd
from sklearn.decomposition import PCA

from common import PROCESSED, SEED, load_edges, load_embeddings


def build_atlas(edges, embeddings):
    names = pd.Index(sorted(set(edges["source"]) | set(edges["target"])))
    embedded = embeddings.reindex(names.intersection(embeddings.index))
    coordinates = {}
    if len(embedded) >= 2:
        plane = PCA(n_components=2, svd_solver="randomized", random_state=SEED)
        projected = plane.fit_transform(embedded).round(6)
        coordinates = dict(zip(embedded.index, projected.tolist()))
    elif len(embedded) == 1:
        coordinates[embedded.index[0]] = [0.0, 0.0]
    nodes = [[name, *coordinates.get(name, [None, None])] for name in names]

    month = edges["timestamp"].dt.tz_convert("UTC").dt.tz_localize(None).dt.to_period("M")
    calendar = pd.period_range(month.min(), month.max(), freq="M")
    compact = pd.DataFrame({
        "source": names.get_indexer(edges["source"]),
        "target": names.get_indexer(edges["target"]),
        "month": calendar.get_indexer(month),
        "negative": edges["link_sentiment"].eq(-1),
    })
    # Build a compact monthly pair table with both the label count and denominator.
    links = compact.groupby(["source", "target", "month"], as_index=False).agg(
        negative=("negative", "sum"), total=("negative", "size")
    )
    return {
        "illustrative": False, "months": calendar.astype(str).tolist(),
        "nodes": nodes, "links": links.to_numpy(dtype=int).tolist(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=PROCESSED / "atlas_data.json")
    args = parser.parse_args()
    try:
        edges = load_edges(columns=["source", "target", "timestamp", "link_sentiment"])
        embeddings = load_embeddings()
    except FileNotFoundError as error:
        parser.exit(1, f"Run src/01_build.py first. {error}\n")
    if edges.empty:
        parser.exit(1, "The edge table contains no hyperlink rows.\n")

    atlas = build_atlas(edges, embeddings)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".atlas-", dir=args.output.parent) as directory:
        temp = Path(directory) / args.output.name
        with temp.open("w", encoding="utf-8") as stream:
            json.dump(atlas, stream, separators=(",", ":"), allow_nan=False)
            stream.write("\n")
        temp.replace(args.output)
    plotted = sum(node[1] is not None for node in atlas["nodes"])
    print(f"{len(atlas['nodes']):,} subreddits ({plotted:,} plotted), "
          f"{len(atlas['months']):,} months, {len(atlas['links']):,} monthly directed pairs.")
    print(f"Saved {args.output.resolve()}")


if __name__ == "__main__":
    main()
