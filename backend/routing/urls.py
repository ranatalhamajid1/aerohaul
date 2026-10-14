from django.urls import path
from routing.views import PlanRouteView, HeatmapView, GeocodeAutocompleteView

urlpatterns = [
    path("plan/", PlanRouteView.as_view(), name="plan-route"),
    path("heatmap/", HeatmapView.as_view(), name="corridor-heatmap"),
    path("geocode/", GeocodeAutocompleteView.as_view(), name="geocode-autocomplete"),
]
