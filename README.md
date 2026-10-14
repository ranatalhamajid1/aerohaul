# AeroHaul — Weather-Aware Truck Routing System

[![Backend Test Suite](https://img.shields.io/badge/pytest-66%20passed-success)](https://pytest.org)
[![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue)](https://python.org)
[![Django](https://img.shields.io/badge/django-5.1-green)](https://djangoproject.com)
[![React](https://img.shields.io/badge/react-18-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-purple)]()

> A production-grade decision support platform for Heavy Goods Vehicle (HGV) dispatchers and commercial drivers. Evaluates 3 alternative highway routes against hourly weather forecasts along the route corridor, applies truck-specific load-weight risk rules, calculates per-checkpoint and cumulative risk metrics, and recommends the optimal route using a strict lexicographical decision engine.

---

## 1. System Architecture

```mermaid
graph TD
    subgraph Frontend [React 18 + TypeScript + Leaflet]
        UI[Dispatch Dashboard & Form]
        Map[Interactive Map & 48h Weather Radar]
        Modal[Lexicographical Comparison Table]
    end

    subgraph Backend [Django 5 + Django REST Framework]
        API[API View Controllers]
        GeocodeSvc[Geocoding Service (Nominatim + Hub Cache)]
        RoutingSvc[Routing Engine (ORS HGV / OSRM + Waypoint Detours)]
        SamplingSvc[Haversine Checkpoint & ETA Interpolator]
        WeatherSvc[Open-Meteo Batch Client + Caching]
        RiskEngine[Risk Classification & Load Escalation Engine]
        Recommender[Lexicographical Recommendation Engine]
        HeatmapSvc[Spatial Corridor Grid Generator]
    end

    subgraph ExternalServices [Third-Party Services]
        Nominatim[OSM Nominatim Geocoder]
        OSRM[OSRM Public Router]
        ORS[OpenRouteService HGV]
        OpenMeteo[Open-Meteo Hourly Forecast API]
    end

    UI -->|POST /api/plan/| API
    Map -->|GET /api/heatmap/| API
    UI -->|GET /api/geocode/| API

    API --> GeocodeSvc --> Nominatim
    API --> RoutingSvc --> OSRM & ORS
    API --> SamplingSvc
    API --> WeatherSvc --> OpenMeteo
    API --> RiskEngine
    API --> Recommender
    API --> HeatmapSvc --> WeatherSvc
```

---

## 2. Risk Classification & Load Escalation Specification

All thresholds are strictly defined in [`backend/routing/constants.py`](file:///d:/spotter%20fs%20assesment/backend/routing/constants.py) and verified by comprehensive unit tests.

### Base Weather Thresholds
| Hazard Level | Wind Speed (mph) | Rain Intensity (in/hr) | Snow Intensity (in/hr) | Numeric Score |
|:---|:---|:---|:---|:---:|
| **Low** | `< 25.0` | `< 0.10` | `< 0.50` | `1` |
| **Moderate** | `25.0 <= w < 35.0` | `0.10 <= r < 0.25` | `0.50 <= s < 1.00` | `2` |
| **High** | `35.0 <= w < 45.0` | `0.25 <= r < 0.50` | `1.00 <= s < 2.00` | `3` |
| **Severe** | `45.0 <= w < 55.0` | `0.50 <= r <= 1.00` | `2.00 <= s <= 3.00` | `4` |
| **No Travel** | `>= 55.0` | `> 1.00` | `> 3.00` | `5` |

*Checkpoint Base Risk = $\max(\text{Wind Risk}, \text{Rain Risk}, \text{Snow Risk})$.*

### Truck Load-Weight Escalation Rules
Heavy vehicle dynamics and high-profile trailers are vulnerable to crosswind rollover when cargo weight exceeds specific limits:
1. **Mandatory Cease-Travel**: Wind $\ge 55$ mph $\rightarrow$ **No Travel** regardless of load weight.
2. **Heavy Load Rollover Escalation**: Wind in $[45, 54]$ mph **AND** `load_weight > 30,000 lb` $\rightarrow$ **No Travel**.
3. **Medium Load Rollover Escalation**: Wind in $[35, 44]$ mph **AND** `load_weight > 40,000 lb` $\rightarrow$ **Severe** (unless already higher).

> **Boundary Condition Implementation**: Rules specify strictly greater than (`>`), so loads of exactly `30,000 lb` or `40,000 lb` do **not** trigger escalation.

---

## 3. Strict Lexicographical Recommendation Engine

Route alternatives are ranked using a 5-tier lexicographical decision hierarchy:
1. **Avoid No Travel**: Exclude/penalize any route with *No Travel* conditions.
   - *Fallback*: If **all** routes contain No Travel, recommend the route with the fewest No Travel miles accompanied by an emergency safety warning.
2. **Minimize Severe Miles**: Prefer the route with the fewest Severe risk miles.
3. **Minimize High Miles**: If tied on Severe miles, prefer the route with the fewest High risk miles.
4. **Minimize Average Risk Score**: If tied on High miles, prefer the route with the lowest distance-weighted average risk score:
   $$\text{Avg Risk} = \frac{\sum_{i=1}^n (\text{Segment Miles}_i \times \text{Risk Score}_i)}{\text{Total Route Miles}}$$
5. **Shortest Travel Time**: If all safety metrics are equal, choose the route with the shortest duration.

---

## 4. Quick Start & Setup

### Prerequisites
- Python 3.11 or 3.12
- Node.js 18+ and npm
- (Optional) Docker and Docker Compose

### Option A: Local Development

#### 1. Clone & Set Environment
```bash
git clone <repo-url>
cd spotter-fs-assessment
cp .env.example .env
```

#### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```
Backend API will be active at `http://127.0.0.1:8000/api/`.

#### 3. Frontend Setup
```bash
# In a new terminal:
cd frontend
npm install
npm run dev
```
Open `http://127.0.0.1:5173/` in your browser.

---

### Option B: Docker Compose (One-Command Launch)

```bash
docker compose up --build
```
- Frontend: `http://localhost/`
- Backend API: `http://localhost:8000/api/`
- Redis Cache: `localhost:6379`

---

## 5. Running Tests

The test suite validates risk thresholds, mathematical sampling conservation, lexicographical sorting, and API endpoints with mocked and realistic data:

```bash
cd backend
# Windows:
.\venv\Scripts\pytest.exe -v
# macOS/Linux:
pytest -v
```

**Test Coverage Highlights**:
- `test_risk_engine.py`: 50 parameter tests covering all boundaries (e.g. 24.9 vs 25.0, 34.9 vs 35.0, 54.9 vs 55.0 mph; 1.00 vs 1.001 in/hr rain; 30,000 vs 30,001 lb load).
- `test_sampling.py`: Tests Haversine distance, coordinate interpolation, and proves $\sum \text{segment\_miles} = \text{total\_route\_miles}$.
- `test_recommender.py`: 6 tests proving each tier of the lexicographical decision rules.
- `test_api.py`: End-to-end integration tests for `/api/plan/`, `/api/heatmap/`, and `/api/geocode/`.

---

## 6. API Reference

### `POST /api/plan/`
Calculates 3 alternative routes, samples weather at progressive ETAs, classifies risk, and recommends the optimal route.

#### Request Body
```json
{
  "origin": "Chicago, IL",
  "destination": "Denver, CO",
  "departure_time": "2026-10-15T08:00:00Z",
  "load_weight_lb": 45000,
  "interval_miles": 25
}
```

#### Response (`200 OK`)
```json
{
  "origin": { "display_name": "Chicago, Cook County, Illinois", "lat": 41.8781, "lng": -87.6298 },
  "destination": { "display_name": "Denver, Colorado", "lat": 39.7392, "lng": -104.9903 },
  "departure_time": "2026-10-15T08:00:00Z",
  "load_weight_lb": 45000,
  "interval_miles": 25,
  "routes": [
    {
      "id": "route_1",
      "name": "Primary Route (Fastest Interstate)",
      "geometry": [[41.8781, -87.6298], ...],
      "distance_mi": 1005.1,
      "duration": "17h 48m",
      "checkpoints": [
        {
          "index": 0,
          "lat": 41.8781,
          "lng": -87.6298,
          "mile": 0.0,
          "segment_miles": 12.5,
          "eta": "2026-10-15T08:00:00+00:00",
          "wind_mph": 14.2,
          "rain_in_hr": 0.0,
          "snow_in_hr": 0.0,
          "risk_level": "Low",
          "risk_score": 1,
          "reasons": ["Optimal conditions: mild wind, clear precipitation"]
        }
      ],
      "summary": {
        "miles_by_risk": { "Low": 755.1, "Moderate": 250.0, "High": 0.0, "Severe": 0.0, "No Travel": 0.0 },
        "severe_miles": 0.0,
        "high_miles": 0.0,
        "no_travel_miles": 0.0,
        "avg_risk": 1.25,
        "max_risk": "Moderate",
        "has_no_travel": false
      },
      "recommended": true
    }
  ],
  "recommendation": {
    "route_id": "route_1",
    "explanation": "Primary Route (Fastest Interstate) is recommended: has 0.0 No Travel miles; has only 0.0 Severe miles vs 50.0 on Alternative Route 3 (Northern Corridor). Total trip: 1005.1 miles, 17h 48m."
  },
  "comparison_table": [...]
}
```

---

### `GET /api/heatmap/?bbox=min_lat,min_lng,max_lat,max_lng&hour=0..48`
Returns a 2D spatial grid along the route corridor buffer for the selected forecast hour (0 to 48 hours).

---

### `GET /api/geocode/?q=Chicago`
Returns autocomplete suggestions for cities and addresses.

---

## 7. Sample Test Scenario: Chicago → Denver (45,000 lb Load)

- **Origin**: Chicago, IL (`41.8781, -87.6298`)
- **Destination**: Denver, CO (`39.7392, -104.9903`)
- **Load Weight**: `45,000 lb` (Heavy class $>40,000$ lb)
- **Expected System Behavior**:
  1. The app generates 3 distinct highway corridors across the Midwest:
     - **Route 1 (I-80 via Iowa & Nebraska)**: Primary fastest freight corridor (~1,005 mi, ~17.8h).
     - **Route 2 (I-70 / Southern via Kansas)**: Southern detour via Missouri & Kansas.
     - **Route 3 (I-90 / Northern via South Dakota/Wyoming)**: Northern detour.
  2. Because the load exceeds $40,000$ lb, any wind between $35$ and $44$ mph escalates to **Severe**; any wind between $45$ and $54$ mph escalates to **No Travel**.
  3. The decision engine evaluates all checkpoints at their progressive arrival times, isolates weather pockets in the Great Plains, and selects the route that minimizes severe exposure and avoids all No Travel hazards.

---

## 8. Assumptions, Tradeoffs & Known Limitations

1. **Weather Precipitation Units**:
   Open-Meteo forecasts provide hourly precipitation and snowfall in liquid-equivalent inches per hour. Snowfall accumulation rate is treated directly in inches/hour as specified by the assessment rules.
2. **ETA Matching**:
   Truck arrival at each checkpoint is calculated using proportional duration along the route polyline. Real-world mandatory driver rest breaks (Hours of Service / HOS regulations) are omitted to focus strictly on weather hazard exposure.
3. **Alternative Route Generation**:
   Public OSRM demo servers often return only 1 primary highway. When fewer than 3 routes are natively returned, our algorithm generates lateral corridor waypoints (perpendicular to the corridor midpoint) and routes through real road networks so drivers always have 3 genuine options.
4. **Forecast Horizon**:
   Open-Meteo provides hourly forecasts up to 16 days. For checkpoints beyond 48 hours, an extended forecast banner is attached to notify drivers of reduced confidence.

---

## 9. Deployment Guide

### Backend on Render / Railway
1. **Render**: Use the included [`render.yaml`](file:///d:/spotter%20fs%20assesment/render.yaml) blueprint. Set environment variables `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS=*`.
2. **Railway**: Connect GitHub repository, select `backend/`, and deploy using the included `backend/Dockerfile`.

### Frontend on Vercel / Netlify
1. **Vercel**: Deploy the `frontend/` folder with framework preset `Vite`. The included [`frontend/vercel.json`](file:///d:/spotter%20fs%20assesment/frontend/vercel.json) automatically proxies `/api/*` requests.
2. **Netlify**: Deploy using the included [`frontend/netlify.toml`](file:///d:/spotter%20fs%20assesment/frontend/netlify.toml).

---

## 10. Walkthrough Video Script

A full 5–10 minute presentation script is available at [`walkthrough_loom_script.md`](file:///d:/spotter%20fs%20assesment/walkthrough_loom_script.md).
