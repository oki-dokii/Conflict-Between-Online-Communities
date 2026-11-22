"""Repeat negative links among directed pairs with similar prior activity.

The temporal test in 08_repeat.py compares later negative risk for pairs whose early
links included a negative label with all other early pairs. A pair with many early
links has more chances to receive a negative label and may also stay more active.
This script recomputes that comparison within bins of early link volume and, for
pairs active in both periods, within bins of early and later volume together.

It reads the Atlas export, which keeps negative and total link counts per directed
pair and UTC month, so it runs without the raw TSVs.
"""

import argparse
import gzip
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from common import FIGURES, PROCESSED, RESULTS, ROOT, save_numbers

BINS = [(1, 1), (2, 2), (3, 4), (5, 9), (10, 19), (20, 49), (50, 99), (100, None)]


def bin_label(low, high):
    if high is None:
        return f"{low}+"
    return str(low) if low == high else f"{low}-{high}"


def load_atlas(path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def pair_table(atlas, cutoff):
    months = atlas["months"]
    if cutoff not in months:
        raise ValueError(f"Cutoff month {cutoff} is outside the export ({months[0]} to {months[-1]}).")
    split = months.index(cutoff)
    links = pd.DataFrame(atlas["links"], columns=["source", "target", "month", "neg", "total"])
    links = links.loc[links.source != links.target]
    links["late"] = links.month >= split
    wide = links.pivot_table(index=["source", "target"], columns="late", values=["neg", "total"],
                             aggfunc="sum", fill_value=0)
    wide.columns = [f"{'late' if late else 'early'}_{name}" for name, late in wide.columns]
    for column in ["early_neg", "early_total", "late_neg", "late_total"]:
        if column not in wide:
            wide[column] = 0
    return wide.reset_index()


def assign_bins(values):
    labels = np.full(len(values), "", dtype=object)
    for low, high in BINS:
        mask = (values >= low) if high is None else (values >= low) & (values <= high)
        labels[mask] = bin_label(low, high)
    return labels


def contrast(frame):
    exposed = frame.early_neg > 0
    outcome = frame.late_neg > 0
    out = {}
    for name, mask in [("exposed", exposed), ("unexposed", ~exposed)]:
        pairs = int(mask.sum())
        hits = int(outcome[mask].sum())
        out[name] = {"pairs": pairs, "later_negative_pairs": hits, "risk": hits / pairs if pairs else None}
    e, u = out["exposed"]["risk"], out["unexposed"]["risk"]
    out["difference_pp"] = 100 * (e - u) if e is not None and u is not None else None
    out["risk_ratio"] = e / u if e is not None and u else None
    return out


def mantel_haenszel(frame, strata):
    """Pooled risk ratio across strata (Greenland–Robins variance for the log ratio)."""
    num = den = 0.0
    var_num = 0.0
    used = 0
    for _, group in frame.groupby(strata, observed=True):
        exposed = group.early_neg > 0
        outcome = group.late_neg > 0
        n1, n0 = int(exposed.sum()), int((~exposed).sum())
        if not n1 or not n0:
            continue
        a, c = int(outcome[exposed].sum()), int(outcome[~exposed].sum())
        n = n1 + n0
        num += a * n0 / n
        den += c * n1 / n
        var_num += ((a + c) * n1 * n0 - a * c * n) / n ** 2
        used += 1
    if not num or not den:
        return {"risk_ratio": None, "ci95": None, "strata_used": used}
    ratio = num / den
    se = np.sqrt(var_num / (num * den))
    return {"risk_ratio": ratio, "ci95": [ratio * np.exp(-1.96 * se), ratio * np.exp(1.96 * se)],
            "strata_used": used}


def plot(rows, pooled, crude, path):
    labels = [row["early_links"] for row in rows]
    x = np.arange(len(rows))
    exposed = [row["exposed"]["risk"] * 100 if row["exposed"]["risk"] is not None else np.nan for row in rows]
    unexposed = [row["unexposed"]["risk"] * 100 if row["unexposed"]["risk"] is not None else np.nan for row in rows]
    fig, ax = plt.subplots(figsize=(7.4, 4.6), layout="constrained")
    ax.plot(x, exposed, marker="o", color="#B4472E", label="Early negative label")
    ax.plot(x, unexposed, marker="o", color="#35629A", label="No early negative label")
    for i, row in enumerate(rows):
        if row["risk_ratio"] is not None:
            ax.annotate(f"{row['risk_ratio']:.1f}×", (i, exposed[i]), textcoords="offset points",
                        xytext=(0, 8), ha="center", fontsize=8, color="#B4472E")
    ax.set_xticks(x, labels)
    ax.set(xlabel="Links on the directed pair before 2016", ylabel="Later negative link (%)",
           title=f"Repeat negativity by early link volume\n"
                 f"crude {crude:.2f}×, volume-matched {pooled:.2f}× (Mantel–Haenszel)")
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(alpha=0.2)
    ax.legend(frameon=False)
    fig.savefig(path, dpi=200)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--atlas", type=Path, default=None,
                        help="Atlas export (default: data/processed/atlas_data.json, "
                             "else app/dist/atlas-data.json.gz)")
    parser.add_argument("--cutoff", default="2016-01", help="First follow-up month (UTC, YYYY-MM)")
    args = parser.parse_args()
    path = args.atlas or next(p for p in [PROCESSED / "atlas_data.json", ROOT / "app/dist/atlas-data.json.gz"]
                              if p.exists())
    atlas = load_atlas(path)
    if atlas.get("illustrative"):
        raise ValueError(f"{path} holds illustrative data; export the SNAP build first.")
    pairs = pair_table(atlas, args.cutoff)
    early = pairs.loc[pairs.early_total > 0].copy()
    early["early_bin"] = assign_bins(early.early_total.to_numpy())

    crude = contrast(early)
    rows = []
    for low, high in BINS:
        label = bin_label(low, high)
        result = contrast(early.loc[early.early_bin == label])
        rows.append({"early_links": label, **result})
    pooled = mantel_haenszel(early, "early_bin")

    active = early.loc[early.late_total > 0].copy()
    active["late_bin"] = assign_bins(active.late_total.to_numpy())
    active_crude = contrast(active)
    active_pooled = mantel_haenszel(active, ["early_bin", "late_bin"])

    reference = None
    snapshot = RESULTS / "key_numbers.json"
    if snapshot.exists():
        reference = json.loads(snapshot.read_text(encoding="utf-8")).get("repeat", {}).get("temporal", {}) \
            .get("early_pairs_including_later_inactive", {}).get("risk_ratio")

    numbers = {
        "source": str(path.relative_to(ROOT)).replace("\\", "/"),
        "cutoff_month": args.cutoff,
        "early_pairs": len(early),
        "crude": crude,
        "reproduces_08_repeat_risk_ratio": reference is not None and abs(crude["risk_ratio"] - reference) < 1e-9,
        "by_early_volume": rows,
        "early_volume_matched": pooled,
        "later_active_pairs": {
            "pairs": len(active),
            "crude": active_crude,
            "early_and_later_volume_matched": active_pooled,
        },
    }

    print(f"Early directed pairs (before {args.cutoff}): {len(early):,}")
    print(f"Crude risk ratio {crude['risk_ratio']:.2f} "
          f"({100 * crude['exposed']['risk']:.2f}% vs {100 * crude['unexposed']['risk']:.2f}%)"
          + (f"; 08_repeat.py reported {reference:.2f}" if reference else ""))
    print(f"{'Early links':>11} {'Exposed':>9} {'Risk':>7} {'Unexposed':>10} {'Risk':>7} {'Ratio':>6}")
    for row in rows:
        e, u = row["exposed"], row["unexposed"]
        fmt = lambda r: f"{100 * r:6.2f}%" if r is not None else "     —"
        ratio = f"{row['risk_ratio']:6.2f}" if row["risk_ratio"] is not None else "     —"
        print(f"{row['early_links']:>11} {e['pairs']:>9,} {fmt(e['risk'])} {u['pairs']:>10,} {fmt(u['risk'])} {ratio}")
    ci = pooled["ci95"]
    print(f"Early-volume-matched risk ratio {pooled['risk_ratio']:.2f} (95% CI {ci[0]:.2f}-{ci[1]:.2f})")
    ci = active_pooled["ci95"]
    print(f"Later-active pairs: crude {active_crude['risk_ratio']:.2f}; matched on early and later volume "
          f"{active_pooled['risk_ratio']:.2f} (95% CI {ci[0]:.2f}-{ci[1]:.2f})")

    FIGURES.mkdir(parents=True, exist_ok=True)
    plot(rows, pooled["risk_ratio"], crude["risk_ratio"], FIGURES / "repeat_by_volume.png")
    save_numbers("repeat_by_volume", numbers)


if __name__ == "__main__":
    main()
