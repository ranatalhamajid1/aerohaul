"""
Geocoding service using Nominatim (OpenStreetMap) with fallback and caching.
"""

import logging
from typing import Any, Dict, List, Optional
import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

USER_AGENT = "WeatherAwareTruckRouter/1.0 (dispatch-safety-eval)"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"

# Curated fallback coordinates for major North American freight logistics hubs
KNOWN_HUBS: Dict[str, Dict[str, Any]] = {
    "chicago": {
        "display_name": "Chicago, Cook County, Illinois, United States",
        "lat": 41.8781,
        "lng": -87.6298,
    },
    "denver": {
        "display_name": "Denver, Colorado, United States",
        "lat": 39.7392,
        "lng": -104.9903,
    },
    "dallas": {
        "display_name": "Dallas, Dallas County, Texas, United States",
        "lat": 32.7767,
        "lng": -96.7970,
    },
    "atlanta": {
        "display_name": "Atlanta, Fulton County, Georgia, United States",
        "lat": 33.7490,
        "lng": -84.3880,
    },
    "los angeles": {
        "display_name": "Los Angeles, Los Angeles County, California, United States",
        "lat": 34.0522,
        "lng": -118.2437,
    },
    "new york": {
        "display_name": "New York, United States",
        "lat": 40.7128,
        "lng": -74.0060,
    },
    "seattle": {
        "display_name": "Seattle, King County, Washington, United States",
        "lat": 47.6062,
        "lng": -122.3321,
    },
    "kansas city": {
        "display_name": "Kansas City, Jackson County, Missouri, United States",
        "lat": 39.0997,
        "lng": -94.5786,
    },
    "omaha": {
        "display_name": "Omaha, Douglas County, Nebraska, United States",
        "lat": 41.2565,
        "lng": -95.9345,
    },
}


def geocode_location(query: str) -> Optional[Dict[str, Any]]:
    """
    Geocode an address or city query to {display_name, lat, lng}.
    Checks cache first, then calls Nominatim API, falls back to known hubs if offline.
    """
    query_clean = query.strip()
    if not query_clean:
        return None

    cache_key = f"geocode:{query_clean.lower()}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Check known hubs
    for hub_name, hub_data in KNOWN_HUBS.items():
        if query_clean.lower() == hub_name or query_clean.lower().startswith(hub_name + ","):
            result = {
                "display_name": hub_data["display_name"],
                "lat": hub_data["lat"],
                "lng": hub_data["lng"],
            }
            cache.set(cache_key, result, timeout=86400)
            return result

    try:
        response = requests.get(
            NOMINATIM_SEARCH_URL,
            params={
                "q": query_clean,
                "format": "json",
                "limit": 1,
                "addressdetails": 1,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            if data:
                top = data[0]
                result = {
                    "display_name": top.get("display_name", query_clean),
                    "lat": float(top["lat"]),
                    "lng": float(top["lon"]),
                }
                cache.set(cache_key, result, timeout=86400)
                return result
    except Exception as exc:
        logger.warning("Geocoding request failed for %s: %s", query_clean, exc)

    # Partial match fallback
    for hub_name, hub_data in KNOWN_HUBS.items():
        if hub_name in query_clean.lower():
            return {
                "display_name": hub_data["display_name"],
                "lat": hub_data["lat"],
                "lng": hub_data["lng"],
            }

    return None


def search_locations(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search multiple suggestions for address autocomplete in the frontend.
    """
    query_clean = query.strip()
    if len(query_clean) < 2:
        return []

    cache_key = f"geocode_search:{query_clean.lower()}:{limit}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    suggestions: List[Dict[str, Any]] = []

    try:
        response = requests.get(
            NOMINATIM_SEARCH_URL,
            params={
                "q": query_clean,
                "format": "json",
                "limit": limit,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=4,
        )
        if response.status_code == 200:
            for item in response.json():
                suggestions.append({
                    "display_name": item.get("display_name"),
                    "lat": float(item["lat"]),
                    "lng": float(item["lon"]),
                })
    except Exception as exc:
        logger.warning("Location search failed for %s: %s", query_clean, exc)

    if not suggestions:
        # Fallback to matching known hubs
        for hub_name, hub_data in KNOWN_HUBS.items():
            if query_clean.lower() in hub_name or hub_name in query_clean.lower():
                suggestions.append({
                    "display_name": hub_data["display_name"],
                    "lat": hub_data["lat"],
                    "lng": hub_data["lng"],
                })

    cache.set(cache_key, suggestions, timeout=3600)
    return suggestions
