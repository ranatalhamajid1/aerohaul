"""
Tests for checkpoint sampling, Haversine interpolation, and proportional ETA calculations.
"""

from datetime import datetime, timezone
import pytest
from routing.services.sampling import (
    haversine_distance_miles,
    interpolate_lat_lng,
    sample_route_checkpoints,
)


def test_haversine_distance_known_points():
    # Chicago (41.8781, -87.6298) to New York (40.7128, -74.0060) is ~710–715 miles as the crow flies
    dist = haversine_distance_miles(41.8781, -87.6298, 40.7128, -74.0060)
    assert 700.0 < dist < 725.0


def test_interpolate_lat_lng_midpoint():
    lat, lng = interpolate_lat_lng(40.0, -80.0, 50.0, -70.0, 0.5)
    assert lat == 45.0
    assert lng == -75.0


def test_sample_route_checkpoints_spacing_and_eta():
    dep_time = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)
    # Simple straight polyline: 100 miles, 2 hours (7200 seconds)
    # Coordinates from lat 40.0 to 41.45 (roughly 100 miles north)
    coords = [[40.0, -80.0], [40.725, -80.0], [41.45, -80.0]]
    total_dist = 100.0
    total_sec = 7200.0  # 2 hours

    checkpoints = sample_route_checkpoints(
        coordinates=coords,
        total_distance_miles=total_dist,
        total_duration_seconds=total_sec,
        departure_time=dep_time,
        interval_miles=25.0,
    )

    # Should sample at 0, 25, 50, 75, 100 miles -> 5 checkpoints
    assert len(checkpoints) == 5
    assert checkpoints[0]["mile"] == 0.0
    assert checkpoints[1]["mile"] == 25.0
    assert checkpoints[2]["mile"] == 50.0
    assert checkpoints[3]["mile"] == 75.0
    assert checkpoints[4]["mile"] == 100.0

    # Verify ETA: at mile 50 (halfway), duration should be 3600s (1 hour later = 09:00)
    assert checkpoints[2]["cumulative_duration_sec"] == 3600.0
    assert "09:00:00" in checkpoints[2]["eta"]
    # Final ETA should be 2 hours later = 10:00
    assert checkpoints[4]["cumulative_duration_sec"] == 7200.0
    assert "10:00:00" in checkpoints[4]["eta"]

    # Verify segment miles sum equals total distance (100.0)
    total_seg_miles = sum(c["segment_miles"] for c in checkpoints)
    assert pytest.approx(total_seg_miles, abs=0.1) == 100.0
