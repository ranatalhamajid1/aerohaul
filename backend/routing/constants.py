"""
Risk thresholds, load escalation limits, and scoring constants for weather-aware truck routing.
All thresholds strictly adhere to assessment specification:
- Wind (mph): Low <25, Moderate 25–34, High 35–44, Severe 45–54, No Travel ≥55
- Rain (in/hr): Low <0.10, Moderate 0.10–0.25, High 0.25–0.50, Severe 0.50–1.00, No Travel >1.00
- Snow (in/hr): Low <0.5, Moderate 0.5–1.0, High 1.0–2.0, Severe 2.0–3.0, No Travel >3.0
- Load rules:
  • wind ≥55 → No Travel for any load
  • wind 45–54 AND load >30,000 lb → No Travel
  • wind 35–44 AND load >40,000 lb → Severe
"""

from enum import Enum
from typing import Dict


class RiskLevel(str, Enum):
    LOW = "Low"
    MODERATE = "Moderate"
    HIGH = "High"
    SEVERE = "Severe"
    NO_TRAVEL = "No Travel"

    @property
    def score(self) -> int:
        return RISK_SCORES[self.value]


# Numeric scores for distance-weighted route averaging
RISK_SCORES: Dict[str, int] = {
    RiskLevel.LOW.value: 1,
    RiskLevel.MODERATE.value: 2,
    RiskLevel.HIGH.value: 3,
    RiskLevel.SEVERE.value: 4,
    RiskLevel.NO_TRAVEL.value: 5,
}

# Wind Speed Thresholds (mph)
WIND_MODERATE_MIN = 25.0
WIND_HIGH_MIN = 35.0
WIND_SEVERE_MIN = 45.0
WIND_NO_TRAVEL_MIN = 55.0

# Rain Intensity Thresholds (inches / hour)
RAIN_MODERATE_MIN = 0.10
RAIN_HIGH_MIN = 0.25
RAIN_SEVERE_MIN = 0.50
RAIN_NO_TRAVEL_MIN = 1.00  # Strictly > 1.00 triggers No Travel

# Snow Intensity Thresholds (inches / hour)
SNOW_MODERATE_MIN = 0.50
SNOW_HIGH_MIN = 1.00
SNOW_SEVERE_MIN = 2.00
SNOW_NO_TRAVEL_MIN = 3.00  # Strictly > 3.00 triggers No Travel

# Load Escalation Thresholds (lb)
LOAD_HEAVY_WIND_THRESHOLD_LB = 30000.0   # > 30,000 lb with wind 45-54 -> No Travel
LOAD_MEDIUM_WIND_THRESHOLD_LB = 40000.0  # > 40,000 lb with wind 35-44 -> Severe

# Default Checkpoint Interval Options (miles)
CHECKPOINT_INTERVAL_DEFAULT = 25
CHECKPOINT_INTERVAL_OPTIONS = (10, 25, 50)
