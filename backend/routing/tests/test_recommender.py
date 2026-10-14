"""
Unit tests for the strict lexicographical route recommendation engine and route summary metrics.
"""

from routing.constants import RiskLevel
from routing.services.recommender import (
    compute_route_summary,
    rank_and_recommend_routes,
)


def make_route(route_id: str, name: str, distance: float, duration: float, checkpoints: list) -> dict:
    summary = compute_route_summary(checkpoints, distance)
    return {
        "id": route_id,
        "name": name,
        "distance_miles": distance,
        "duration_seconds": duration,
        "checkpoints": checkpoints,
        "summary": summary,
    }


class TestRecommenderLexicographicalRules:
    def test_rule_1_avoid_no_travel(self):
        # Route 1: 10 miles of No Travel, but otherwise fast (5 hours)
        cp1 = [
            {"mile": 0, "segment_miles": 10.0, "risk_level": RiskLevel.NO_TRAVEL.value},
            {"mile": 50, "segment_miles": 90.0, "risk_level": RiskLevel.LOW.value},
        ]
        r1 = make_route("r1", "Fast Route with Blizzard", 100.0, 18000.0, cp1)

        # Route 2: 0 No Travel, but 20 miles of High, slower (7 hours)
        cp2 = [
            {"mile": 0, "segment_miles": 20.0, "risk_level": RiskLevel.HIGH.value},
            {"mile": 50, "segment_miles": 80.0, "risk_level": RiskLevel.LOW.value},
        ]
        r2 = make_route("r2", "Safe Northern Bypass", 100.0, 25200.0, cp2)

        rec, table = rank_and_recommend_routes([r1, r2])
        assert rec["route_id"] == "r2"
        assert rec["all_no_travel"] is False
        assert "No Travel" in rec["explanation"]

    def test_rule_1_all_no_travel_fallback(self):
        # Both routes have No Travel, Route A has 5 miles vs Route B has 25 miles
        cpA = [
            {"mile": 0, "segment_miles": 5.0, "risk_level": RiskLevel.NO_TRAVEL.value},
            {"mile": 50, "segment_miles": 95.0, "risk_level": RiskLevel.LOW.value},
        ]
        rA = make_route("rA", "Route A (5 mi No Travel)", 100.0, 20000.0, cpA)

        cpB = [
            {"mile": 0, "segment_miles": 25.0, "risk_level": RiskLevel.NO_TRAVEL.value},
            {"mile": 50, "segment_miles": 75.0, "risk_level": RiskLevel.LOW.value},
        ]
        rB = make_route("rB", "Route B (25 mi No Travel)", 100.0, 19000.0, cpB)

        rec, table = rank_and_recommend_routes([rA, rB])
        assert rec["route_id"] == "rA"
        assert rec["all_no_travel"] is True
        assert "WARNING" in rec["explanation"]

    def test_rule_2_fewest_severe_miles(self):
        # Neither has No Travel. Route 1 has 5 Severe miles. Route 2 has 15 Severe miles.
        cp1 = [
            {"mile": 0, "segment_miles": 5.0, "risk_level": RiskLevel.SEVERE.value},
            {"mile": 50, "segment_miles": 95.0, "risk_level": RiskLevel.LOW.value},
        ]
        r1 = make_route("r1", "Route 1", 100.0, 22000.0, cp1)

        cp2 = [
            {"mile": 0, "segment_miles": 15.0, "risk_level": RiskLevel.SEVERE.value},
            {"mile": 50, "segment_miles": 85.0, "risk_level": RiskLevel.LOW.value},
        ]
        r2 = make_route("r2", "Route 2", 100.0, 20000.0, cp2)  # faster, but more severe miles

        rec, table = rank_and_recommend_routes([r1, r2])
        assert rec["route_id"] == "r1"
        assert "Severe miles" in rec["explanation"]

    def test_rule_3_fewest_high_miles_when_severe_tied(self):
        # Both have 0 Severe miles. Route 1 has 10 High miles. Route 2 has 20 High miles.
        cp1 = [
            {"mile": 0, "segment_miles": 10.0, "risk_level": RiskLevel.HIGH.value},
            {"mile": 50, "segment_miles": 90.0, "risk_level": RiskLevel.LOW.value},
        ]
        r1 = make_route("r1", "Route 1", 100.0, 22000.0, cp1)

        cp2 = [
            {"mile": 0, "segment_miles": 20.0, "risk_level": RiskLevel.HIGH.value},
            {"mile": 50, "segment_miles": 80.0, "risk_level": RiskLevel.LOW.value},
        ]
        r2 = make_route("r2", "Route 2", 100.0, 20000.0, cp2)

        rec, table = rank_and_recommend_routes([r1, r2])
        assert rec["route_id"] == "r1"
        assert "High" in rec["explanation"]

    def test_rule_4_lowest_average_risk_when_severe_and_high_tied(self):
        # Both have 0 Severe and 0 High miles.
        # Route 1 has 100 miles of Low (score = 1.0)
        # Route 2 has 50 miles of Moderate + 50 miles of Low (score = 1.5)
        cp1 = [{"mile": 0, "segment_miles": 100.0, "risk_level": RiskLevel.LOW.value}]
        r1 = make_route("r1", "Route 1", 100.0, 22000.0, cp1)

        cp2 = [
            {"mile": 0, "segment_miles": 50.0, "risk_level": RiskLevel.MODERATE.value},
            {"mile": 50, "segment_miles": 50.0, "risk_level": RiskLevel.LOW.value},
        ]
        r2 = make_route("r2", "Route 2", 100.0, 21000.0, cp2)

        rec, table = rank_and_recommend_routes([r1, r2])
        assert rec["route_id"] == "r1"
        assert rec["winner_summary"]["avg_risk"] == 1.0

    def test_rule_5_shortest_duration_when_risk_metrics_tied(self):
        # All risk levels identical. Route 1 duration 18000s (5h). Route 2 duration 21600s (6h).
        cp1 = [{"mile": 0, "segment_miles": 100.0, "risk_level": RiskLevel.LOW.value}]
        r1 = make_route("r1", "Faster Route", 100.0, 18000.0, cp1)

        cp2 = [{"mile": 0, "segment_miles": 100.0, "risk_level": RiskLevel.LOW.value}]
        r2 = make_route("r2", "Slower Route", 100.0, 21600.0, cp2)

        rec, table = rank_and_recommend_routes([r1, r2])
        assert rec["route_id"] == "r1"
        assert "Faster Route" in rec["explanation"]
