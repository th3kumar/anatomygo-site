# /// script
# requires-python = ">=3.10"
# dependencies = ["google-analytics-data>=0.18", "google-analytics-admin>=0.23"]
# ///
"""The site's usage funnels and reports from Google Analytics (G-RFXTMB69WH), as Markdown.

    uv run scripts/ga-report.py setup [--dry-run]     # register the event parameters the reports break down by
    uv run scripts/ga-report.py report [--start 2026-09-26] [--end today] [--out report.md]

Access, once: a Google identity with Viewer on the GA4 property (Editor for `setup`), through either
  - a service account: add its e-mail under GA Admin → Property access management, then
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json   (keep the key out of this repository), or
  - your own account: gcloud auth application-default login \
      --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform
The property is found from the measurement ID; pass --property 123456789 (or GA_PROPERTY_ID) to skip the lookup.

Custom dimensions only collect from the moment they are registered, so run `setup` first. Funnel steps filter on
raw event parameters and work for earlier data too. Every report runs on its own: one that fails says why.
The events carry no personal text (see app/analytics.ts), so neither does this output.
"""
import argparse
import os
import sys
from datetime import date, timedelta

MEASUREMENT_ID = "G-RFXTMB69WH"
# Event parameters worth breaking down by (GA4 allows 50 event-scoped custom dimensions; the site sends about 50).
DIMENSIONS = ["source", "structure_id", "system_id", "practice", "step", "index", "start", "seconds", "kind", "result",
              "entry", "via", "first_visit", "device", "pins", "published", "features", "count", "query_kind", "result_count",
              "found", "isolated", "reason", "method", "stage", "tip", "hint", "quiz", "pin_count", "platform"]
METRICS = [("duration_ms", "Atlas load time", "MILLISECONDS")]


def admin():
    from google.analytics.admin_v1beta import AnalyticsAdminServiceClient
    return AnalyticsAdminServiceClient()


def find_property(given):
    if given:
        return given
    client = admin()
    for account in client.list_account_summaries():
        for prop in account.property_summaries:
            for stream in client.list_data_streams(parent=prop.property):
                if stream.web_stream_data.measurement_id == MEASUREMENT_ID:
                    return prop.property.split("/")[1]
    sys.exit(f"No property this identity can see has the web stream {MEASUREMENT_ID}; pass --property.")


def setup(prop, dry_run):
    from google.analytics.admin_v1beta.types import CustomDimension, CustomMetric
    client, parent = admin(), f"properties/{prop}"
    have = {d.parameter_name for d in client.list_custom_dimensions(parent=parent)}
    have_metrics = {m.parameter_name for m in client.list_custom_metrics(parent=parent)}
    for name in DIMENSIONS:
        if name in have:
            continue
        print(f"{'would register' if dry_run else 'registering'} dimension {name}")
        if not dry_run:
            client.create_custom_dimension(parent=parent, custom_dimension=CustomDimension(
                parameter_name=name, display_name=name, scope=CustomDimension.DimensionScope.EVENT))
    for name, label, unit in METRICS:
        if name in have_metrics:
            continue
        print(f"{'would register' if dry_run else 'registering'} metric {name}")
        if not dry_run:
            client.create_custom_metric(parent=parent, custom_metric=CustomMetric(
                parameter_name=name, display_name=label, scope=CustomMetric.MetricScope.EVENT,
                measurement_unit=getattr(CustomMetric.MeasurementUnit, unit)))
    print("Custom dimensions collect from now on; give them a day before reading breakdowns.")


# ---------------------------------------------------------------- report definitions

def step(event, **params):
    """A funnel step: an event, optionally with exact parameter values (int for numbers, str for text)."""
    return (event, params)


FUNNELS = [
    ("Explorer: from the model to the Playground", "deviceCategory",
     [step("atlas_ready"), step("structure_selected"), step("structure_isolated"), step("playground_opened")]),
    ("Homepage pins: offered → shown → opened → sent to vote", None,
     [step("home_pins_offered"), step("home_pins_shown"), step("home_pin_selected"), step("playground_opened", source="home_pin")]),
    ("Playground: first contribution (practice excluded)", "deviceCategory",
     [step("playground_view"), step("feature_opened"), step("draft_started", practice=0), step("pin_placed", practice=0),
      step("sign_in_prompted"), step("sign_in_completed"), step("pin_saved")]),
    ("Shared links: opened → revealed → explored", None,
     [step("share_link_opened"), step("shared_pin_revealed"), step("structure_selected")]),
]

# (title, dimensions, metrics, event names to keep or None, row limit)
REPORTS = [
    ("All events", ["eventName"], ["eventCount", "totalUsers"], None, 100),
    ("Practice run (coach marks were on until 7 Oct)", ["eventName", "customEvent:source", "customEvent:step"], ["eventCount", "totalUsers"],
     ["practice_started", "practice_step", "practice_completed", "practice_skipped", "practice_offer_shown", "practice_offer_accepted"], 60),
    ("How people reach the Playground", ["eventName", "customEvent:source", "customEvent:entry"], ["eventCount", "totalUsers"],
     ["playground_opened", "playground_view"], 40),
    ("Most opened structures", ["customEvent:structure_id"], ["eventCount", "totalUsers"], ["structure_selected"], 30),
    ("Search shapes", ["customEvent:query_kind"], ["eventCount"], ["search_performed"], 20),
    ("Devices and load time", ["deviceCategory"], ["totalUsers", "newUsers", "averageCustomEvent:duration_ms"], ["atlas_ready"], 10),
    ("Where visits come from", ["sessionSource", "sessionMedium"], ["sessions", "totalUsers"], None, 25),
    ("Countries", ["country"], ["totalUsers", "newUsers"], None, 15),
]


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out)


def run_reports(prop, start, end):
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (Cohort, CohortSpec, CohortsRange, DateRange, Dimension, Filter,
                                                    FilterExpression, Metric, OrderBy, RunReportRequest)
    data, parts = BetaAnalyticsDataClient(), [f"# AnatomyGo usage, {start} to {end}\n", f"Property {prop}, stream {MEASUREMENT_ID}.\n"]
    parts += run_funnels(prop, start, end)
    for title, dims, metrics, events, limit in REPORTS:
        try:
            req = RunReportRequest(property=f"properties/{prop}", date_ranges=[DateRange(start_date=start, end_date=end)],
                                   dimensions=[Dimension(name=d) for d in dims], metrics=[Metric(name=m) for m in metrics],
                                   order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=metrics[0]), desc=True)], limit=limit)
            if events:
                req.dimension_filter = FilterExpression(filter=Filter(field_name="eventName", in_list_filter=Filter.InListFilter(values=events)))
            res = data.run_report(req)
            rows = [[v.value for v in r.dimension_values] + [v.value for v in r.metric_values] for r in res.rows]
            parts.append(f"## {title}\n\n" + (table(dims + metrics, rows) if rows else "_No data._") + "\n")
        except Exception as e:  # noqa: BLE001 — one failing report must not hide the others
            parts.append(f"## {title}\n\n_Not available: {str(e).splitlines()[0]}_\n")
    # Weekly return: of the people whose first visit fell in each week, how many came back in later weeks.
    try:
        first = date.fromisoformat(start)
        weeks = [first + timedelta(days=7 * i) for i in range(4) if first + timedelta(days=7 * i) <= date.today()]
        res = data.run_report(RunReportRequest(property=f"properties/{prop}", dimensions=[Dimension(name="cohort"), Dimension(name="cohortNthWeek")],
                                               metrics=[Metric(name="cohortActiveUsers")], cohort_spec=CohortSpec(
            cohorts=[Cohort(name=f"from {w}", dimension="firstSessionDate", date_range=DateRange(start_date=str(w), end_date=str(w + timedelta(days=6)))) for w in weeks],
            cohorts_range=CohortsRange(granularity=CohortsRange.Granularity.WEEKLY, start_offset=0, end_offset=3))))
        rows = sorted([[v.value for v in r.dimension_values] + [v.value for v in r.metric_values] for r in res.rows])
        parts.append("## Weekly return of new visitors\n\n" + (table(["cohort", "week", "active users"], rows) if rows else "_No data._") + "\n")
    except Exception as e:  # noqa: BLE001
        parts.append(f"## Weekly return of new visitors\n\n_Not available: {str(e).splitlines()[0]}_\n")
    return "\n".join(parts)


def run_funnels(prop, start, end):
    from google.analytics.data_v1alpha import AlphaAnalyticsDataClient
    from google.analytics.data_v1alpha.types import (DateRange, Dimension, Funnel, FunnelBreakdown, FunnelEventFilter,
                                                     FunnelFilterExpression, FunnelParameterFilter,
                                                     FunnelParameterFilterExpression, FunnelParameterFilterExpressionList,
                                                     FunnelStep, NumericFilter, NumericValue, RunFunnelReportRequest,
                                                     StringFilter)
    client, parts = AlphaAnalyticsDataClient(), []

    def condition(name, value):
        if isinstance(value, int):
            f = FunnelParameterFilter(event_parameter_name=name, numeric_filter=NumericFilter(
                operation=NumericFilter.Operation.EQUAL, value=NumericValue(int64_value=value)))
        else:
            f = FunnelParameterFilter(event_parameter_name=name, string_filter=StringFilter(
                match_type=StringFilter.MatchType.EXACT, value=value))
        return FunnelParameterFilterExpression(funnel_parameter_filter=f)

    for title, breakdown, steps in FUNNELS:
        try:
            funnel_steps = []
            for event, params in steps:
                event_filter = FunnelEventFilter(event_name=event)
                if params:
                    conditions = [condition(k, v) for k, v in params.items()]
                    event_filter.funnel_parameter_filter_expression = conditions[0] if len(conditions) == 1 else \
                        FunnelParameterFilterExpression(and_group=FunnelParameterFilterExpressionList(expressions=conditions))
                label = event + "".join(f" ({k}={v})" for k, v in params.items())
                funnel_steps.append(FunnelStep(name=label, filter_expression=FunnelFilterExpression(funnel_event_filter=event_filter)))
            req = RunFunnelReportRequest(property=f"properties/{prop}", date_ranges=[DateRange(start_date=start, end_date=end)],
                                         funnel=Funnel(is_open_funnel=True, steps=funnel_steps))
            if breakdown:
                req.funnel_breakdown = FunnelBreakdown(breakdown_dimension=Dimension(name=breakdown), limit=5)
            sub = client.run_funnel_report(req).funnel_table
            headers = [h.name for h in sub.dimension_headers] + [h.name for h in sub.metric_headers]
            rows = [[v.value for v in r.dimension_values] + [v.value for v in r.metric_values] for r in sub.rows]
            parts.append(f"## Funnel · {title}\n\nOpen funnel: people can join at any step.\n\n" + (table(headers, rows) if rows else "_No data._") + "\n")
        except Exception as e:  # noqa: BLE001
            parts.append(f"## Funnel · {title}\n\n_Not available: {str(e).splitlines()[0]}_\n")
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["setup", "report"])
    parser.add_argument("--property", default=os.environ.get("GA_PROPERTY_ID"))
    parser.add_argument("--dry-run", action="store_true", help="setup: list what would be registered")
    parser.add_argument("--start", default="2026-09-26", help="report: first day (the site's statistics began on 26 Sept 2026)")
    parser.add_argument("--end", default="today")
    parser.add_argument("--out", help="report: write Markdown here instead of printing it")
    args = parser.parse_args()
    prop = find_property(args.property)
    if args.command == "setup":
        setup(prop, args.dry_run)
        return
    text = run_reports(prop, args.start, args.end)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text)
        print(f"Wrote {args.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
