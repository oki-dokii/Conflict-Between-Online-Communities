"""Paths and readers shared by the network analysis scripts."""

from pathlib import Path

import igraph as ig
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
RESULTS = ROOT / "results"
FIGURES = ROOT / "figures"
SEED = 42
PROPERTY_COUNT = 86
EMBEDDING_DIMENSIONS = 300


def normalize_names(names):
    """Match Reddit community identifiers across files."""
    return names.str.strip().str.lower()


def load_edges(directory=PROCESSED, *, columns=None):
    """Read hyperlink records, optionally selecting a subset of columns."""
    return pd.read_parquet(Path(directory) / "edges.parquet", columns=columns)


def load_pairs(directory=PROCESSED, *, columns=None):
    """Read one row per ordered source-target pair."""
    return pd.read_parquet(Path(directory) / "pairs.parquet", columns=columns)


def load_embeddings(directory=PROCESSED):
    """Read 300 embedding coordinates indexed by normalized subreddit name."""
    return pd.read_parquet(Path(directory) / "embeddings.parquet").set_index("subreddit")


def load_graph(directory=PROCESSED):
    """Read the directed, aggregated igraph graph."""
    return ig.Graph.Read_GraphML(str(Path(directory) / "graph.graphml"))
