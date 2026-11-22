"""Bundle the analysis results the public site's Analytics tab displays.

Reads results/key_numbers.json and the Atlas export, and writes
app/dist/results.json. Lorenz curves are recomputed from the export's
directed-pair counts and checked against the Ginis saved by 02_node_stats.py.
Run after 03, 06, 08, 10 and 11.
"""

import gzip
import json

import numpy as np

from common import PROCESSED, RESULTS, ROOT

CURVE_POINTS = 201


def load_atlas():
    path = next(p for p in [PROCESSED / "atlas_data.json", ROOT / "app/dist/atlas-data.json.gz"] if p.exists())
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def lorenz(values):
    """Cumulative share of links held by the lowest-ranked share of subreddits."""
    ordered = np.sort(np.asarray(values, dtype=float))
    total = ordered.sum()
    cumulative = np.concatenate([[0.0], np.cumsum(ordered) / total])
    population = np.linspace(0, 1, len(cumulative))
    gini = 1 - 2 * np.trapezoid(cumulative, population)
    grid = np.linspace(0, 1, CURVE_POINTS)
    # Dense sampling near the top, where nearly all of the mass sits.
    grid = np.unique(np.concatenate([grid, 1 - np.geomspace(1e-4, 0.2, 60)]))
    curve = np.interp(grid, population, cumulative)
    return gini, [[round(float(x), 5), round(float(y), 5)] for x, y in zip(grid, curve)]


def balance_view(section):
    out = {}
    for rule in ["any_negative", "majority_negative"]:
        block = section[rule]
        nulls = {"global": block, "within_sender": block["sender_conditioned"]}
        out[rule] = {
            "negative_edges": block["negative_edges"],
            "observed_balanced": block["balanced_fraction"],
            "observed_types": [t["observed"] for t in block["types"]],
            "nulls": {
                name: {
                    "balanced_mean": null["null_balanced_fraction_mean"],
                    "balanced_sd": null["null_balanced_fraction_std"],
                    "type_means": [t["null_mean"] for t in null["types"]],
                    "type_z": [t["z_score"] for t in null["types"]],
                }
                for name, null in nulls.items()
            },
        }
    return {"triangles": section["triangles"], "shuffles": section["shuffles_per_rule"], "rules": out}


def main():
    numbers = json.loads((RESULTS / "key_numbers.json").read_text(encoding="utf-8"))
    atlas = load_atlas()
    n = len(atlas["nodes"])
    neg_out, all_out = np.zeros(n), np.zeros(n)
    for source, _target, _month, neg, total in atlas["links"]:
        neg_out[source] += neg
        all_out[source] += total
    curves = {}
    stats = numbers["node_stats"]
    for key, values, reference in [("negative_out", neg_out, stats["neg_out"]),
                                   ("all_out", all_out, stats["total_out"])]:
        gini, curve = lorenz(values)
        if abs(gini - reference["gini"]) > 1e-3:
            raise ValueError(f"{key} Gini {gini:.4f} differs from 02_node_stats.py ({reference['gini']:.4f})")
        curves[key] = {"gini": reference["gini"], "top_shares": {k: v["share"] for k, v in reference["top"].items()},
                       "curve": curve}

    language = numbers["language"]
    course = numbers["course"]
    repeat = numbers["repeat"]["temporal"]["early_pairs_including_later_inactive"]
    by_volume = numbers["repeat_by_volume"]
    site = {
        "balance": balance_view(numbers["balance"]),
        "lorenz": {"subreddits": n, **curves},
        "language": {
            "test_sources": language["test_sources"], "test_rows": language["test_rows"],
            "prevalence": language["test_negative_share"],
            "top_features": [{k: f[k] for k in ["feature", "description", "smd", "ci_low", "ci_high"]}
                             for f in language["top_features"][:10]],
            "models": language["models"],
            "removed": language["removed_sentiment_features"],
        },
        "deepwalk": course["embedding_comparison"],
        "betweenness": course["betweenness"],
        "prediction": course["prediction"],
        "repeat": {
            "crude": {"exposed": repeat["exposed"]["risk"], "unexposed": repeat["unexposed"]["risk"],
                      "risk_ratio": repeat["risk_ratio"]},
            "by_early_volume": [{"early_links": r["early_links"], "exposed_pairs": r["exposed"]["pairs"],
                                 "exposed_risk": r["exposed"]["risk"], "unexposed_pairs": r["unexposed"]["pairs"],
                                 "unexposed_risk": r["unexposed"]["risk"], "risk_ratio": r["risk_ratio"]}
                                for r in by_volume["by_early_volume"]],
            "matched": by_volume["early_volume_matched"],
            "later_active_matched": by_volume["later_active_pairs"]["early_and_later_volume_matched"],
        },
    }
    path = ROOT / "app/dist/results.json"
    path.write_text(json.dumps(site, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print(f"Wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.1f} KiB); Lorenz Ginis match 02_node_stats.py")


if __name__ == "__main__":
    main()
