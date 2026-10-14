"""
Checkpoint sampling and ETA interpolation service along route geometry.
Implements precise Haversine distance, coordinate interpolation, and segment mileage representation.
"""

import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple


EARTH_RADIUS_MILES = 3958.8


def haversine_distance_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on Earth in miles."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_MILES * c


def interpolate_lat_lng(
    lat1: float, lon1: float, lat2: float, lon2: float, fraction: float
) -> Tuple[float, float]:
    """
    Interpolate between two lat/lng coordinates along a straight line segment by fraction in [0, 1].
    """
    fraction = max(0.0, min(1.0, fraction))
    lat = lat1 + fraction * (lat2 - lat1)
    lng = lon1 + fraction * (lon2 - lon1)
    return round(lat, 5), round(lng, 5)


def sample_route_checkpoints(
    coordinates: List[List[float]],
    total_distance_miles: float,
    total_duration_seconds: float,
    departure_time: datetime,
    interval_miles: float = 25.0,
) -> List[Dict[str, Any]]:
    """
    Sample checkpoints along a polyline coordinate list [lng, lat] or [lat, lng].
    Ensures points are placed at 0, interval, 2*interval, ..., and destination.
    Computes exact cumulative distance, interpolated lat/lng, and proportional ETA.

    Args:
        coordinates: List of [lat, lng] or [lng, lat] coordinate pairs.
                     Normalized internally to (lat, lng).
        total_distance_miles: Total route distance in miles.
        total_duration_seconds: Total route duration in seconds.
        departure_time: Starting departure datetime.
        interval_miles: Sampling step interval in miles (10, 25, or 50).

    Returns:
        List of checkpoint dictionaries with exact mile, eta, lat, lng, and segment_miles.
    """
    if not coordinates:
        return []

    # Detect coordinate orientation: lat is between -90 and 90, lng between -180 and 180.
    # OpenRouteService/GeoJSON gives [lng, lat]. OSRM typically [lng, lat].
    # We inspect the first coordinate to ensure (lat, lng) order:
    first_pt = coordinates[0]
    # In North America (e.g. US), lat is ~25 to 50, lng is -125 to -65.
    coords_lat_lng: List[Tuple[float, float]] = []
    if abs(first_pt[0]) <= 90 and (abs(first_pt[1]) > 90 or first_pt[1] < -60):
        # Already [lat, lng]
        coords_lat_lng = [(float(c[0]), float(c[1])) for c in coordinates]
    elif abs(first_pt[1]) <= 90 and (abs(first_pt[0]) > 90 or first_pt[0] < -60):
        # [lng, lat] -> convert to (lat, lng)
        coords_lat_lng = [(float(c[1]), float(c[0])) for c in coordinates]
    else:
        # Default assumption: [lat, lng] if within [-90, 90]
        coords_lat_lng = [(float(c[0]), float(c[1])) for c in coordinates]

    if len(coords_lat_lng) == 1:
        lat, lng = coords_lat_lng[0]
        return [
            {
                "index": 0,
                "lat": lat,
                "lng": lng,
                "mile": 0.0,
                "segment_miles": max(total_distance_miles, 0.1),
                "cumulative_duration_sec": 0.0,
                "eta": departure_time.isoformat(),
            }
        ]

    # Calculate cumulative distance along polyline vertices
    vertex_distances: List[float] = [0.0]
    cumulative = 0.0
    for i in range(len(coords_lat_lng) - 1):
        dist = haversine_distance_miles(
            coords_lat_lng[i][0],
            coords_lat_lng[i][1],
            coords_lat_lng[i + 1][0],
            coords_lat_lng[i + 1][1],
        )
        cumulative += dist
        vertex_distances.append(cumulative)

    calculated_total_distance = cumulative
    # Use API's total distance if available and positive, otherwise calculated sum
    effective_total_distance = total_distance_miles if total_distance_miles > 0 else calculated_total_distance
    distance_scale = (
        effective_total_distance / calculated_total_distance
        if calculated_total_distance > 0
        else 1.0
    )

    # Determine sample target miles: 0.0, interval, 2*interval, ..., and destination
    target_miles: List[float] = [0.0]
    curr_target = float(interval_miles)
    while curr_target < effective_total_distance - 0.5:
        target_miles.append(round(curr_target, 2))
        curr_target += interval_miles
    target_miles.append(round(effective_total_distance, 2))

    # Helper to find position at target mile
    checkpoints: List[Dict[str, Any]] = []
    num_vertices = len(coords_lat_lng)

    v_idx = 0
    for idx, target_mi in enumerate(target_miles):
        # Convert scaled target mile to unscaled vertex distance space
        unscaled_target = target_mi / distance_scale if distance_scale > 0 else target_mi

        # Advance vertex index
        while (
            v_idx < num_vertices - 2
            and vertex_distances[v_idx + 1] < unscaled_target
        ):
            v_idx += 1

        seg_start_dist = vertex_distances[v_idx]
        seg_end_dist = vertex_distances[min(v_idx + 1, num_vertices - 1)]
        seg_len = seg_end_dist - seg_start_dist

        if seg_len <= 1e-6:
            fraction = 0.0
        else:
            fraction = (unscaled_target - seg_start_dist) / seg_len

        lat1, lng1 = coords_lat_lng[v_idx]
        lat2, lng2 = coords_lat_lng[min(v_idx + 1, num_vertices - 1)]
        interp_lat, interp_lng = interpolate_lat_lng(lat1, lng1, lat2, lng2, fraction)

        # Proportional duration
        if effective_total_distance > 0:
            duration_fraction = target_mi / effective_total_distance
        else:
            duration_fraction = 0.0
        cum_duration_sec = duration_fraction * total_duration_seconds
        eta = departure_time + timedelta(seconds=cum_duration_sec)

        checkpoints.append(
            {
                "index": idx,
                "lat": interp_lat,
                "lng": interp_lng,
                "mile": target_mi,
                "segment_miles": 0.0,  # Will be assigned below via Voronoi/midpoint weighting
                "cumulative_duration_sec": cum_duration_sec,
                "eta": eta.isoformat(),
                "eta_datetime": eta,
            }
        )

    # Assign segment_miles to each checkpoint using half-segment before + after
    # Bounded so sum(segment_miles) == effective_total_distance exactly.
    n_pts = len(checkpoints)
    if n_pts == 1:
        checkpoints[0]["segment_miles"] = effective_total_distance
    elif n_pts == 2:
        m0, m1 = checkpoints[0]["mile"], checkpoints[1]["mile"]
        mid = (m0 + m1) / 2.0
        checkpoints[0]["segment_miles"] = round(mid, 2)
        checkpoints[1]["segment_miles"] = round(effective_total_distance - mid, 2)
    else:
        for i in range(n_pts):
            if i == 0:
                seg_m = (checkpoints[1]["mile"] - checkpoints[0]["mile"]) / 2.0
            elif i == n_pts - 1:
                seg_m = (checkpoints[i]["mile"] - checkpoints[i - 1]["mile"]) / 2.0
            else:
                seg_m = (checkpoints[i + 1]["mile"] - checkpoints[i - 1]["mile"]) / 2.0
            checkpoints[i]["segment_miles"] = max(0.1, round(seg_m, 2))

    # Adjust last checkpoint so sum exactly equals effective_total_distance
    total_assigned = sum(c["segment_miles"] for c in checkpoints)
    diff = effective_total_distance - total_assigned
    if checkpoints:
        checkpoints[-1]["segment_miles"] = max(
            0.1, round(checkpoints[-1]["segment_miles"] + diff, 2)
        )

    return checkpoints
