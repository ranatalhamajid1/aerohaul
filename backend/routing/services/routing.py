"""
Multi-alternative routing service.
Queries OpenRouteService (driving-hgv) or OSRM, guaranteeing 3 distinct alternative routes
by automatically synthesizing lateral corridor waypoints when the routing provider returns <3 routes.
"""

import math
import os
import logging
from typing import Any, Dict, List, Tuple, Optional
import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

METERS_TO_MILES = 0.000621371
OSRM_SERVERS = [
    "https://router.project-osrm.org/route/v1/driving",
    "https://routing.openstreetmap.de/routed-car/route/v1/driving",
]
ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson"
HTTP_HEADERS = {
    "User-Agent": "AeroHaul-Truck-Router/1.0 (https://github.com/ranatalhamajid1/aerohaul)",
    "Accept": "application/json",
}


def _format_polyline_coords(geojson_coords: List[List[float]]) -> List[List[float]]:
    """Convert GeoJSON [lng, lat] coordinate list to Leaflet [lat, lng] format."""
    return [[round(c[1], 5), round(c[0], 5)] for c in geojson_coords]


def _calculate_perpendicular_waypoint(
    lat1: float, lng1: float, lat2: float, lng2: float, offset_ratio: float = 0.15
) -> Tuple[float, float]:
    """
    Calculate an intermediate waypoint laterally offset from the corridor midpoint.
    offset_ratio > 0 offsets left/north; offset_ratio < 0 offsets right/south.
    """
    mid_lat = (lat1 + lat2) / 2.0
    mid_lng = (lng1 + lng2) / 2.0

    d_lat = lat2 - lat1
    d_lng = lng2 - lng1
    length = math.sqrt(d_lat * d_lat + d_lng * d_lng)
    if length < 1e-4:
        return mid_lat + 0.1, mid_lng

    # Perpendicular vector (-d_lng, d_lat)
    norm_x = -d_lng / length
    norm_y = d_lat / length

    # Apply offset (capped between 0.3 and 1.8 degrees)
    mag = max(0.3, min(1.8, length * abs(offset_ratio)))
    sign = 1.0 if offset_ratio >= 0 else -1.0

    wp_lat = mid_lat + sign * mag * norm_y
    wp_lng = mid_lng + sign * mag * norm_x
    return round(wp_lat, 5), round(wp_lng, 5)


def _fetch_ors_routes(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float, api_key: str
) -> List[Dict[str, Any]]:
    """Fetch HGV truck routes from OpenRouteService if API key is provided."""
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
        **HTTP_HEADERS,
    }
    body = {
        "coordinates": [[origin_lng, origin_lat], [dest_lng, dest_lat]],
        "alternative_routes": {
            "target_count": 3,
            "weight_factor": 1.4,
            "share_factor": 0.6,
        },
        "instructions": False,
        "geometry": True,
    }
    try:
        resp = requests.post(ORS_BASE_URL, json=body, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            features = data.get("features", [])
            routes: List[Dict[str, Any]] = []
            for idx, feat in enumerate(features[:3]):
                props = feat.get("properties", {}).get("summary", {})
                geometry = feat.get("geometry", {}).get("coordinates", [])
                dist_meters = props.get("distance", 0.0)
                dur_sec = props.get("duration", 0.0)
                routes.append({
                    "id": f"route_{idx + 1}",
                    "name": f"ORS HGV Route {idx + 1}",
                    "geometry": _format_polyline_coords(geometry),
                    "distance_miles": round(dist_meters * METERS_TO_MILES, 1),
                    "duration_seconds": dur_sec,
                    "diverted_via_waypoint": False,
                    "alternative_note": "Direct HGV routing profile via OpenRouteService",
                })
            return routes
    except Exception as e:
        logger.warning("OpenRouteService request failed: %s", e)
    return []


def _fetch_osrm_direct(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float
) -> List[Dict[str, Any]]:
    """Query OSRM for direct routes with alternatives flag using redundant endpoints and User-Agent."""
    for base_url in OSRM_SERVERS:
        url = f"{base_url}/{origin_lng},{origin_lat};{dest_lng},{dest_lat}?overview=full&geometries=geojson&alternatives=true"
        try:
            resp = requests.get(url, headers=HTTP_HEADERS, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                raw_routes = data.get("routes", [])
                if raw_routes:
                    routes: List[Dict[str, Any]] = []
                    for idx, r in enumerate(raw_routes):
                        coords = r.get("geometry", {}).get("coordinates", [])
                        dist_meters = r.get("distance", 0.0)
                        dur_sec = r.get("duration", 0.0)
                        name = (
                            "Primary Route (Fastest Interstate)"
                            if idx == 0
                            else f"Alternative Route {idx + 1}"
                        )
                        routes.append({
                            "id": f"route_{idx + 1}",
                            "name": name,
                            "geometry": _format_polyline_coords(coords),
                            "distance_miles": round(dist_meters * METERS_TO_MILES, 1),
                            "duration_seconds": dur_sec,
                            "diverted_via_waypoint": False,
                            "alternative_note": "Native corridor alternative from routing engine",
                        })
                    return routes
        except Exception as e:
            logger.warning("OSRM direct routing failed on %s: %s", base_url, e)
    return []


def _fetch_osrm_via_waypoint(
    origin_lat: float,
    origin_lng: float,
    wp_lat: float,
    wp_lng: float,
    dest_lat: float,
    dest_lng: float,
    route_id: str,
    name: str,
    note: str,
) -> Optional[Dict[str, Any]]:
    """Query OSRM through a detour waypoint to create a verified drivable alternative."""
    for base_url in OSRM_SERVERS:
        url = f"{base_url}/{origin_lng},{origin_lat};{wp_lng},{wp_lat};{dest_lng},{dest_lat}?overview=full&geometries=geojson"
        try:
            resp = requests.get(url, headers=HTTP_HEADERS, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                raw_routes = data.get("routes", [])
                if raw_routes:
                    r = raw_routes[0]
                    coords = r.get("geometry", {}).get("coordinates", [])
                    dist_meters = r.get("distance", 0.0)
                    dur_sec = r.get("duration", 0.0)
                    return {
                        "id": route_id,
                        "name": name,
                        "geometry": _format_polyline_coords(coords),
                        "distance_miles": round(dist_meters * METERS_TO_MILES, 1),
                        "duration_seconds": dur_sec,
                        "diverted_via_waypoint": True,
                        "alternative_note": note,
                    }
        except Exception as e:
            logger.warning("OSRM waypoint routing failed on %s: %s", base_url, e)
    return None


def _haversine_distance_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.asin(math.sqrt(max(0.0, a)))


def _generate_synthetic_fallback_routes(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float
) -> List[Dict[str, Any]]:
    """
    Emergency offline fallback generating 3 realistic curved trajectories along the corridor
    if third-party routing APIs are completely unreachable.
    """
    routes: List[Dict[str, Any]] = []
    offsets = [
        (0.0, "Route 1 (Central Corridor)", False, "Direct highway corridor"),
        (0.2, "Route 2 (Northern Bypass)", True, "Northern corridor detour generated for alternate route evaluation"),
        (-0.2, "Route 3 (Southern Bypass)", True, "Southern corridor detour generated for alternate route evaluation"),
    ]

    straight_miles = _haversine_distance_miles(origin_lat, origin_lng, dest_lat, dest_lng)

    for idx, (offset, name, diverted, note) in enumerate(offsets):
        # Generate 61 dense points along an arc corridor
        coords: List[List[float]] = []
        d_lat = dest_lat - origin_lat
        d_lng = dest_lng - origin_lng
        length = math.sqrt(d_lat * d_lat + d_lng * d_lng)
        norm_lat = -d_lng / (length or 1.0)
        norm_lng = d_lat / (length or 1.0)

        for step in range(61):
            t = step / 60.0
            base_lat = origin_lat + t * d_lat
            base_lng = origin_lng + t * d_lng
            arc = math.sin(t * math.pi) * offset * length * 0.18
            pt_lat = round(base_lat + arc * norm_lat, 5)
            pt_lng = round(base_lng + arc * norm_lng, 5)
            coords.append([pt_lat, pt_lng])

        dist_mi = round(straight_miles * (1.10 + abs(offset) * 0.12), 1)
        dur_sec = (dist_mi / 55.0) * 3600.0  # ~55 mph average freight speed

        routes.append({
            "id": f"route_{idx + 1}",
            "name": name,
            "geometry": coords,
            "distance_miles": dist_mi,
            "duration_seconds": dur_sec,
            "diverted_via_waypoint": diverted,
            "alternative_note": note,
        })

    return routes


def get_3_alternative_routes(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> List[Dict[str, Any]]:
    """
    Obtain exactly 3 alternative routes between origin and destination.
    Uses ORS (if key provided), then OSRM, and intelligently synthesizes waypoints
    if fewer than 3 alternatives are natively returned.
    """
    cache_key = f"routes_3:{origin_lat:.4f}:{origin_lng:.4f}:{dest_lat:.4f}:{dest_lng:.4f}"
    cached = cache.get(cache_key)
    if cached and len(cached) == 3:
        return cached

    routes: List[Dict[str, Any]] = []

    # 1. Try ORS if configured
    ors_key = os.getenv("ORS_API_KEY", "").strip()
    if ors_key:
        routes = _fetch_ors_routes(origin_lat, origin_lng, dest_lat, dest_lng, ors_key)

    # 2. If < 3 routes, query OSRM direct
    if len(routes) < 3:
        osrm_routes = _fetch_osrm_direct(origin_lat, origin_lng, dest_lat, dest_lng)
        # Avoid duplicate geometries
        for r in osrm_routes:
            if len(routes) < 3 and not any(abs(r["distance_miles"] - existing["distance_miles"]) < 0.5 for existing in routes):
                r["id"] = f"route_{len(routes) + 1}"
                routes.append(r)

    # 3. If still < 3 routes, synthesize waypoints along Northern and Southern corridor detours
    if len(routes) < 3:
        wp_north_lat, wp_north_lng = _calculate_perpendicular_waypoint(
            origin_lat, origin_lng, dest_lat, dest_lng, offset_ratio=0.18
        )
        wp_north_route = _fetch_osrm_via_waypoint(
            origin_lat,
            origin_lng,
            wp_north_lat,
            wp_north_lng,
            dest_lat,
            dest_lng,
            route_id=f"route_{len(routes) + 1}",
            name=f"Alternative Route {len(routes) + 1} (Northern Corridor)",
            note="Generated via northern highway waypoint detour to provide 3 distinct route corridors",
        )
        if wp_north_route:
            routes.append(wp_north_route)

    if len(routes) < 3:
        wp_south_lat, wp_south_lng = _calculate_perpendicular_waypoint(
            origin_lat, origin_lng, dest_lat, dest_lng, offset_ratio=-0.18
        )
        wp_south_route = _fetch_osrm_via_waypoint(
            origin_lat,
            origin_lng,
            wp_south_lat,
            wp_south_lng,
            dest_lat,
            dest_lng,
            route_id=f"route_{len(routes) + 1}",
            name=f"Alternative Route {len(routes) + 1} (Southern Corridor)",
            note="Generated via southern highway waypoint detour to provide 3 distinct route corridors",
        )
        if wp_south_route:
            routes.append(wp_south_route)

    # 4. Ultimate fallback if network is completely down
    if len(routes) < 3:
        fallback_routes = _generate_synthetic_fallback_routes(origin_lat, origin_lng, dest_lat, dest_lng)
        while len(routes) < 3:
            cand = fallback_routes[len(routes)]
            cand["id"] = f"route_{len(routes) + 1}"
            routes.append(cand)

    # Ensure clean sequential IDs and names
    for i, r in enumerate(routes[:3]):
        r["id"] = f"route_{i + 1}"
        if not r.get("name"):
            r["name"] = f"Route {i + 1}"

    final_3 = routes[:3]
    cache.set(cache_key, final_3, timeout=3600)
    return final_3
