import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { geocodeLocation, parseCoordinates } from '../services/geocoding';
import { fetchDepositsNearPoint, normalizeMineralName, getMineralColor } from '../services/usgs';

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1).max(200),
});

/**
 * GET /api/search?q=Nasarawa
 * GET /api/search?q=Lithium
 * GET /api/search?q=8.52,8.56
 *
 * Returns:
 * - Resolved location (name, coordinates)
 * - All mineral deposits at that location (real USGS data)
 * - AI summary of what's there
 */
router.get('/', async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }
  const { q } = parsed.data;

  try {
    // ── 1. Resolve query type ──
    let location: { name: string; lon: number; lat: number; fullName?: string; bbox?: number[] } | null = null;
    let mineralFilter: string | undefined;

    // Check if it's coordinates
    const coords = parseCoordinates(q);
    if (coords) {
      location = { name: `${coords.lon}, ${coords.lat}`, lon: coords.lon, lat: coords.lat };
    }

    // Check if it's a mineral name
    const mineralNames = ['lithium', 'gold', 'iron ore', 'iron', 'rare earth', 'tin', 'lead', 'zinc', 'columbite', 'coal', 'copper', 'cobalt'];
    const matchedMineral = mineralNames.find(m => q.toLowerCase().includes(m));
    if (matchedMineral) {
      mineralFilter = matchedMineral;
      // For mineral-only searches, default to all of Nigeria
      if (!location) {
        location = { name: 'Nigeria', lon: 8.0, lat: 9.0, bbox: [2.6, 4.2, 14.7, 13.9] };
      }
    }

    // Geocode as a place if not coords or mineral-only
    if (!location) {
      const geo = await geocodeLocation(q);
      if (geo) {
        location = { name: geo.name, lon: geo.longitude, lat: geo.latitude, fullName: geo.fullName };
      }
    }

    if (!location) {
      return res.json({
        found: false,
        query: q,
        message: `No location or mineral found for "${q}". Try a Nigerian state name, city, or mineral type.`,
      });
    }

    // ── 2. Fetch real mineral deposits near this location ──
    const radius = location.name === 'Nigeria' ? 900 : 150;
    const deposits = await fetchDepositsNearPoint(location.lon, location.lat, radius, mineralFilter);

    const enriched = deposits.map(d => ({
      id: d.id,
      name: d.name,
      mineral: normalizeMineralName(d.commod1),
      secondaryMinerals: [d.commod2, d.commod3].filter(Boolean).map(m => normalizeMineralName(m!)),
      depositType: d.depositType,
      longitude: d.longitude,
      latitude: d.latitude,
      state: d.state,
      status: d.status,
      color: getMineralColor(normalizeMineralName(d.commod1)),
      source: 'USGS_MRDS',
    }));

    // ── 3. Build mineral summary ──
    const mineralCounts: Record<string, number> = {};
    enriched.forEach(d => {
      mineralCounts[d.mineral] = (mineralCounts[d.mineral] || 0) + 1;
    });

    const topMinerals = Object.entries(mineralCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([mineral, count]) => ({
        mineral,
        count,
        color: getMineralColor(mineral),
      }));

    return res.json({
      found: true,
      query: q,
      location: {
        name: location.name,
        fullName: location.fullName || location.name,
        longitude: location.lon,
        latitude: location.lat,
      },
      mineralFilter: mineralFilter || null,
      total_deposits: enriched.length,
      top_minerals: topMinerals,
      mineral_summary: mineralCounts,
      deposits: enriched,
      // GeoJSON for direct map use
      geojson: {
        type: 'FeatureCollection',
        features: enriched.map(d => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
          properties: d,
        })),
      },
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
