"""
Corridor weather heatmap generator.
Generates an evenly sampled spatial grid covering the trip corridor buffer (~30-50 miles),
evaluates weather forecast at hour offset (0..48h), and returns intensity data for the frontend canvas/heatmap.
"""

from datetime import datetime, timezone, timedelta
import logging
import math
from typing import Any, Dict, List, Optional, Tuple
from django.core.cache import cache
from routing.constants import RiskLevel, RISK_SCORES
from routing.services.risk_engine import evaluate_checkpoint_risk
from routing.services.weather import (
    get_closest_iso_hour,
    _get_cache_key,
    _fetch_open_meteo_chunk,
    _fallback_weather_estimate,
    BATCH_CHUNK_SIZE,
)

logger = logging.getLogger(__name__)


def generate_corridor_grid(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    grid_rows: int = 7,
    grid_cols: int = 10,
    buffer_deg: float = 0.5,
) -> List[Tuple[float, float]]:
    """
    Generate an evenly distributed grid of (lat, lng) points covering bounding box with a buffer.
    """
    south = min_lat - buffer_deg
    north = max_lat + buffer_deg
    west = min_lng - buffer_deg
    east = max_lng + buffer_deg

    d_lat = (north - south) / max(grid_rows - 1, 1)
    d_lng = (east - west) / max(grid_cols - 1, 1)

    points: List[Tuple[float, float]] = []
    for r in range(grid_rows):
        lat = round(south + r * d_lat, 4)
        for c in range(grid_cols):
            lng = round(west + c * d_lng, 4)
            points.append((lat, lng))

    return points


def get_heatmap_frame(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    forecast_hour: int = 0,
    departure_time: Optional[datetime] = None,
    load_weight_lb: float = 40000.0,
) -> Dict[str, Any]:
    """
    Get weather & risk intensity grid for the corridor at a specified forecast hour (0..48).
    """
    if departure_time is None:
        departure_time = datetime.now(timezone.utc)
    elif departure_time.tzinfo is None:
        departure_time = departure_time.replace(tzinfo=timezone.utc)

    target_time = departure_time + timedelta(hours=forecast_hour)
    target_iso_hour = get_closest_iso_hour(target_time)

    cache_key = (
        f"hm:{round(min_lat, 2)}:{round(min_lng, 2)}:{round(max_lat, 2)}:{round(max_lng, 2)}:"
        f"{forecast_hour}:{target_iso_hour}:{int(load_weight_lb)}"
    )
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Generate grid (e.g. 6x9 = 54 points)
    grid_pts = generate_corridor_grid(min_lat, min_lng, max_lat, max_lng, grid_rows=6, grid_cols=9)

    to_fetch: List[Tuple[float, float, str]] = []
    pt_weather_map: Dict[Tuple[float, float], Dict[str, Any]] = {}

    for lat, lng in grid_pts:
        ckey = _get_cache_key(lat, lng, target_iso_hour)
        w = cache.get(ckey)
        if w:
            pt_weather_map[(lat, lng)] = w
        else:
            to_fetch.append((lat, lng, target_iso_hour))

    if to_fetch:
        chunks = [
            to_fetch[i : i + BATCH_CHUNK_SIZE]
            for i in range(0, len(to_fetch), BATCH_CHUNK_SIZE)
        ]
        for chunk in chunks:
            chunk_results = _fetch_open_meteo_chunk(chunk)
            for (c_lat, c_lng, _), w in chunk_results.items():
                pt_weather_map[(c_lat, c_lng)] = w
                cache.set(_get_cache_key(c_lat, c_lng, target_iso_hour), w, timeout=3600)

    # Compile grid points with risk evaluation
    points_data: List[Dict[str, Any]] = []
    for lat, lng in grid_pts:
        w = pt_weather_map.get((lat, lng))
        if not w:
            w = _fallback_weather_estimate(lat, lng, target_time)

        wind = w.get("wind_mph", 0.0)
        rain = w.get("rain_in_hr", 0.0)
        snow = w.get("snow_in_hr", 0.0)
        temp = w.get("temperature_f", 60.0)

        risk_eval = evaluate_checkpoint_risk(
            wind_mph=wind,
            rain_in_hr=rain,
            snow_in_hr=snow,
            load_weight_lb=load_weight_lb,
        )

        # Intensity 0.0 - 1.0 for rendering
        risk_score = risk_eval["risk_score"]
        intensity = min(1.0, (risk_score - 1) / 4.0 + 0.15)

        points_data.append({
            "lat": lat,
            "lng": lng,
            "wind_mph": wind,
            "rain_in_hr": rain,
            "snow_in_hr": snow,
            "temperature_f": temp,
            "risk_level": risk_eval["risk_level"],
            "risk_score": risk_score,
            "intensity": round(intensity, 2),
            "reasons": risk_eval["reasons"],
        })

    result = {
        "forecast_hour": forecast_hour,
        "target_time": target_time.isoformat(),
        "points": points_data,
        "bounds": {
            "min_lat": min_lat,
            "min_lng": min_lng,
            "max_lat": max_lat,
            "max_lng": max_lng,
        },
    }

    cache.set(cache_key, result, timeout=1800)
    return result
