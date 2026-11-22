"""Precompute a seeded UMAP projection and export Conflict Atlas data."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from common import FIGURES, PROCESSED, RESULTS, SEED, load_edges, load_embeddings, read_raw_embeddings


UMAP_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
COORDINATES = ["umap_x", "umap_y"]


def project_embeddings(embeddings):
    from umap import UMAP

    embeddings = embeddings.sort_index()
    usable = embeddings.loc[np.linalg.norm(embeddings.to_numpy(), axis=1) > 0]
    if len(usable) < 3:
        raise ValueError("UMAP requires at least three nonzero subreddit embeddings.")
    # Sorted rows and a single seeded worker make repeated fits deterministic.
    model = UMAP(
        n_components=2, n_neighbors=min(UMAP_NEIGHBORS, len(usable) - 1),
        min_dist=UMAP_MIN_DIST, metric="cosine", random_state=SEED, n_jobs=1,
        init="random", compatibility_layout=True,
    )
    xy = model.fit_transform(usable.to_numpy(dtype=np.float32))
    return pd.DataFrame(xy, index=usable.index.rename("subreddit"), columns=COORDINATES)


def build_atlas(edges, projection):
    names = pd.Index(sorted(set(edges["source"]) | set(edges["target"])))
    coordinates = projection.round(6).to_dict(orient="index")
    nodes = [[name, *[coordinates.get(name, {}).get(key) for key in COORDINATES]] for name in names]

    month = edges["timestamp"].dt.tz_convert("UTC").dt.tz_localize(None).dt.to_period("M")
    calendar = pd.period_range(month.min(), month.max(), freq="M")
    compact = pd.DataFrame({
        "source": names.get_indexer(edges["source"]),
        "target": names.get_indexer(edges["target"]),
        "month": calendar.get_indexer(month),
        "negative": edges["link_sentiment"].eq(-1),
    })
    # Keep directed monthly negative counts and all-link denominators.
    links = compact.groupby(["source", "target", "month"], as_index=False).agg(
        negative=("negative", "sum"), total=("negative", "size")
    )
    return {
        "illustrative": False, "projection": "umap", "months": calendar.astype(str).tolist(),
        "nodes": nodes, "links": links.to_numpy(dtype=int).tolist(),
    }


def plot_projection(projection, output):
    fig, ax = plt.subplots(figsize=(7.2, 5.4), layout="constrained")
    ax.scatter(projection["umap_x"], projection["umap_y"], s=3, alpha=0.22,
               color="#4b51a4", linewidths=0)
    ax.set(title="Shared-user subreddit embeddings", xlabel="UMAP 1", ylabel="UMAP 2")
    ax.set_aspect("equal", adjustable="datalim")
    ax.spines[["top", "right"]].set_visible(False)
    fig.savefig(output, dpi=200)
    plt.close(fig)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".atlas-", dir=path.parent) as directory:
        temp = Path(directory) / path.name
        with temp.open("w", encoding="utf-8") as stream:
            json.dump(value, stream, separators=(",", ":"), allow_nan=False)
            stream.write("\n")
        temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=PROCESSED / "atlas_data.json")
    parser.add_argument("--projection", type=Path, default=PROCESSED / "umap_2d.parquet")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--raw-embeddings", type=Path, metavar="CSV",
                        help=f"Fit on the headerless SNAP CSV instead of {PROCESSED / 'embeddings.parquet'}.")
    source.add_argument("--reuse-projection", action="store_true",
                        help="Use the saved UMAP coordinates to export without refitting.")
    parser.add_argument("--projection-only", action="store_true",
                        help="Save coordinates and figure without reading hyperlink edges.")
    args = parser.parse_args()
    if args.reuse_projection and args.projection_only:
        parser.error("--reuse-projection is for exporting links with an existing projection")
    try:
        edges = None if args.projection_only else load_edges(
            columns=["source", "target", "timestamp", "link_sentiment"]
        )
        if edges is not None and edges.empty:
            raise ValueError("The edge table contains no hyperlink rows.")
        if args.reuse_projection:
            projection = pd.read_parquet(args.projection).set_index("subreddit")[COORDINATES]
        else:
            if args.raw_embeddings:
                embeddings = read_raw_embeddings(args.raw_embeddings).set_index("subreddit")
            else:
                embeddings = load_embeddings()
            print(f"Fitting 2D UMAP on {len(embeddings):,} embeddings (seed {SEED}).", flush=True)
            projection = project_embeddings(embeddings)
            if not np.isfinite(projection.to_numpy()).all():
                raise ValueError("UMAP returned nonfinite coordinates.")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"Could not prepare the atlas. {error}\n")

    RESULTS.mkdir(parents=True, exist_ok=True)
    key_path = RESULTS / "key_numbers.json"
    key_numbers = json.loads(key_path.read_text(encoding="utf-8")) if key_path.exists() else {}
    if not args.reuse_projection:
        args.projection.parent.mkdir(parents=True, exist_ok=True)
        projection.reset_index().to_parquet(args.projection, index=False)
        FIGURES.mkdir(parents=True, exist_ok=True)
        plot_projection(projection, FIGURES / "embeddings_umap.png")
        key_numbers["umap"] = {
            "input_embeddings": len(embeddings), "projected_embeddings": len(projection),
            "zero_norm_skipped": len(embeddings) - len(projection),
            "source": "raw_snap_csv" if args.raw_embeddings else "aligned_embeddings_parquet",
            "seed": SEED, "dimensions": 2, "metric": "cosine",
            "n_neighbors": min(UMAP_NEIGHBORS, len(projection) - 1), "min_dist": UMAP_MIN_DIST,
        }
        print(f"Saved {len(projection):,}/{len(embeddings):,} projected subreddits to {args.projection.resolve()}.")
    if edges is not None:
        atlas = build_atlas(edges, projection)
        write_json(args.output, atlas)
        plotted = sum(node[1] is not None for node in atlas["nodes"])
        numbers = {
            "subreddits": len(atlas["nodes"]), "plotted_subreddits": plotted,
            "months": len(atlas["months"]), "monthly_directed_pairs": len(atlas["links"]),
        }
        key_numbers["atlas"] = numbers
        print(f"{numbers['subreddits']:,} subreddits ({plotted:,} plotted), "
              f"{numbers['months']:,} months, {numbers['monthly_directed_pairs']:,} monthly directed pairs.")
        print(f"Saved {args.output.resolve()}")
    write_json(key_path, key_numbers)


if __name__ == "__main__":
    main()
