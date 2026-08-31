# Audit 8 — Home/Profile data boundary

Added the authenticated `GET /api/v2/solutions?limit=1..50` history endpoint. Queries are ownership-scoped and
sorted newest-first with an ID tie-breaker; responses expose only solution metadata, never inventory or EA data.
The production overlay remains the sole React root over EA, while preview mocks stay outside the production entry.
Live browser/phone and PostgreSQL rehearsal remain explicit release gates and are not claimed as executed locally.
