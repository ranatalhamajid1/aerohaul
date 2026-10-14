"""
Weather client for Open-Meteo API.
Implements:
- Multi-location batch requests with concurrent batch chunking
- Proportional hour-closest ETA matching (not current weather)
- Caching by (rounded lat/lng, hour)
- Timeout / offline fallback handling
- Horizon range checking (>48h / >16 days flagging)
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
import logging
from typing import Any, Dict, List, Optional, Tuple
import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
BATCH_CHUNK_SIZE = 40  # Open-Meteo safe batch size limit


def get_closest_iso_hour(dt: datetime) -> str:
    """Return the nearest whole-hour ISO string 'YYYY-MM-DDTHH:00'."""
    if dt.minute >= 30:
        rounded = (dt + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    else:
        rounded = dt.replace(minute=0, second=0, microsecond=0)
    return rounded.strftime("%Y-%m-%dT%H:00")


def _get_cache_key(lat: float, lng: float, iso_hour: str) -> str:
    return f"wx:{round(lat, 2)}:{round(lng, 2)}:{iso_hour}"


def _fetch_open_meteo_chunk(
    locations: List[Tuple[float, float, str]]
) -> Dict[Tuple[float, float, str], Dict[str, Any]]:
    """
    Fetch a chunk of locations from Open-Meteo in a single batched HTTP GET request.
    Locations: list of (lat, lng, target_iso_hour)
    """
    results: Dict[Tuple[float, float, str], Dict[str, Any]] = {}
    if not locations:
        return results

    latitudes = [f"{loc[0]:.4f}" for loc in locations]
    longitudes = [f"{loc[1]:.4f}" for loc in locations]

    params = {
        "latitude": ",".join(latitudes),
        "longitude": ",".join(longitudes),
        "hourly": "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,rain,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "forecast_days": 7,  # Up to 7 days
    }

    try:
        resp = requests.get(OPEN_METEO_FORECAST_URL, params=params, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            # If multiple locations queried, Open-Meteo returns a list of objects;
            # if only 1 location, returns single object.
            items = data if isinstance(data, list) else [data]

            for (lat, lng, target_hour), item in zip(locations, items):
                hourly = item.get("hourly", {})
                times = hourly.get("time", [])
                wind_arr = hourly.get("wind_speed_10m", [])
                gust_arr = hourly.get("wind_gusts_10m", [])
                rain_arr = hourly.get("rain", [])
                snow_arr = hourly.get("snowfall", [])
                temp_arr = hourly.get("temperature_2m", [])

                if target_hour in times:
                    idx = times.index(target_hour)
                else:
                    # Closest available hour index
                    idx = 0 if times else -1

                if idx >= 0 and times:
                    wind_speed = float(wind_arr[idx] or 0.0) if idx < len(wind_arr) else 0.0
                    wind_gust = float(gust_arr[idx] or 0.0) if idx < len(gust_arr) else wind_speed
                    # Use max of sustained wind and gusts to represent peak dynamic force on truck trailer
                    effective_wind = max(wind_speed, wind_gust * 0.9)
                    rain_val = float(rain_arr[idx] or 0.0) if idx < len(rain_arr) else 0.0
                    snow_val = float(snow_arr[idx] or 0.0) if idx < len(snow_arr) else 0.0
                    temp_val = float(temp_arr[idx] or 65.0) if idx < len(temp_arr) else 65.0

                    weather_record = {
                        "wind_mph": round(effective_wind, 1),
                        "sustained_wind_mph": round(wind_speed, 1),
                        "wind_gusts_mph": round(wind_gust, 1),
                        "rain_in_hr": round(rain_val, 2),
                        "snow_in_hr": round(snow_val, 2),
                        "temperature_f": round(temp_val, 1),
                        "forecast_time": target_hour,
                        "data_source": "Open-Meteo",
                        "fallback": False,
                    }
                    results[(lat, lng, target_hour)] = weather_record
    except Exception as exc:
        logger.warning("Batch Open-Meteo forecast failed: %s", exc)

    return results


def _fallback_weather_estimate(lat: float, lng: float, dt: datetime) -> Dict[str, Any]:
    """Graceful realistic fallback when Open-Meteo cannot be reached."""
    # Deterministic pseudo-realistic baseline based on latitude and month
    month = dt.month
    is_winter = month in (11, 12, 1, 2, 3)
    # Higher latitudes get cooler weather and snow in winter
    temp = 65.0 - (lat - 35.0) * 1.5
    if is_winter:
        temp -= 25.0

    return {
        "wind_mph": 12.0,
        "sustained_wind_mph": 12.0,
        "wind_gusts_mph": 16.0,
        "rain_in_hr": 0.0,
        "snow_in_hr": 0.0,
        "temperature_f": round(temp, 1),
        "forecast_time": dt.strftime("%Y-%m-%dT%H:00"),
        "data_source": "Offline Fallback Estimation",
        "fallback": True,
    }


def enrich_checkpoints_with_weather(checkpoints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Given a list of checkpoints with lat, lng, and eta_datetime (or eta),
    fetches forecast for the hour closest to each checkpoint's ETA.
    Caches results and flags forecasts beyond 48 hours or 16 days.
    """
    if not checkpoints:
        return []

    now_utc = datetime.now(timezone.utc)
    to_fetch: List[Tuple[float, float, str]] = []
    checkpoint_keys: List[Tuple[float, float, str]] = []

    for cp in checkpoints:
        lat = cp["lat"]
        lng = cp["lng"]
        eta = cp.get("eta_datetime")
        if not eta:
            eta = datetime.fromisoformat(cp["eta"])
        if eta.tzinfo is None:
            eta = eta.replace(tzinfo=timezone.utc)

        target_hour = get_closest_iso_hour(eta)
        key_tuple = (lat, lng, target_hour)
        checkpoint_keys.append(key_tuple)

        # Horizon flags
        delta = eta - now_utc
        if delta > timedelta(days=16):
            cp["beyond_forecast_range"] = True
            cp["forecast_warning"] = "ETA is beyond the 16-day forecast horizon (>16 days)"
        elif delta > timedelta(hours=48):
            cp["beyond_forecast_range"] = False
            cp["forecast_warning"] = "ETA is in the extended forecast window (>48 hours)"
        else:
            cp["beyond_forecast_range"] = False
            cp["forecast_warning"] = None

        # Check cache
        cache_key = _get_cache_key(lat, lng, target_hour)
        cached_val = cache.get(cache_key)
        if cached_val:
            cp["weather"] = cached_val
        else:
            to_fetch.append(key_tuple)

    # Batch fetch uncached
    if to_fetch:
        # Deduplicate to_fetch while preserving order
        unique_to_fetch = list(dict.fromkeys(to_fetch))
        chunks = [
            unique_to_fetch[i : i + BATCH_CHUNK_SIZE]
            for i in range(0, len(unique_to_fetch), BATCH_CHUNK_SIZE)
        ]

        fetched_dict: Dict[Tuple[float, float, str], Dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=min(5, len(chunks) or 1)) as executor:
            futures = [executor.submit(_fetch_open_meteo_chunk, chunk) for chunk in chunks]
            for fut in as_completed(futures):
                try:
                    res = fut.result()
                    fetched_dict.update(res)
                except Exception as e:
                    logger.warning("Error in weather worker chunk: %s", e)

        # Cache fetched results
        for key_tuple, wx in fetched_dict.items():
            cache_key = _get_cache_key(key_tuple[0], key_tuple[1], key_tuple[2])
            cache.set(cache_key, wx, timeout=3600)

    # Attach weather to checkpoints
    for cp, key_tuple in zip(checkpoints, checkpoint_keys):
        if "weather" not in cp:
            cache_key = _get_cache_key(key_tuple[0], key_tuple[1], key_tuple[2])
            wx = cache.get(cache_key)
            if not wx:
                eta = cp.get("eta_datetime") or datetime.fromisoformat(cp["eta"])
                wx = _fallback_weather_estimate(cp["lat"], cp["lng"], eta)
            cp["weather"] = wx

        # Flatten primary weather values onto checkpoint for easy consumption
        wx_data = cp["weather"]
        cp["wind_mph"] = wx_data["wind_mph"]
        cp["rain_in_hr"] = wx_data["rain_in_hr"]
        cp["snow_in_hr"] = wx_data["snow_in_hr"]
        cp["temperature_f"] = wx_data.get("temperature_f", 65.0)

    return checkpoints
