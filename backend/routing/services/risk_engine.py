"""
Risk evaluation engine for checkpoint weather analysis and load-dependent escalations.
"""

from typing import Any, Dict, List, Optional
from routing.constants import (
    RiskLevel,
    RISK_SCORES,
    WIND_MODERATE_MIN,
    WIND_HIGH_MIN,
    WIND_SEVERE_MIN,
    WIND_NO_TRAVEL_MIN,
    RAIN_MODERATE_MIN,
    RAIN_HIGH_MIN,
    RAIN_SEVERE_MIN,
    RAIN_NO_TRAVEL_MIN,
    SNOW_MODERATE_MIN,
    SNOW_HIGH_MIN,
    SNOW_SEVERE_MIN,
    SNOW_NO_TRAVEL_MIN,
    LOAD_HEAVY_WIND_THRESHOLD_LB,
    LOAD_MEDIUM_WIND_THRESHOLD_LB,
)


def classify_wind(wind_mph: float) -> RiskLevel:
    """
    Classify wind speed in mph.
    Low <25, Moderate 25–34, High 35–44, Severe 45–54, No Travel ≥55
    """
    if wind_mph >= WIND_NO_TRAVEL_MIN:
        return RiskLevel.NO_TRAVEL
    if wind_mph >= WIND_SEVERE_MIN:
        return RiskLevel.SEVERE
    if wind_mph >= WIND_HIGH_MIN:
        return RiskLevel.HIGH
    if wind_mph >= WIND_MODERATE_MIN:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_rain(rain_in_hr: float) -> RiskLevel:
    """
    Classify rain intensity in inches/hour.
    Low <0.10, Moderate 0.10–0.25, High 0.25–0.50, Severe 0.50–1.00, No Travel >1.00
    Note: rain exactly equal to 1.00 is Severe; strictly >1.00 is No Travel.
    """
    if rain_in_hr > RAIN_NO_TRAVEL_MIN:
        return RiskLevel.NO_TRAVEL
    if rain_in_hr >= RAIN_SEVERE_MIN:
        return RiskLevel.SEVERE
    if rain_in_hr >= RAIN_HIGH_MIN:
        return RiskLevel.HIGH
    if rain_in_hr >= RAIN_MODERATE_MIN:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_snow(snow_in_hr: float) -> RiskLevel:
    """
    Classify snowfall intensity in inches/hour.
    Low <0.5, Moderate 0.5–1.0, High 1.0–2.0, Severe 2.0–3.0, No Travel >3.0
    Note: snow exactly equal to 3.0 is Severe; strictly >3.0 is No Travel.
    """
    if snow_in_hr > SNOW_NO_TRAVEL_MIN:
        return RiskLevel.NO_TRAVEL
    if snow_in_hr >= SNOW_SEVERE_MIN:
        return RiskLevel.SEVERE
    if snow_in_hr >= SNOW_HIGH_MIN:
        return RiskLevel.HIGH
    if snow_in_hr >= SNOW_MODERATE_MIN:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def max_risk_level(*levels: RiskLevel) -> RiskLevel:
    """Return the highest severity among provided risk levels."""
    return max(levels, key=lambda lvl: lvl.score)


def evaluate_checkpoint_risk(
    wind_mph: float,
    rain_in_hr: float,
    snow_in_hr: float,
    load_weight_lb: float,
) -> Dict[str, Any]:
    """
    Evaluate weather conditions at a single checkpoint, applying baseline weather rules
    followed by truck load-weight escalation rules.

    Load rules:
    - wind >= 55 mph -> No Travel for any load
    - wind 45–54 mph AND load > 30,000 lb -> No Travel
    - wind 35–44 mph AND load > 40,000 lb -> Severe (or higher if already higher)
    """
    wind_risk = classify_wind(wind_mph)
    rain_risk = classify_rain(rain_in_hr)
    snow_risk = classify_snow(snow_in_hr)

    base_risk = max_risk_level(wind_risk, rain_risk, snow_risk)
    final_risk = base_risk

    reasons: List[str] = []
    if wind_risk != RiskLevel.LOW:
        reasons.append(f"Wind {wind_mph:.1f} mph ({wind_risk.value})")
    if rain_risk != RiskLevel.LOW:
        reasons.append(f"Rain {rain_in_hr:.2f} in/hr ({rain_risk.value})")
    if snow_risk != RiskLevel.LOW:
        reasons.append(f"Snow {snow_in_hr:.2f} in/hr ({snow_risk.value})")

    load_escalated = False
    escalation_reason: Optional[str] = None

    # Load escalation rule 1: wind >= 55 mph -> No Travel for any load
    if wind_mph >= WIND_NO_TRAVEL_MIN:
        final_risk = RiskLevel.NO_TRAVEL
        if base_risk != RiskLevel.NO_TRAVEL:
            load_escalated = True
            escalation_reason = "Wind >= 55 mph imposes mandatory No Travel for all loads"

    # Load escalation rule 2: wind 45-54 mph AND load > 30,000 lb -> No Travel
    elif (WIND_SEVERE_MIN <= wind_mph < WIND_NO_TRAVEL_MIN) and (load_weight_lb > LOAD_HEAVY_WIND_THRESHOLD_LB):
        final_risk = RiskLevel.NO_TRAVEL
        load_escalated = True
        escalation_reason = (
            f"Wind {wind_mph:.1f} mph (45–54 mph) with heavy load {load_weight_lb:,.0f} lb "
            f"(> 30,000 lb) escalated to No Travel due to high blowover risk"
        )
        reasons.append(escalation_reason)

    # Load escalation rule 3: wind 35-44 mph AND load > 40,000 lb -> Severe
    elif (WIND_HIGH_MIN <= wind_mph < WIND_SEVERE_MIN) and (load_weight_lb > LOAD_MEDIUM_WIND_THRESHOLD_LB):
        if final_risk.score < RiskLevel.SEVERE.score:
            final_risk = RiskLevel.SEVERE
            load_escalated = True
            escalation_reason = (
                f"Wind {wind_mph:.1f} mph (35–44 mph) with load {load_weight_lb:,.0f} lb "
                f"(> 40,000 lb) escalated to Severe risk"
            )
            reasons.append(escalation_reason)

    if not reasons:
        reasons.append("Optimal conditions: mild wind, clear precipitation")

    return {
        "risk_level": final_risk.value,
        "risk_score": final_risk.score,
        "base_risk_level": base_risk.value,
        "wind_risk": wind_risk.value,
        "rain_risk": rain_risk.value,
        "snow_risk": snow_risk.value,
        "reasons": reasons,
        "load_escalated": load_escalated,
        "escalation_reason": escalation_reason,
    }
