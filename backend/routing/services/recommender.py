"""
Route metrics calculation and strict lexicographical recommendation engine.
"""

from typing import Any, Dict, List, Tuple
from routing.constants import RiskLevel, RISK_SCORES


def compute_route_summary(checkpoints: List[Dict[str, Any]], total_distance_mi: float) -> Dict[str, Any]:
    """
    Compute route-level risk metrics:
    - miles at each risk level (sum of segment_miles for checkpoints at that level)
    - severe miles, high miles, no travel miles
    - distance-weighted average risk score
    - has_no_travel flag
    - max_risk level
    """
    miles_by_risk: Dict[str, float] = {
        RiskLevel.LOW.value: 0.0,
        RiskLevel.MODERATE.value: 0.0,
        RiskLevel.HIGH.value: 0.0,
        RiskLevel.SEVERE.value: 0.0,
        RiskLevel.NO_TRAVEL.value: 0.0,
    }

    weighted_score_sum = 0.0
    total_segment_miles = 0.0
    max_risk = RiskLevel.LOW

    for cp in checkpoints:
        risk_lvl = cp.get("risk_level", RiskLevel.LOW.value)
        seg_miles = float(cp.get("segment_miles", 0.0))
        score = RISK_SCORES.get(risk_lvl, 1)

        miles_by_risk[risk_lvl] = round(miles_by_risk.get(risk_lvl, 0.0) + seg_miles, 2)
        weighted_score_sum += seg_miles * score
        total_segment_miles += seg_miles

        if score > max_risk.score:
            for lvl in RiskLevel:
                if lvl.value == risk_lvl:
                    max_risk = lvl
                    break

    dist_for_avg = total_segment_miles if total_segment_miles > 0 else (total_distance_mi or 1.0)
    avg_risk = round(weighted_score_sum / dist_for_avg, 2)

    has_no_travel = miles_by_risk[RiskLevel.NO_TRAVEL.value] > 0.0

    return {
        "miles_by_risk": miles_by_risk,
        "severe_miles": miles_by_risk[RiskLevel.SEVERE.value],
        "high_miles": miles_by_risk[RiskLevel.HIGH.value],
        "no_travel_miles": miles_by_risk[RiskLevel.NO_TRAVEL.value],
        "moderate_miles": miles_by_risk[RiskLevel.MODERATE.value],
        "low_miles": miles_by_risk[RiskLevel.LOW.value],
        "avg_risk": avg_risk,
        "max_risk": max_risk.value,
        "has_no_travel": has_no_travel,
        "total_distance_miles": round(total_distance_mi, 1),
    }


def format_duration(seconds: float) -> str:
    """Format duration seconds into human-readable 'Xh Ym'."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def rank_and_recommend_routes(routes: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Select the optimal route based on strict lexicographical priority:
    1) Exclude/penalize routes containing No Travel (if all have No Travel, pick least bad with warning).
    2) Fewest Severe miles.
    3) Fewest High miles.
    4) Lowest average risk score.
    5) Shortest travel time (duration).

    Returns:
        (recommendation_result, comparison_table)
    """
    if not routes:
        return {
            "route_id": None,
            "explanation": "No routes available to evaluate.",
            "all_no_travel": False,
        }, []

    def route_sort_key(route: Dict[str, Any]) -> Tuple[int, float, float, float, float, float]:
        summary = route["summary"]
        has_nt = 1 if summary["has_no_travel"] else 0
        nt_miles = summary["no_travel_miles"]
        severe_m = summary["severe_miles"]
        high_m = summary["high_miles"]
        avg_r = summary["avg_risk"]
        dur = float(route.get("duration_seconds", 0.0))
        return (has_nt, nt_miles, severe_m, high_m, avg_r, dur)

    sorted_routes = sorted(routes, key=route_sort_key)
    winner = sorted_routes[0]
    winner_id = winner["id"]
    all_no_travel = all(r["summary"]["has_no_travel"] for r in routes)

    # Mark recommended flag on all routes
    for r in routes:
        r["recommended"] = (r["id"] == winner_id)

    # Build detailed explanation
    w_sum = winner["summary"]
    w_dur = format_duration(winner.get("duration_seconds", 0.0))
    w_dist = winner.get("distance_miles", 0.0)

    if all_no_travel:
        explanation = (
            f"WARNING: All {len(routes)} routes encounter severe 'No Travel' weather hazards. "
            f"'{winner.get('name', winner_id)}' is recommended as the least hazardous option with "
            f"{w_sum['no_travel_miles']:.1f} No Travel miles (vs "
            + ", ".join(f"{r['summary']['no_travel_miles']:.1f} mi on {r.get('name', r['id'])}" for r in sorted_routes[1:])
            + f"). Consider delaying departure or rerouting."
        )
    else:
        reasons_list: List[str] = []
        if w_sum["no_travel_miles"] == 0:
            routes_with_nt = [r for r in routes if r["summary"]["has_no_travel"]]
            if routes_with_nt:
                reasons_list.append(f"completely avoids No Travel hazards present on {len(routes_with_nt)} alternative(s)")
            else:
                reasons_list.append("has 0.0 No Travel miles")

        if len(sorted_routes) > 1:
            runner_up = sorted_routes[1]
            ru_sum = runner_up["summary"]

            if w_sum["severe_miles"] < ru_sum["severe_miles"]:
                reasons_list.append(
                    f"has only {w_sum['severe_miles']:.1f} Severe miles vs {ru_sum['severe_miles']:.1f} on {runner_up.get('name', runner_up['id'])}"
                )
            elif w_sum["high_miles"] < ru_sum["high_miles"]:
                reasons_list.append(
                    f"tied on Severe miles but has fewer High risk miles ({w_sum['high_miles']:.1f} vs {ru_sum['high_miles']:.1f})"
                )
            elif w_sum["avg_risk"] < ru_sum["avg_risk"]:
                reasons_list.append(
                    f"has a lower average risk score ({w_sum['avg_risk']} vs {ru_sum['avg_risk']})"
                )
            elif winner.get("duration_seconds", 0) < runner_up.get("duration_seconds", 0):
                reasons_list.append(
                    f"has matching safety metrics but offers faster travel time ({w_dur} vs {format_duration(runner_up.get('duration_seconds', 0))})"
                )

        if not reasons_list:
            reasons_list.append(f"lowest overall risk score of {w_sum['avg_risk']}")

        explanation = (
            f"{winner.get('name', winner_id)} is recommended: "
            + "; ".join(reasons_list)
            + f". Total trip: {w_dist:.1f} miles, {w_dur}."
        )

    # Build comparison table
    comparison_table = [
        {
            "route_id": r["id"],
            "name": r.get("name", f"Route {r['id']}"),
            "distance_miles": round(r.get("distance_miles", 0.0), 1),
            "duration": format_duration(r.get("duration_seconds", 0.0)),
            "duration_seconds": r.get("duration_seconds", 0.0),
            "severe_miles": r["summary"]["severe_miles"],
            "high_miles": r["summary"]["high_miles"],
            "no_travel_miles": r["summary"]["no_travel_miles"],
            "avg_risk": r["summary"]["avg_risk"],
            "max_risk": r["summary"]["max_risk"],
            "recommended": (r["id"] == winner_id),
        }
        for r in routes
    ]

    recommendation = {
        "route_id": winner_id,
        "route_name": winner.get("name", winner_id),
        "explanation": explanation,
        "all_no_travel": all_no_travel,
        "winner_summary": w_sum,
    }

    return recommendation, comparison_table
