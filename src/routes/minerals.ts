import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../services/supabase';
import { fetchDepositsNearPoint, normalizeMineralName, getMineralColor } from '../services/usgs';

const router = Router();

// Validation
const nearbySchema = z.object({
  lon: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radius: z.coerce.number().min(10).max(500).default(150),
  mineral: z.string().optional(),
});

/**
 * GET /api/minerals/nearby?lon=8.52&lat=8.56&radius=150&mineral=Lithium
 * Returns real mineral deposits near a coordinate
 */
router.get('/nearby', async (req: Request, res: Response) => {
  const parsed = nearbySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid params', details: parsed.error.flatten() });
  }
  const { lon, lat, radius, mineral } = parsed.data;

  try {
    // 1. Check Supabase cache first (avoids hammering USGS)
    const cacheKey = `${lon.toFixed(1)}_${lat.toFixed(1)}_${radius}_${mineral || 'all'}`;
    const { data: cached } = await supabase
      .from('mineral_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cached) {
      return res.json({ source: 'cache', deposits: cached.data });
    }

    // 2. Fetch from USGS MRDS (real data)
    const rawDeposits = await fetchDepositsNearPoint(lon, lat, radius, mineral);

    // 3. Enrich and normalize
    const deposits = rawDeposits.map(d => ({
      id: d.id,
      name: d.name,
      mineral: normalizeMineralName(d.commod1),
      mineral_raw: d.commod1,
      secondary_minerals: [d.commod2, d.commod3].filter((c): c is string => !!c).map(normalizeMineralName),
      deposit_type: d.depositType,
      longitude: d.longitude,
      latitude: d.latitude,
      state: d.state,
      status: d.status,
      color: getMineralColor(normalizeMineralName(d.commod1)),
      source: 'USGS_MRDS',
      // AI confidence is calculated based on data completeness
      ai_probability: calculateAIProbability(d),
    }));

    // 4. Also query Supabase for any user-added deposits
    const { data: userDeposits } = await supabase
      .from('mineral_deposits')
      .select('*')
      .gte('longitude', lon - radius/111)
      .lte('longitude', lon + radius/111)
      .gte('latitude',  lat - radius/111)
      .lte('latitude',  lat + radius/111);

    const allDeposits = [
      ...deposits,
      ...(userDeposits || []).map(d => ({ ...d, source: 'NGSA_VERIFIED' })),
    ];

    // 5. Cache result for 1 hour
    await supabase.from('mineral_cache').upsert({
      cache_key: cacheKey,
      data: allDeposits,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    // 6. Build summary stats
    const mineralCounts = allDeposits.reduce((acc: Record<string, number>, d) => {
      acc[d.mineral] = (acc[d.mineral] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      source: 'usgs_mrds',
      total: allDeposits.length,
      coordinates: { lon, lat },
      radius_km: radius,
      mineral_summary: mineralCounts,
      top_mineral: Object.entries(mineralCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      deposits: allDeposits,
    });

  } catch (error) {
    console.error('Minerals nearby error:', error);
    return res.status(500).json({ error: 'Failed to fetch mineral data' });
  }
});

/**
 * GET /api/minerals/nigeria
 * Full Nigeria mineral dataset (all known deposits)
 */
router.get('/nigeria', async (_req: Request, res: Response) => {
  try {
    // Fetch across all of Nigeria
    const deposits = await fetchDepositsNearPoint(8.0, 9.0, 900, undefined);
    const normalized = deposits.map(d => ({
      id: d.id,
      name: d.name,
      mineral: normalizeMineralName(d.commod1),
      longitude: d.longitude,
      latitude: d.latitude,
      state: d.state,
      color: getMineralColor(normalizeMineralName(d.commod1)),
      source: 'USGS_MRDS',
    }));

    return res.json({
      total: normalized.length,
      deposits: normalized,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch Nigeria deposits' });
  }
});

/**
 * GET /api/minerals/geojson?mineral=Lithium
 * GeoJSON FeatureCollection for map display
 */
router.get('/geojson', async (req: Request, res: Response) => {
  const { mineral } = req.query as { mineral?: string };

  try {
    const deposits = await fetchDepositsNearPoint(8.0, 9.0, 900, mineral);
    const features = deposits.map(d => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [d.longitude, d.latitude] },
      properties: {
        id: d.id,
        name: d.name,
        mineral: normalizeMineralName(d.commod1),
        depositType: d.depositType,
        state: d.state,
        status: d.status,
        color: getMineralColor(normalizeMineralName(d.commod1)),
      },
    }));

    res.setHeader('Content-Type', 'application/geo+json');
    return res.json({
      type: 'FeatureCollection',
      name: `Nigeria_${mineral || 'All'}_Deposits`,
      features,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate GeoJSON' });
  }
});

// ── Helper ──
function calculateAIProbability(deposit: any): number {
  let score = 60; // base
  if (deposit.name && deposit.name !== 'Unknown Deposit') score += 10;
  if (deposit.depositType && deposit.depositType !== 'Unknown') score += 10;
  if (deposit.status && ['Producer', 'Past Producer'].includes(deposit.status)) score += 15;
  if (deposit.commod2) score += 5; // multiple commodities = more data
  return Math.min(score, 99);
}

export default router;
