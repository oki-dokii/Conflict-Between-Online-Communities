"""Describe text-feature effects and predict SNAP classifier labels."""

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import auc, average_precision_score, precision_recall_curve, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from common import save_numbers, FIGURES, PROCESSED, RESULTS, ROOT, SEED, load_edges, read_feature_names


TOP_FEATURES = 15
BOOTSTRAPS = 500
IMPORTANCE_ROWS = 3000
IMPORTANCE_REPEATS = 5

# One-based positions in SNAP's POST_PROPERTIES list. Remove direct sentiment
# scores and the LIWC emotion group for a conservative ablation.
SENTIMENT_POSITIONS = {*range(19, 22), *range(48, 54)}
# Plain-language glosses follow SNAP's published vector order, independent of
# spelling choices in feature_names.txt.
DESCRIPTIONS = [
    "Text length in characters.",
    "Text length after spaces and similar separators are removed.",
    "Share of characters that are letters.",
    "Share of characters that are digits.",
    "Share of characters written as uppercase letters.",
    "Share of characters used as whitespace.",
    "Share of characters such as punctuation and other symbols.",
    "Total words in the text.",
    "How many distinct words appear.",
    "How many words are at least six characters long.",
    "Average word length, measured in characters.",
    "How many different common stopwords appear.",
    "Share of words that are common stopwords, such as 'the'.",
    "Total sentences in the text.",
    "How many sentences contain at least ten words.",
    "Average sentence length, measured in characters.",
    "Average sentence length, measured in words.",
    "A reading difficulty estimate based on word and sentence lengths.",
    "VADER score for positive tone.",
    "VADER score for negative tone.",
    "VADER summary of overall tone, from negative to positive.",
    "Grammatical words such as pronouns, articles, and prepositions.",
    "Pronouns used in place of nouns or noun phrases.",
    "Pronouns referring to people, such as 'I', 'you', and 'they'.",
    "First-person singular pronouns, such as 'I' and 'me'.",
    "First-person plural pronouns, such as 'we' and 'us'.",
    "Second-person pronouns addressing the reader, such as 'you'.",
    "Third-person singular personal pronouns, such as 'she' and 'he'.",
    "Third-person plural pronouns, such as 'they' and 'them'.",
    "Impersonal pronouns, such as 'it' or 'something'.",
    "Articles such as 'a', 'an', and 'the'.",
    "Words used as verbs.",
    "Helping verbs such as 'have' or 'can'.",
    "Past-tense language.",
    "Present-tense language.",
    "Language referring to the future.",
    "Adverbs, such as 'quickly'.",
    "Prepositions, such as 'in' or 'with'.",
    "Words joining clauses or phrases, such as 'and'.",
    "Words expressing negation, such as 'not'.",
    "Words expressing amount, such as 'many' or 'few'.",
    "Words referring to numbers or numerical quantities.",
    "Words in the swearing category.",
    "Words relating to people and social interaction.",
    "Words referring to family relationships.",
    "Words referring to friends or friendship.",
    "Words referring to people in general.",
    "Words that express emotion.",
    "Words expressing positive emotion.",
    "Words expressing negative emotion.",
    "Words expressing worry, fear, or anxiety.",
    "Words expressing anger.",
    "Words expressing sadness.",
    "Words related to thinking, reasoning, or deciding.",
    "Words suggesting insight or understanding.",
    "Words indicating causes or reasons, such as 'because'.",
    "Words indicating a gap between what is and what could or should be.",
    "Words expressing uncertainty, such as 'maybe'.",
    "Words expressing certainty, such as 'always'.",
    "Words related to restraint or inhibition.",
    "Words expressing inclusion, such as 'with' or 'together'.",
    "Words expressing exclusion, such as 'except' or 'without'.",
    "Words about sensory perception.",
    "Words about seeing.",
    "Words about hearing.",
    "Words about feeling or touch.",
    "Words related to biological processes.",
    "Words referring to the body.",
    "Words related to health or illness.",
    "Words referring to sex or sexuality.",
    "Words related to eating or drinking.",
    "Words about motion, space, or time.",
    "Words referring to movement.",
    "Words referring to position or space.",
    "Words referring to time.",
    "Words related to work.",
    "Words related to goals or achievement.",
    "Words related to leisure.",
    "Words related to home.",
    "Words related to money.",
    "Words related to religion.",
    "Words related to death.",
    "Words expressing assent or agreement.",
    "Words expressing disagreement.",
    "Verbal hesitations and disfluencies, such as 'um'.",
    "Conversational filler expressions.",
]


def divide_effect(difference, pooled_sd):
    """Return the signed effect, marking zero pooled variance as undefined."""
    output = np.full(np.shape(difference), np.nan)
    return np.divide(difference, pooled_sd, out=output, where=pooled_sd > 0)


def feature_effects(values, negative, features):
    neg, other = values[negative], values[~negative]
    means_neg, means_other = neg.mean(axis=0), other.mean(axis=0)
    pooled_sd = np.sqrt(
        ((len(neg) - 1) * neg.var(axis=0, ddof=1)
         + (len(other) - 1) * other.var(axis=0, ddof=1))
        / (len(values) - 2)
    )
    effects = divide_effect(means_neg - means_other, pooled_sd)
    table = pd.DataFrame({
        "position": np.arange(1, len(features) + 1), "feature": features,
        "description": DESCRIPTIONS, "mean_negative": means_neg,
        "mean_nonnegative": means_other, "smd": effects,
        "absolute_smd": np.abs(effects),
    })
    return table.sort_values("absolute_smd", ascending=False, kind="stable")


def bootstrap_top(values, negative, groups, top_columns):
    # Reduce repeated post rows to sums, squared sums, and counts per sign.
    values = values[:, top_columns]
    values -= values.mean(axis=0)
    n_groups = groups.max() + 1
    stats = []
    for mask in (negative, ~negative):
        ids = groups[mask]
        part = values[mask]
        stats.append(np.column_stack([
            np.bincount(ids, minlength=n_groups),
            *[np.bincount(ids, weights=column, minlength=n_groups) for column in part.T],
            *[np.bincount(ids, weights=column**2, minlength=n_groups) for column in part.T],
        ]))

    rng = np.random.default_rng(SEED)
    n_top = len(top_columns)
    samples = np.full((BOOTSTRAPS, n_top), np.nan)
    for draw in range(BOOTSTRAPS):
        weights = np.bincount(rng.integers(n_groups, size=n_groups), minlength=n_groups)
        neg, other = (weights @ summary for summary in stats)
        n_neg, n_other = neg[0], other[0]
        if min(n_neg, n_other) < 2:
            continue
        mean_neg = neg[1:n_top + 1] / n_neg
        mean_other = other[1:n_top + 1] / n_other
        ss_neg = np.maximum(neg[n_top + 1:] - n_neg * mean_neg**2, 0)
        ss_other = np.maximum(other[n_top + 1:] - n_other * mean_other**2, 0)
        pooled_sd = np.sqrt((ss_neg + ss_other) / (n_neg + n_other - 2))
        samples[draw] = divide_effect(mean_neg - mean_other, pooled_sd)

    intervals = np.full((n_top, 2), np.nan)
    for index, feature_samples in enumerate(samples.T):
        finite = feature_samples[np.isfinite(feature_samples)]
        if finite.size:
            intervals[index] = np.quantile(finite, [0.025, 0.975])
    return intervals, np.isfinite(samples).sum(axis=0)


def split_sources(negative, groups):
    n_splits = min(5, len(np.unique(groups[negative])), len(np.unique(groups[~negative])))
    if n_splits < 2:
        raise ValueError("Need at least two distinct source subreddits with each label for the grouped split.")
    splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=SEED)
    for train, test in splitter.split(negative, negative, groups):
        if np.unique(negative[train]).size == np.unique(negative[test]).size == 2:
            return train, test
    raise ValueError("No grouped stratified fold has both labels in train and test.")


def fit_models(values, negative, train, test, features):
    # Use the same holdout and permutation subset for both feature sets.
    test_y = negative[test]
    importance = np.arange(len(test))
    if len(test) > IMPORTANCE_ROWS:
        rng = np.random.default_rng(SEED)
        neg_rows, other_rows = importance[test_y], importance[~test_y]
        # Keep both labels even when rounding would erase a very rare class.
        n_neg = int(np.clip(round(IMPORTANCE_ROWS * test_y.mean()),
                            max(1, IMPORTANCE_ROWS - len(other_rows)),
                            min(len(neg_rows), IMPORTANCE_ROWS - 1)))
        importance = np.r_[rng.choice(neg_rows, n_neg, replace=False),
                           rng.choice(other_rows, IMPORTANCE_ROWS - n_neg, replace=False)]

    keep = [i for i in range(len(features)) if i + 1 not in SENTIMENT_POSITIONS]
    configs = {"all_features": list(range(len(features))), "without_sentiment": keep}
    summaries = {}
    importances = []
    for scenario, columns in configs.items():
        x_train, x_test = values[np.ix_(train, columns)], values[np.ix_(test, columns)]
        models = {
            "logistic": make_pipeline(StandardScaler(), LogisticRegression(
                max_iter=500, random_state=SEED
            )),
            "gradient_boosted": HistGradientBoostingClassifier(
                max_iter=120, early_stopping=False, random_state=SEED
            ),
        }
        summaries[scenario] = {}
        for name, model in models.items():
            print(f"Fitting {name} with {scenario.replace('_', ' ')}...", flush=True)
            model.fit(x_train, negative[train])
            scores = model.predict_proba(x_test)[:, 1]
            precision, recall, _ = precision_recall_curve(test_y, scores)
            summaries[scenario][name] = {
                "roc_auc": float(roc_auc_score(test_y, scores)),
                "pr_auc": float(auc(recall, precision)),
                "average_precision": float(average_precision_score(test_y, scores)),
            }
            result = permutation_importance(
                model, x_test[importance], test_y[importance], scoring="average_precision",
                n_repeats=IMPORTANCE_REPEATS, random_state=SEED,
            )
            importances.append(pd.DataFrame({
                "feature_set": scenario, "model": name,
                "feature": [features[i] for i in columns],
                "description": [DESCRIPTIONS[i] for i in columns],
                "ap_drop_mean": result.importances_mean,
                "ap_drop_std": result.importances_std,
            }).sort_values("ap_drop_mean", ascending=False, kind="stable"))
    return summaries, pd.concat(importances, ignore_index=True), len(importance)


def plot_effects(top, output):
    fig, ax = plt.subplots(figsize=(8.6, 6.2), layout="constrained")
    if len(top):
        y = np.arange(len(top))
        for index, row in enumerate(top.itertuples()):
            if np.isfinite(row.ci_low) and np.isfinite(row.ci_high):
                ax.hlines(index, row.ci_low, row.ci_high, color="#444444", linewidth=1.5)
        color = np.where(top["smd"] >= 0, "#B54521", "#35629A")
        ax.scatter(top["smd"], y, color=color, s=27, zorder=3)
        ax.set_yticks(y, labels=top["feature"])
        ax.invert_yaxis()
    else:
        ax.text(0.5, 0.5, "No features with nonzero pooled variance",
                transform=ax.transAxes, ha="center")
        ax.set_yticks([])
    ax.axvline(0, color="#777777", linestyle="--", linewidth=1)
    ax.set(title="Text properties with the largest label differences",
           xlabel="Standardized mean difference (negative minus nonnegative)\n"
                  "Lines show 95% post-bootstrap intervals")
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="x", alpha=0.18)
    fig.savefig(output, dpi=200)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feature-names", type=Path, default=ROOT / "feature_names.txt")
    args = parser.parse_args()
    try:
        features = read_feature_names(args.feature_names, reserved={"post_id", "link_sentiment"})
        edges = load_edges(columns=["source", "post_id", "link_sentiment", *features])
        values = edges[features].to_numpy(dtype=np.float64)
        negative = edges["link_sentiment"].eq(-1).to_numpy(dtype=bool)
        groups = pd.factorize(edges["post_id"])[0]
        if min(negative.sum(), (~negative).sum()) < 2:
            raise ValueError("Need at least two hyperlink rows with each sign.")
        sources = pd.factorize(edges["source"])[0]
        train, test = split_sources(negative, sources)
        if np.intersect1d(groups[train], groups[test]).size:
            raise ValueError("A post ID appears under multiple sources across the split.")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Could not prepare language analysis. Run src/01_build.py first. {error}\n")

    effects = feature_effects(values, negative, features)
    effects[["ci_low", "ci_high"]] = np.nan
    effects["bootstrap_valid"] = pd.Series(pd.NA, index=effects.index, dtype="Int64")
    selected = effects["smd"].dropna().head(TOP_FEATURES).index
    if len(selected):
        intervals, valid = bootstrap_top(values, negative, groups, selected.to_numpy())
        effects.loc[selected, ["ci_low", "ci_high"]] = intervals
        effects.loc[selected, "bootstrap_valid"] = valid
    top = effects.loc[selected]

    models, importances, importance_rows = fit_models(values, negative, train, test, features)
    numbers = {
        "rows": len(edges), "posts": int(np.unique(groups).size), "negative_rows": int(negative.sum()),
        "split_group": "source_subreddit",
        "train_sources": int(np.unique(sources[train]).size),
        "test_sources": int(np.unique(sources[test]).size),
        "train_rows": len(train), "test_rows": len(test),
        "train_negative_share": float(negative[train].mean()),
        "test_negative_share": float(negative[test].mean()),
        "bootstrap_draws": BOOTSTRAPS, "importance_test_rows": importance_rows,
        "importance_repeats": IMPORTANCE_REPEATS,
        "removed_sentiment_features": [features[i - 1] for i in sorted(SENTIMENT_POSITIONS)],
        "top_features": json.loads(top.to_json(orient="records", double_precision=15)),
        "models": models,
    }

    FIGURES.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    effects.to_parquet(PROCESSED / "language_effects.parquet", index=False)
    importances.to_parquet(PROCESSED / "language_importances.parquet", index=False)
    plot_effects(top, FIGURES / "language_top_features.png")
    save_numbers("language", numbers)

    print(f"{len(edges):,} labeled rows across {numbers['posts']:,} posts. "
          f"Train/test: {len(train):,}/{len(test):,} rows, "
          f"negative shares {numbers['train_negative_share']:.2%}/{numbers['test_negative_share']:.2%}.")
    print(f"Held out {numbers['test_sources']:,} sources unseen during training.")
    print(f"Test negative prevalence (average-precision baseline): {numbers['test_negative_share']:.4f}.")
    print(f"Top {len(top)} by absolute effect (negative minus nonnegative, "
          f"{BOOTSTRAPS} post-bootstrap draws):")
    for row in top.itertuples():
        print(f"  {row.feature}: {row.smd:+.4f} [{row.ci_low:+.4f}, {row.ci_high:+.4f}] "
              f"({row.bootstrap_valid} valid draws). {row.description}")
    print("Removed sentiment and emotion features: " + ", ".join(numbers["removed_sentiment_features"]))
    for scenario, fitted in models.items():
        for model, metrics in fitted.items():
            print(f"{scenario} / {model}: ROC-AUC {metrics['roc_auc']:.4f}, "
                  f"PR-AUC {metrics['pr_auc']:.4f}, average precision {metrics['average_precision']:.4f}")
            ranked = importances.loc[
                importances["feature_set"].eq(scenario) & importances["model"].eq(model)
            ].head(5)
            for row in ranked.itertuples():
                print(f"  Permute {row.feature}: AP drop {row.ap_drop_mean:+.4f} "
                      f"(SD {row.ap_drop_std:.4f}). {row.description}")
    for model in models["all_features"]:
        before = models["all_features"][model]
        after = models["without_sentiment"][model]
        baseline_gap = after["average_precision"] - numbers["test_negative_share"]
        print(f"{model} without sentiment: ROC-AUC change {after['roc_auc'] - before['roc_auc']:+.4f}, "
              f"average-precision change {after['average_precision'] - before['average_precision']:+.4f}, "
              f"average precision minus prevalence {baseline_gap:+.4f}.")
    print("These scores measure how well the remaining properties predict SNAP's classifier labels. "
          "Correlated properties can retain sentiment information after the named scores are removed.")


if __name__ == "__main__":
    main()
