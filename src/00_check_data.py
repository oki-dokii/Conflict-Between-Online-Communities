"""Summarize the raw SNAP hyperlink and subreddit embedding files."""

import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import random


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROPERTY_COUNT = 86
EMBEDDING_DIMENSIONS = 300
SEED = 42


def check_links(path):
    subreddits = set()
    post_ids = set()
    widths = Counter()
    rows = negatives = 0
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream, delimiter="\t", strict=True)
        header = next(reader, [])
        columns = {name: index for index, name in enumerate(header)}
        label = "LINK_SENTIMENT" if "LINK_SENTIMENT" in columns else "POST_LABEL"
        properties = "PROPERTIES" if "PROPERTIES" in columns else "POST_PROPERTIES"
        required = ("SOURCE_SUBREDDIT", "TARGET_SUBREDDIT", "POST_ID", "TIMESTAMP",
                    label, properties)
        if len(columns) != len(header) or not columns.keys() >= set(required):
            raise ValueError(f"{path}: expected a hyperlink TSV header with {', '.join(required)}")

        for row in reader:
            if not row:
                continue
            if len(row) != len(header):
                raise ValueError(f"{path}:{reader.line_num}: wrong number of TSV fields")
            source, target, post_id, _, sign, vector = (
                row[columns[name]].strip() for name in required
            )
            if not all((source, target, post_id)):
                raise ValueError(f"{path}:{reader.line_num}: missing subreddit or POST_ID")
            if sign not in {"-1", "1", "+1"}:
                raise ValueError(f"{path}:{reader.line_num}: expected sentiment -1 or +1")

            # Count each link row and collect distinct IDs for cross-file comparison.
            rows += 1
            negatives += sign == "-1"
            subreddits.update((source.lower(), target.lower()))
            post_ids.add(post_id)
            widths[vector.count(",") + 1 if vector else 0] += 1

    return {
        "rows": rows,
        "unique_subreddits": len(subreddits),
        "negative_links": negatives,
        "negative_share": negatives / rows if rows else None,
        "properties_column": properties,
        "properties_field_counts": dict(sorted(widths.items())),
        "properties_wrong_width_rows": rows - widths[PROPERTY_COUNT],
    }, subreddits, post_ids


def check_embeddings(path):
    names = set()
    rows = 0
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream, strict=True)
        for row in reader:
            if not row:
                continue
            if len(row) != EMBEDDING_DIMENSIONS + 1 or not row[0].strip():
                raise ValueError(
                    f"{path}:{reader.line_num}: expected a subreddit and "
                    f"{EMBEDDING_DIMENSIONS} embedding fields"
                )
            rows += 1
            names.add(row[0].strip().lower())
    return rows, names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title", type=Path, default=RAW / "soc-redditHyperlinks-title.tsv")
    parser.add_argument("--body", type=Path, default=RAW / "soc-redditHyperlinks-body.tsv")
    parser.add_argument("--embeddings", type=Path, default=RAW / "web-redditEmbeddings-subreddits.csv")
    args = parser.parse_args()
    random.seed(SEED)

    try:
        title, title_names, title_ids = check_links(args.title)
        body, body_names, body_ids = check_links(args.body)
        embedding_rows, embedding_names = check_embeddings(args.embeddings)
    except (OSError, ValueError, csv.Error) as error:
        parser.exit(1, f"Data check failed: {error}\n")

    names = title_names | body_names
    rows = title["rows"] + body["rows"]
    negatives = title["negative_links"] + body["negative_links"]
    combined = {
        "rows": rows,
        "unique_subreddits": len(names),
        "negative_links": negatives,
        "negative_share": negatives / rows if rows else None,
    }
    shared_posts = len(title_ids & body_ids)
    missing_embeddings = len(names - embedding_names)
    summary = {
        "title": title,
        "body": body,
        "combined": combined,
        "embeddings": {"rows": embedding_rows, "unique_subreddits": len(embedding_names)},
        "shared_post_ids": shared_posts,
        "hyperlink_subreddits_without_embeddings": missing_embeddings,
        "expected_properties_fields": PROPERTY_COUNT,
    }

    for label, stats in (("Title", title), ("Body", body), ("Combined hyperlinks", combined)):
        share = stats["negative_share"]
        share_text = "n/a" if share is None else f"{share:.2%}"
        print(f"{label}: {stats['rows']:,} rows, {stats['unique_subreddits']:,} unique "
              f"subreddits, {stats['negative_links']:,} negative links ({share_text})")
    print(f"Embeddings: {embedding_rows:,} rows, {len(embedding_names):,} unique subreddits")
    print(f"Distinct POST_IDs present in both title and body: {shared_posts:,}")
    print(f"Hyperlink subreddits missing from embeddings: {missing_embeddings:,}")
    print(f"PROPERTIES layout: {PROPERTY_COUNT} comma-separated positions (1–{PROPERTY_COUNT})")
    for label, stats in (("Title", title), ("Body", body)):
        print(f"  {label} {stats['properties_column']}: "
              f"fields per row → row count {stats['properties_field_counts']}, "
              f"{stats['properties_wrong_width_rows']:,} rows with unexpected width")

    # Keep room for key numbers from later stages in the same JSON file.
    output = ROOT / "results" / "key_numbers.json"
    output.parent.mkdir(exist_ok=True)
    numbers = json.loads(output.read_text(encoding="utf-8")) if output.exists() else {}
    numbers["data_check"] = summary
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(numbers, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(f"Saved {output}")


if __name__ == "__main__":
    main()
