"""
Integration and API tests for PlanRouteView, HeatmapView, and GeocodeAutocompleteView.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest
from rest_framework.test import APIClient
from routing.constants import RiskLevel


@pytest.fixture
def api_client():
    return APIClient()


def test_health_check_endpoint(api_client):
    response = api_client.get("/api/health/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_plan_route_validation_empty_inputs(api_client):
    response = api_client.post("/api/plan/", {}, format="json")
    assert response.status_code == 400
    errors = response.json().get("errors", {})
    assert "origin" in errors
    assert "destination" in errors
    assert "departure_time" in errors
    assert "load_weight_lb" in errors


def test_plan_route_validation_same_origin_destination(api_client):
    dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    payload = {
        "origin": "Chicago, IL",
        "destination": "Chicago, IL",
        "departure_time": dep_time,
        "load_weight_lb": 45000,
        "interval_miles": 25,
    }
    response = api_client.post("/api/plan/", payload, format="json")
    assert response.status_code == 400
    errors = response.json().get("errors", {})
    assert "destination" in errors


def test_plan_route_validation_invalid_interval(api_client):
    dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    payload = {
        "origin": "Chicago, IL",
        "destination": "Denver, CO",
        "departure_time": dep_time,
        "load_weight_lb": 45000,
        "interval_miles": 15,  # Invalid: must be 10, 25, or 50
    }
    response = api_client.post("/api/plan/", payload, format="json")
    assert response.status_code == 400
    errors = response.json().get("errors", {})
    assert "interval_miles" in errors


@patch("routing.views.geocode_location")
@patch("routing.views.get_3_alternative_routes")
@patch("routing.views.enrich_checkpoints_with_weather")
def test_plan_route_success_scenario(
    mock_weather, mock_routes, mock_geocode, api_client
):
    # Mock Geocode
    mock_geocode.side_effect = lambda query: {
        "display_name": f"{query}, USA",
        "lat": 41.8781 if "Chicago" in query else 39.7392,
        "lng": -87.6298 if "Chicago" in query else -104.9903,
    }

    # Mock 3 Routes
    mock_routes.return_value = [
        {
            "id": "route_1",
            "name": "Route 1 (I-80 Direct)",
            "geometry": [[41.8781, -87.6298], [41.2565, -95.9345], [39.7392, -104.9903]],
            "distance_miles": 1000.0,
            "duration_seconds": 54000.0,
            "diverted_via_waypoint": False,
        },
        {
            "id": "route_2",
            "name": "Route 2 (I-70 South)",
            "geometry": [[41.8781, -87.6298], [39.0997, -94.5786], [39.7392, -104.9903]],
            "distance_miles": 1050.0,
            "duration_seconds": 56000.0,
            "diverted_via_waypoint": True,
        },
        {
            "id": "route_3",
            "name": "Route 3 (I-90 North)",
            "geometry": [[41.8781, -87.6298], [43.5, -96.7], [39.7392, -104.9903]],
            "distance_miles": 1120.0,
            "duration_seconds": 60000.0,
            "diverted_via_waypoint": True,
        },
    ]

    # Mock weather enrichment: Route 1 has severe wind around Nebraska (lng -96, lat 41.2); Route 2 (south via Kansas) is mild
    def fake_weather_enrich(cps):
        for cp in cps:
            # Checkpoint specifically along Route 1's northern corridor (Nebraska: lat ~ 41.2, lng ~ -96)
            if abs(cp["lat"] - 41.25) < 0.5 and abs(cp["lng"] - (-96.0)) < 2.0:
                cp["wind_mph"] = 48.0  # With 45,000 lb load -> triggers No Travel escalation
                cp["rain_in_hr"] = 0.0
                cp["snow_in_hr"] = 0.0
            else:
                cp["wind_mph"] = 15.0
                cp["rain_in_hr"] = 0.0
                cp["snow_in_hr"] = 0.0
        return cps

    mock_weather.side_effect = fake_weather_enrich

    dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    payload = {
        "origin": "Chicago, IL",
        "destination": "Denver, CO",
        "departure_time": dep_time,
        "load_weight_lb": 45000,  # Heavy load > 30k lb
        "interval_miles": 50,
    }

    response = api_client.post("/api/plan/", payload, format="json")
    assert response.status_code == 200
    data = response.json()

    assert "routes" in data
    assert len(data["routes"]) == 3
    assert "recommendation" in data
    assert "comparison_table" in data

    # Route 1 has 48 mph wind + 45k lb load, which escalates to No Travel.
    # Therefore, Route 2 should be recommended over Route 1!
    r1 = next(r for r in data["routes"] if r["id"] == "route_1")
    assert r1["summary"]["has_no_travel"] is True

    r2 = next(r for r in data["routes"] if r["id"] == "route_2")
    assert r2["summary"]["has_no_travel"] is False

    assert data["recommendation"]["route_id"] == "route_2"
    assert "No Travel" in data["recommendation"]["explanation"]


def test_heatmap_api_returns_points(api_client):
    response = api_client.get(
        "/api/heatmap/",
        {
            "min_lat": 39.0,
            "min_lng": -104.0,
            "max_lat": 42.0,
            "max_lng": -88.0,
            "hour": 6,
            "load_weight_lb": 45000,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["forecast_hour"] == 6
    assert "points" in data
    assert len(data["points"]) > 0
    assert "risk_level" in data["points"][0]
    assert "intensity" in data["points"][0]


def test_geocode_autocomplete_api(api_client):
    response = api_client.get("/api/geocode/?q=Chicago&limit=3")
    assert response.status_code == 200
    data = response.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) > 0
    assert "Chicago" in data["suggestions"][0]["display_name"]
