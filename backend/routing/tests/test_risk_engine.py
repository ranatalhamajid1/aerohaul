"""
Comprehensive unit tests for the risk engine, threshold boundaries, and load escalation rules.
"""

import pytest
from routing.constants import RiskLevel
from routing.services.risk_engine import (
    classify_wind,
    classify_rain,
    classify_snow,
    evaluate_checkpoint_risk,
)


class TestWindClassification:
    @pytest.mark.parametrize(
        "speed, expected",
        [
            (0.0, RiskLevel.LOW),
            (10.5, RiskLevel.LOW),
            (24.9, RiskLevel.LOW),
            # Boundary: 25.0
            (25.0, RiskLevel.MODERATE),
            (30.0, RiskLevel.MODERATE),
            (34.9, RiskLevel.MODERATE),
            # Boundary: 35.0
            (35.0, RiskLevel.HIGH),
            (40.0, RiskLevel.HIGH),
            (44.9, RiskLevel.HIGH),
            # Boundary: 45.0
            (45.0, RiskLevel.SEVERE),
            (50.0, RiskLevel.SEVERE),
            (54.99, RiskLevel.SEVERE),
            # Boundary: 55.0
            (55.0, RiskLevel.NO_TRAVEL),
            (65.0, RiskLevel.NO_TRAVEL),
            (100.0, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_wind_threshold_boundaries(self, speed: float, expected: RiskLevel):
        assert classify_wind(speed) == expected


class TestRainClassification:
    @pytest.mark.parametrize(
        "rain, expected",
        [
            (0.0, RiskLevel.LOW),
            (0.05, RiskLevel.LOW),
            (0.099, RiskLevel.LOW),
            # Boundary: 0.10
            (0.10, RiskLevel.MODERATE),
            (0.18, RiskLevel.MODERATE),
            (0.249, RiskLevel.MODERATE),
            # Boundary: 0.25
            (0.25, RiskLevel.HIGH),
            (0.35, RiskLevel.HIGH),
            (0.499, RiskLevel.HIGH),
            # Boundary: 0.50
            (0.50, RiskLevel.SEVERE),
            (0.75, RiskLevel.SEVERE),
            (1.00, RiskLevel.SEVERE),  # exactly 1.00 is Severe
            # Boundary: > 1.00 is No Travel
            (1.001, RiskLevel.NO_TRAVEL),
            (1.50, RiskLevel.NO_TRAVEL),
            (2.50, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_rain_threshold_boundaries(self, rain: float, expected: RiskLevel):
        assert classify_rain(rain) == expected


class TestSnowClassification:
    @pytest.mark.parametrize(
        "snow, expected",
        [
            (0.0, RiskLevel.LOW),
            (0.2, RiskLevel.LOW),
            (0.499, RiskLevel.LOW),
            # Boundary: 0.50
            (0.50, RiskLevel.MODERATE),
            (0.8, RiskLevel.MODERATE),
            (0.999, RiskLevel.MODERATE),
            # Boundary: 1.00
            (1.00, RiskLevel.HIGH),
            (1.5, RiskLevel.HIGH),
            (1.999, RiskLevel.HIGH),
            # Boundary: 2.00
            (2.00, RiskLevel.SEVERE),
            (2.5, RiskLevel.SEVERE),
            (3.00, RiskLevel.SEVERE),  # exactly 3.00 is Severe
            # Boundary: > 3.00 is No Travel
            (3.001, RiskLevel.NO_TRAVEL),
            (3.5, RiskLevel.NO_TRAVEL),
            (5.0, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_snow_threshold_boundaries(self, snow: float, expected: RiskLevel):
        assert classify_snow(snow) == expected


class TestCheckpointEvaluationAndLoadEscalation:
    def test_worst_of_conditions_base_risk(self):
        # Wind Low (10), Rain Moderate (0.15), Snow Severe (2.2) -> Snow dominates
        res = evaluate_checkpoint_risk(wind_mph=10.0, rain_in_hr=0.15, snow_in_hr=2.2, load_weight_lb=20000)
        assert res["risk_level"] == RiskLevel.SEVERE.value
        assert res["risk_score"] == 4
        assert res["load_escalated"] is False

    def test_wind_no_travel_independent_of_load(self):
        # 55 mph wind is No Travel for empty (0 lb), light (20k lb), heavy (60k lb)
        for load in [0, 20000, 30000, 45000, 80000]:
            res = evaluate_checkpoint_risk(wind_mph=55.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lb=load)
            assert res["risk_level"] == RiskLevel.NO_TRAVEL.value
            assert res["risk_score"] == 5

    def test_load_escalation_wind_45_to_54_boundary(self):
        # Wind 48 mph is base Severe.
        # Rule: load > 30,000 triggers No Travel.
        # Boundary: 30,000 does NOT trigger escalation (> 30000 required).
        res_boundary = evaluate_checkpoint_risk(wind_mph=48.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lb=30000.0)
        assert res_boundary["risk_level"] == RiskLevel.SEVERE.value
        assert res_boundary["load_escalated"] is False

        # Load 30,001 lb DOES trigger escalation
        res_escalated = evaluate_checkpoint_risk(wind_mph=48.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lb=30001.0)
        assert res_escalated["risk_level"] == RiskLevel.NO_TRAVEL.value
        assert res_escalated["risk_score"] == 5
        assert res_escalated["load_escalated"] is True
        assert "blowover" in res_escalated["escalation_reason"].lower()

    def test_load_escalation_wind_35_to_44_boundary(self):
        # Wind 40 mph is base High.
        # Rule: load > 40,000 triggers Severe.
        # Boundary: 40,000 does NOT trigger escalation (> 40000 required).
        res_boundary = evaluate_checkpoint_risk(wind_mph=40.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lb=40000.0)
        assert res_boundary["risk_level"] == RiskLevel.HIGH.value
        assert res_boundary["load_escalated"] is False

        # Load 40,001 lb DOES trigger escalation to Severe
        res_escalated = evaluate_checkpoint_risk(wind_mph=40.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lb=40001.0)
        assert res_escalated["risk_level"] == RiskLevel.SEVERE.value
        assert res_escalated["risk_score"] == 4
        assert res_escalated["load_escalated"] is True

    def test_already_higher_risk_not_downgraded_by_load_rule(self):
        # Rain > 1.0 (No Travel). Wind 38 mph, load 50,000 lb.
        # The load rule for 38 mph + heavy load escalates to Severe,
        # but final risk must not be downgraded from No Travel.
        res = evaluate_checkpoint_risk(wind_mph=38.0, rain_in_hr=1.2, snow_in_hr=0.0, load_weight_lb=50000.0)
        assert res["risk_level"] == RiskLevel.NO_TRAVEL.value
        assert res["risk_score"] == 5
