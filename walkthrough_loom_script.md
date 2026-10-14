# Loom Walkthrough Script: Weather-Aware Truck Routing (5–10 Min)

**Title**: Weather-Aware Heavy Goods Vehicle (HGV) Routing System  
**Audience**: Technical Evaluators & Senior Engineering Team  
**Estimated Duration**: 6–8 minutes  

---

## 1. Introduction & Problem Statement (0:00 – 1:00)
- **Visual**: Full-screen view of the **AeroHaul** web interface at `http://localhost:5173/`.
- **Speaker Script**:
  > *"Hello! Today I'm excited to present AeroHaul, a production-grade Weather-Aware Truck Routing platform built with React, TypeScript, Leaflet, Django REST Framework, and Open-Meteo.
  > Long-haul trucking safety is deeply contingent on dynamic weather hazards. High crosswinds cause catastrophic trailer blowovers, especially when cargo weight shifts the center of gravity.
  > Standard navigation apps only optimize for travel time. AeroHaul evaluates 3 distinct highway corridors, samples weather along the truck's exact trajectory according to its progressive arrival ETA, applies truck gross-weight escalation rules, and recommends the safest route using a strict lexicographical decision engine."*

---

## 2. Live Demo Flow: The Chicago → Denver Scenario (1:00 – 3:00)
- **Visual**: Click the **"Chicago → Denver (Assessment Scenario, 45k lb)"** preset chip in the top navigation bar.
- **Actions**:
  1. Show origin (`Chicago, IL`), destination (`Denver, CO`), departure date/time, and load weight slider set to `45,000 lb`.
  2. Point to the active rule pills:
     - Notice: `> 30,000 lb` rule is highlighted (wind 45–54 mph triggers *No Travel*).
     - Notice: `> 40,000 lb` rule is highlighted (wind 35–44 mph escalates to *Severe*).
  3. Click **"Analyze Safety & Optimize 3 Routes"**.
  4. Showcase the result:
     - **3 Route Options**: Primary Route (I-80), Alternative Route 2 (Southern Corridor via I-70/Kansas), and Alternative Route 3 (Northern Corridor).
     - **Recommendation Banner**: Reads out the transparent, human-readable justification:
       *e.g. "Primary Route is recommended: completely avoids No Travel hazards; 0.0 Severe miles vs 50.0 on Alternative Route 3; lowest average risk score."*
     - **Interactive Map**: Show how the recommended route is highlighted in thick blue with distinct color-coding for alternatives.
     - **Checkpoint Markers**: Click on a checkpoint circle on the Great Plains segment to inspect the popup showing exact Mile, progressive ETA, wind speed/gusts, precipitation, and the explicit risk reason.
     - **Corridor Weather Heatmap**: Toggle the 0–48 hour timeline slider to show the weather radar evolving over time, and click "Play" to showcase the smooth hourly animation.

---

## 3. Architecture & Code Structure (3:00 – 4:30)
- **Visual**: Switch to IDE showing the project directory tree.
- **Key Talking Points**:
  - **Clean Architecture & Separation of Concerns**:
    - `backend/routing/views.py`: Thin controllers that only validate requests and serialize responses.
    - `backend/routing/services/`:
      - `risk_engine.py`: Pure, zero-dependency domain logic for wind, rain, snow classification and load escalations.
      - `sampling.py`: Precise Haversine math and polyline coordinate interpolation; ensures $\sum \text{segment\_miles} = \text{total\_route\_miles}$ with mathematical conservation.
      - `routing.py`: Guarantees 3 distinct routes (ORS driving-hgv or OSRM + lateral corridor waypoint synthesis).
      - `weather.py`: Multi-location batching with chunking and ETA closest-hour sampling.
      - `recommender.py`: Lexicographical ranking engine.
      - `heatmap.py`: Spatial grid generator with 48h temporal slicing.
  - **Comprehensive Testing**:
    - Point to `pytest` test suite: 66 tests passing in under 5 seconds covering all boundary values, load rules, and API mocks.

---

## 4. Risk Logic & Strict Lexicographical Engine (4:30 – 6:00)
- **Visual**: Show `constants.py` and `services/recommender.py`.
- **Explanation**:
  - **Exact Specification Thresholds**:
    - Wind: Low `<25`, Moderate `25–34`, High `35–44`, Severe `45–54`, No Travel `≥55` mph.
    - Rain: Low `<0.10`, Moderate `0.10–0.25`, High `0.25–0.50`, Severe `0.50–1.00`, No Travel `>1.00` in/hr.
    - Snow: Low `<0.5`, Moderate `0.5–1.0`, High `1.0–2.0`, Severe `2.0–3.0`, No Travel `>3.0` in/hr.
  - **Strict Boundary Implementation**:
    - Emphasize that `30,000 lb` strictly does *not* trigger escalation, while `30,001 lb` does.
    - Emphasize that `1.00 in/hr` rain is Severe, whereas `>1.00` triggers No Travel.
  - **Strict Lexicographical Priority**:
    1. Exclude/penalize routes with *No Travel* (if all have No Travel, pick least bad with a prominent warning).
    2. Fewest *Severe* miles.
    3. Fewest *High* miles.
    4. Lowest distance-weighted *average risk score*.
    5. Shortest travel time.
- **Visual**: Click the **"Comparison Table"** button in the UI to display the modal proving this lexicographical ordering across all routes.

---

## 5. Tradeoffs, Assumptions & Production Readiness (6:00 – 7:30)
- **Talking Points**:
  - **Batching & Caching**: Open-Meteo queries are batched in chunks of 40 and cached by `(round(lat,2), round(lng,2), iso_hour)` to stay well below rate limits while delivering sub-second response times.
  - **Corridor Detour Waypoints**: When upstream routing engines only return 1 direct highway, our algorithm synthesizes lateral waypoints perpendicular to the corridor midpoint, routing through real road networks so drivers always have 3 genuine options.
  - **Deployment Ready**: Fully containerized with Docker, Docker Compose, Gunicorn, Whitenoise, and deployment blueprints for Render, Railway, Vercel, and Netlify.

---

## 6. Closing (7:30 – 8:00)
- *"Thank you for your time and review. All code, documentation, test suites, and Docker configurations are organized in the repository. I look forward to your feedback!"*
