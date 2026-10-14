"""
API views for Weather-Aware Truck Routing.
Adheres to clean architecture: views are thin controllers that delegate all business logic
to dedicated service modules (geocoding, routing, sampling, weather, risk_engine, recommender).
"""

import logging
from datetime import datetime, timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from routing.serializers import (
    PlanRequestSerializer,
    HeatmapQuerySerializer,
    GeocodeQuerySerializer,
)
from routing.services.geocoding import geocode_location, search_locations
from routing.services.routing import get_3_alternative_routes
from routing.services.sampling import sample_route_checkpoints
from routing.services.weather import enrich_checkpoints_with_weather
from routing.services.risk_engine import evaluate_checkpoint_risk
from routing.services.recommender import (
    compute_route_summary,
    rank_and_recommend_routes,
    format_duration,
)
from routing.services.heatmap import get_heatmap_frame

logger = logging.getLogger(__name__)


class PlanRouteView(APIView):
    """
    POST /api/plan/
    Evaluates 3 alternative routes against hourly weather forecasts along the trip corridor,
    computes checkpoint risk scores with load-weight escalation, calculates route-level metrics,
    and returns the recommended route with a detailed explanation and comparison table.
    """

    def post(self, request):
        serializer = PlanRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors, "message": "Invalid input parameters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        origin_query = data["origin"]
        dest_query = data["destination"]
        departure_time = data["departure_time"]
        load_weight_lb = data["load_weight_lb"]
        interval_miles = data["interval_miles"]

        # 1. Geocode origin and destination
        origin_geo = geocode_location(origin_query)
        if not origin_geo:
            return Response(
                {"error": f"Could not geocode origin address: '{origin_query}'"},
                status=status.HTTP_404_NOT_FOUND,
            )

        dest_geo = geocode_location(dest_query)
        if not dest_geo:
            return Response(
                {"error": f"Could not geocode destination address: '{dest_query}'"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 2. Fetch 3 alternative routes
        routes = get_3_alternative_routes(
            origin_lat=origin_geo["lat"],
            origin_lng=origin_geo["lng"],
            dest_lat=dest_geo["lat"],
            dest_lng=dest_geo["lng"],
        )

        if not routes:
            return Response(
                {"error": "Failed to calculate routes between specified locations."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        processed_routes = []
        for route in routes:
            # 3. Sample checkpoints every 10 / 25 / 50 miles along geometry
            checkpoints = sample_route_checkpoints(
                coordinates=route["geometry"],
                total_distance_miles=route["distance_miles"],
                total_duration_seconds=route["duration_seconds"],
                departure_time=departure_time,
                interval_miles=interval_miles,
            )

            # 4. Enrich checkpoints with hourly forecast closest to ETA
            enriched_checkpoints = enrich_checkpoints_with_weather(checkpoints)

            # 5. Evaluate risk and load escalation per checkpoint
            for cp in enriched_checkpoints:
                risk_eval = evaluate_checkpoint_risk(
                    wind_mph=cp["wind_mph"],
                    rain_in_hr=cp["rain_in_hr"],
                    snow_in_hr=cp["snow_in_hr"],
                    load_weight_lb=load_weight_lb,
                )
                cp["risk_level"] = risk_eval["risk_level"]
                cp["risk_score"] = risk_eval["risk_score"]
                cp["wind_risk"] = risk_eval["wind_risk"]
                cp["rain_risk"] = risk_eval["rain_risk"]
                cp["snow_risk"] = risk_eval["snow_risk"]
                cp["reasons"] = risk_eval["reasons"]
                cp["load_escalated"] = risk_eval["load_escalated"]
                cp["escalation_reason"] = risk_eval["escalation_reason"]
                # Clean internal datetime object before serializing
                cp.pop("eta_datetime", None)

            # 6. Compute route summary metrics
            summary = compute_route_summary(enriched_checkpoints, route["distance_miles"])

            processed_routes.append({
                "id": route["id"],
                "name": route["name"],
                "geometry": route["geometry"],
                "distance_mi": route["distance_miles"],
                "distance_miles": route["distance_miles"],
                "duration": format_duration(route["duration_seconds"]),
                "duration_seconds": route["duration_seconds"],
                "diverted_via_waypoint": route.get("diverted_via_waypoint", False),
                "alternative_note": route.get("alternative_note", ""),
                "checkpoints": enriched_checkpoints,
                "summary": summary,
            })

        # 7. Strict lexicographical recommendation
        recommendation, comparison_table = rank_and_recommend_routes(processed_routes)

        # Compute corridor bounding box for frontend map framing & heatmap
        all_lats = [c[0] for r in processed_routes for c in r["geometry"]]
        all_lngs = [c[1] for r in processed_routes for c in r["geometry"]]
        bbox = {
            "min_lat": min(all_lats) if all_lats else origin_geo["lat"],
            "min_lng": min(all_lngs) if all_lngs else origin_geo["lng"],
            "max_lat": max(all_lats) if all_lats else dest_geo["lat"],
            "max_lng": max(all_lngs) if all_lngs else dest_geo["lng"],
        }

        response_payload = {
            "origin": origin_geo,
            "destination": dest_geo,
            "departure_time": departure_time.isoformat(),
            "load_weight_lb": load_weight_lb,
            "interval_miles": interval_miles,
            "routes": processed_routes,
            "recommendation": recommendation,
            "comparison_table": comparison_table,
            "corridor_bbox": bbox,
        }

        return Response(response_payload, status=status.HTTP_200_OK)


class HeatmapView(APIView):
    """
    GET /api/heatmap/?bbox=min_lat,min_lng,max_lat,max_lng&hour=0..48
    Returns weather & risk intensity grid points covering the trip corridor buffer.
    """

    def get(self, request):
        serializer = HeatmapQuerySerializer(data=request.query_params)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors, "message": "Invalid query parameters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        min_lat = data["min_lat"]
        min_lng = data["min_lng"]
        max_lat = data["max_lat"]
        max_lng = data["max_lng"]
        forecast_hour = data["hour"]
        departure_time = data.get("departure_time") or datetime.now(timezone.utc)
        load_weight_lb = data.get("load_weight_lb", 40000.0)

        heatmap_data = get_heatmap_frame(
            min_lat=min_lat,
            min_lng=min_lng,
            max_lat=max_lat,
            max_lng=max_lng,
            forecast_hour=forecast_hour,
            departure_time=departure_time,
            load_weight_lb=load_weight_lb,
        )

        return Response(heatmap_data, status=status.HTTP_200_OK)


class GeocodeAutocompleteView(APIView):
    """
    GET /api/geocode/?q=Chicago
    Autocomplete endpoint for origin/destination address search.
    """

    def get(self, request):
        serializer = GeocodeQuerySerializer(data=request.query_params)
        if not serializer.is_valid():
            return Response({"suggestions": []}, status=status.HTTP_200_OK)

        q = serializer.validated_data["q"]
        limit = serializer.validated_data["limit"]
        suggestions = search_locations(q, limit=limit)
        return Response({"suggestions": suggestions}, status=status.HTTP_200_OK)
