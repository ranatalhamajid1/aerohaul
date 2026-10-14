"""
Django REST Framework serializers for request validation and response formatting.
"""

from datetime import datetime, timezone, timedelta
from rest_framework import serializers
from routing.constants import CHECKPOINT_INTERVAL_OPTIONS, CHECKPOINT_INTERVAL_DEFAULT


class PlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(
        required=True,
        max_length=255,
        min_length=2,
        help_text="Origin address, city, or coordinate (lat,lng)",
    )
    destination = serializers.CharField(
        required=True,
        max_length=255,
        min_length=2,
        help_text="Destination address, city, or coordinate (lat,lng)",
    )
    departure_time = serializers.DateTimeField(
        required=True,
        help_text="Departure date and time in ISO 8601 format",
    )
    load_weight_lb = serializers.FloatField(
        required=True,
        min_value=0.0,
        max_value=120000.0,
        help_text="Cargo/truck gross load weight in pounds (0 to 120,000 lb)",
    )
    interval_miles = serializers.ChoiceField(
        choices=CHECKPOINT_INTERVAL_OPTIONS,
        default=CHECKPOINT_INTERVAL_DEFAULT,
        required=False,
        help_text="Checkpoint sampling step in miles: 10, 25, or 50 (default: 25)",
    )

    def validate(self, attrs):
        origin = attrs.get("origin", "").strip()
        destination = attrs.get("destination", "").strip()

        if origin.lower() == destination.lower():
            raise serializers.ValidationError(
                {"destination": "Origin and destination must be distinct locations."}
            )

        departure_time = attrs.get("departure_time")
        if departure_time:
            now_utc = datetime.now(timezone.utc)
            # Allow departures from up to 6 hours ago (to tolerate timezone differences / recent trips)
            if departure_time < now_utc - timedelta(hours=6):
                raise serializers.ValidationError(
                    {"departure_time": "Departure time cannot be in the past (more than 6 hours ago)."}
                )

        return attrs


class HeatmapQuerySerializer(serializers.Serializer):
    bbox = serializers.CharField(
        required=False,
        help_text="Bounding box as 'min_lat,min_lng,max_lat,max_lng'",
    )
    min_lat = serializers.FloatField(required=False)
    min_lng = serializers.FloatField(required=False)
    max_lat = serializers.FloatField(required=False)
    max_lng = serializers.FloatField(required=False)
    hour = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        max_value=48,
        help_text="Forecast hour offset from departure (0 to 48)",
    )
    departure_time = serializers.DateTimeField(required=False)
    load_weight_lb = serializers.FloatField(
        required=False,
        default=40000.0,
        min_value=0.0,
        max_value=120000.0,
    )

    def validate(self, attrs):
        bbox_str = attrs.get("bbox")
        if bbox_str:
            try:
                parts = [float(p.strip()) for p in bbox_str.split(",")]
                if len(parts) == 4:
                    attrs["min_lat"], attrs["min_lng"], attrs["max_lat"], attrs["max_lng"] = parts
            except Exception:
                raise serializers.ValidationError({"bbox": "Invalid bbox format. Expected 'min_lat,min_lng,max_lat,max_lng'."})

        for req_field in ["min_lat", "min_lng", "max_lat", "max_lng"]:
            if req_field not in attrs or attrs[req_field] is None:
                raise serializers.ValidationError({req_field: "This field is required if bbox is omitted."})

        return attrs


class GeocodeQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=True, min_length=2, max_length=255)
    limit = serializers.IntegerField(required=False, default=5, min_value=1, max_value=10)
