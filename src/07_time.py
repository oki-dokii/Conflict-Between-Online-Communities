"""Track monthly negative-link activity and decompose rises in negative fraction."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import matplotlib

matplotlib.use("Agg")

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter
import pandas as pd

from common import FIGURES, RESULTS, load_edges


TOP_SENDERS = 10
TOP_CONTRIBUTORS = 5
SPIKES = 3


def monthly_stats(edges, negative):
    calendar = pd.period_range(edges["month"].min(), edges["month"].max(), freq="M")
    monthly = pd.DataFrame(index=calendar.rename("month"))
    monthly["total_links"] = edges.groupby("month").size().reindex(calendar, fill_value=0)
    monthly["negative_links"] = negative.groupby("month").size().reindex(calendar, fill_value=0)
    monthly["negative_fraction"] = monthly["negative_links"] / monthly["total_links"].where(
        monthly["total_links"].gt(0)
    )
    monthly["negative_fraction_change"] = monthly["negative_fraction"].diff()
    monthly["negative_senders"] = negative.groupby("month")["source"].nunique().reindex(
        calendar, fill_value=0
    )
    counts = negative.groupby(["month", "source"]).size()
    top_counts = counts.sort_values(ascending=False).groupby(level="month").head(TOP_SENDERS)
    monthly["top_10_sender_negative_links"] = top_counts.groupby(level="month").sum().reindex(
        calendar, fill_value=0
    )
    monthly["top_10_sender_share"] = (
        monthly["top_10_sender_negative_links"]
        / monthly["negative_links"].where(monthly["negative_links"].gt(0))
    )
    monthly["boundary_month"] = calendar.isin([calendar[0], calendar[-1]])
    biggest = monthly.loc[monthly["negative_fraction_change"].gt(0), "negative_fraction_change"]
    monthly["spike_rank"] = pd.Series(pd.NA, index=calendar, dtype="Int64")
    for rank, month in enumerate(biggest.nlargest(SPIKES).index, start=1):
        monthly.loc[month, "spike_rank"] = rank
    return monthly


def top_contributors(current, previous, group, total, previous_total, n_negative):
    counts = pd.concat([
        current.groupby(group).size().rename("negative_links"),
        previous.groupby(group).size().rename("previous_negative_links"),
    ], axis=1).fillna(0).astype("int64").reset_index()
    counts["negative_share"] = counts["negative_links"] / n_negative
    # The signed contributions sum to the network-wide month-to-month change.
    counts["contribution_pp"] = 100 * (
        counts["negative_links"] / total - counts["previous_negative_links"] / previous_total
    )
    by_volume = counts.sort_values(["negative_links", *group], ascending=[False, *([True] * len(group))])
    by_volume = by_volume.loc[by_volume["negative_links"].gt(0)].head(TOP_CONTRIBUTORS)
    by_increase = counts.sort_values(
        ["contribution_pp", *group], ascending=[False, *([True] * len(group))]
    )
    by_increase = by_increase.loc[by_increase["contribution_pp"].gt(0)].head(TOP_CONTRIBUTORS)
    return {
        "top_by_negative_volume": by_volume.to_dict(orient="records"),
        "top_by_contribution_to_rise": by_increase.to_dict(orient="records"),
        "top_volume_share": float(by_volume["negative_share"].sum()),
        "groups_contributing_to_rise": int(counts["contribution_pp"].gt(0).sum()),
    }


def describe_spikes(monthly, negative):
    ranked = monthly.loc[monthly["spike_rank"].notna()].sort_values("spike_rank")
    details = []
    for month, row in ranked.iterrows():
        previous_month = month - 1
        current = negative.loc[negative["month"].eq(month)]
        previous = negative.loc[negative["month"].eq(previous_month)]
        arguments = (int(row["total_links"]), int(monthly.at[previous_month, "total_links"]),
                     int(row["negative_links"]))
        details.append({
            "rank": int(row["spike_rank"]), "month": str(month),
            "previous_month": str(previous_month),
            "total_links": arguments[0], "previous_total_links": arguments[1],
            "negative_links": arguments[2],
            "negative_fraction": float(row["negative_fraction"]),
            "previous_negative_fraction": float(monthly.at[previous_month, "negative_fraction"]),
            "change_pp": float(100 * row["negative_fraction_change"]),
            "includes_boundary_month": bool(
                row["boundary_month"] or monthly.at[previous_month, "boundary_month"]
            ),
            "negative_senders": int(row["negative_senders"]),
            "top_10_sender_share": float(row["top_10_sender_share"]),
            "senders": top_contributors(current, previous, ["source"], *arguments),
            "directed_pairs": top_contributors(current, previous, ["source", "target"], *arguments),
        })
    return details


def plot_monthly(monthly, path):
    fig, axes = plt.subplots(4, 1, figsize=(9, 8), sharex=True, layout="constrained")
    dates = monthly.index.to_timestamp()
    for ax, (column, label, percent) in zip(axes, [
        ("negative_links", "Negative links", False),
        ("negative_fraction", "Negative fraction", True),
        ("negative_senders", "Negative senders", False),
        ("top_10_sender_share", "Top 10 sender share", True),
    ]):
        ax.plot(dates, monthly[column], marker=".", linewidth=1.5, color="#35629A")
        for spike in dates[monthly["spike_rank"].notna()]:
            ax.axvline(spike, color="#B54521", alpha=0.55, linewidth=1, linestyle="--")
        if percent:
            ax.yaxis.set_major_formatter(PercentFormatter(1))
        ax.set_ylabel(label)
        ax.set_ylim(bottom=0)
        ax.grid(axis="y", alpha=0.2)
        ax.spines[["top", "right"]].set_visible(False)
    locator = mdates.AutoDateLocator(minticks=3, maxticks=9)
    axes[-1].xaxis.set_major_locator(locator)
    axes[-1].xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
    fig.suptitle("Monthly activity in negative-labeled Reddit links")
    fig.savefig(path, dpi=200)
    plt.close(fig)


def print_spikes(spikes):
    for spike in spikes:
        boundary = " (includes an observation-boundary month)" if spike["includes_boundary_month"] else ""
        print(f"\nSpike {spike['rank']}, {spike['month']}{boundary}: "
              f"{spike['previous_negative_fraction']:.2%} → {spike['negative_fraction']:.2%} "
              f"({spike['change_pp']:+.2f} pp). All links "
              f"{spike['previous_total_links']:,} → {spike['total_links']:,}.")
        print(f"  {spike['negative_links']:,} negative links from {spike['negative_senders']:,} "
              f"senders. The top 10 account for {spike['top_10_sender_share']:.2%}.")
        for key, label in (("senders", "Senders"), ("directed_pairs", "Directed pairs")):
            groups = spike[key]
            print(f"  {label}: top {len(groups['top_by_negative_volume'])} by volume account for "
                  f"{groups['top_volume_share']:.2%} of negative links; "
                  f"{groups['groups_contributing_to_rise']:,} contributed to the rise.")
            for section, heading in (
                ("top_by_negative_volume", "Largest negative-link volumes"),
                ("top_by_contribution_to_rise", "Largest contributions to the rise"),
            ):
                print(f"    {heading}")
                for entry in groups[section]:
                    name = f"r/{entry['source']}"
                    if key == "directed_pairs":
                        name += f" → r/{entry['target']}"
                    print(f"      {name}: {entry['negative_links']:,} negative links "
                          f"({entry['negative_share']:.2%} of month), "
                          f"{entry['contribution_pp']:+.2f} pp contribution.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        edges = load_edges(columns=["source", "target", "timestamp", "link_sentiment"])
    except FileNotFoundError as error:
        parser.exit(1, f"Run src/01_build.py first. {error}\n")
    if edges.empty:
        parser.exit(1, "The edge table contains no hyperlink rows.\n")

    # The build stores UTC timestamps. Dropping the timezone preserves UTC months.
    edges["month"] = edges["timestamp"].dt.tz_convert("UTC").dt.tz_localize(None).dt.to_period("M")
    negative = edges.loc[edges["link_sentiment"].eq(-1), ["month", "source", "target"]]
    monthly = monthly_stats(edges, negative)
    spikes = describe_spikes(monthly, negative)
    numbers = {
        "first_month": str(monthly.index[0]), "last_month": str(monthly.index[-1]),
        "months": len(monthly), "months_with_links": int(monthly["total_links"].gt(0).sum()),
        "total_links": len(edges), "negative_links": len(negative), "spikes": spikes,
    }
    FIGURES.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    key_file = RESULTS / "key_numbers.json"
    keys = json.loads(key_file.read_text(encoding="utf-8")) if key_file.exists() else {}
    keys["time"] = numbers
    output = monthly.rename_axis("month").reset_index()
    output["month"] = output["month"].astype(str)
    output.to_parquet(RESULTS / "monthly_link_stats.parquet", index=False)
    plot_monthly(monthly, FIGURES / "monthly_negative_links.png")
    with TemporaryDirectory(prefix=".time-", dir=RESULTS) as work:
        summary = Path(work) / key_file.name
        summary.write_text(json.dumps(keys, separators=(",", ":"), allow_nan=False) + "\n",
                           encoding="utf-8")
        summary.replace(key_file)

    print(f"{len(edges):,} links, {len(negative):,} negative, "
          f"{numbers['months_with_links']:,}/{len(monthly):,} UTC months with links "
          f"({numbers['first_month']}–{numbers['last_month']}).")
    print(f"Found {len(spikes)} of up to {SPIKES} spikes ranked by positive month-to-month "
          "change in negative fraction. Boundary months may be partial.")
    print_spikes(spikes)
    print("\nNames are dataset identifiers. Counts and contributions describe classifier-labeled "
          "links and can also change when overall hyperlink volume shifts.")


if __name__ == "__main__":
    main()
