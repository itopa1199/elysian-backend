import axios from 'axios';

// USGS Mineral Resources Data System — free, no API key needed
// Docs: https://mrdata.usgs.gov/services/wfs/mrds
const MRDS_BASE = 'https://mrdata.usgs.gov/services/wfs/mrds';

export interface MRDSDeposit {
  id: string;
  name: string;
  mineral: string;
  depositType: string;
  longitude: number;
  latitude: number;
  country: string;
  state: string;
  status: string;
  commod1: string; // primary commodity
  commod2?: string;
  commod3?: string;
}

/**
 * Fetch real mineral deposits from USGS MRDS within a bounding box
 * Nigeria bounding box: lon 2.6–14.7, lat 4.2–13.9
 */
export async function fetchMRDSDeposits(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
  mineral?: string
): Promise<MRDSDeposit[]> {
  try {
    const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;

    const params: Record<string, string> = {
      service: 'WFS',
      version: '1.0.0',
      request: 'GetFeature',
      typeName: 'mrds',
      outputFormat: 'application/json',
      bbox,
      srsname: 'EPSG:4326',
      maxFeatures: '200',
    };

    if (mineral) {
      params.CQL_FILTER = `commod1 ILIKE '%${mineral}%' OR commod2 ILIKE '%${mineral}%'`;
    }

    const response = await axios.get(MRDS_BASE, {
      params,
      timeout: 8000,
    });

    if (!response.data?.features) return [];

    return response.data.features
      .filter((f: any) => f.geometry?.coordinates)
      .map((f: any) => ({
        id: f.properties.dep_id || f.id,
        name: f.properties.site_name || 'Unknown Deposit',
        mineral: f.properties.commod1 || 'Unknown',
        depositType: f.properties.dep_tp || 'Unknown',
        longitude: f.geometry.coordinates[0],
        latitude: f.geometry.coordinates[1],
        country: f.properties.country || 'Nigeria',
        state: f.properties.state || '',
        status: f.properties.oper_type || 'Unknown',
        commod1: f.properties.commod1 || '',
        commod2: f.properties.commod2 || '',
        commod3: f.properties.commod3 || '',
      }));
  } catch (error) {
    console.error('MRDS fetch error:', error);
    return [];
  }
}

/**
 * Fetch deposits near a specific point (radius in km)
 */
export async function fetchDepositsNearPoint(
  lon: number,
  lat: number,
  radiusKm: number = 100,
  mineral?: string
): Promise<MRDSDeposit[]> {
  // Convert km to rough degrees (1 deg ≈ 111km)
  const deg = radiusKm / 111;
  return fetchMRDSDeposits(
    lon - deg, lat - deg,
    lon + deg, lat + deg,
    mineral
  );
}

/**
 * Map MRDS commodity codes to our mineral categories
 */
export function normalizeMineralName(commod: string): string {
  const c = commod.toLowerCase();
  if (c.includes('li') || c.includes('lithium'))       return 'Lithium';
  if (c.includes('au') || c.includes('gold'))           return 'Gold';
  if (c.includes('fe') || c.includes('iron'))           return 'Iron Ore';
  if (c.includes('rare') || c.includes('ree') || c.includes('lanthan')) return 'Rare Earth';
  if (c.includes('pb') || c.includes('lead'))           return 'Lead';
  if (c.includes('zn') || c.includes('zinc'))           return 'Zinc';
  if (c.includes('sn') || c.includes('tin'))            return 'Tin';
  if (c.includes('col') || c.includes('tan') || c.includes('cb')) return 'Columbite-Tantalite';
  if (c.includes('co') || c.includes('cobalt'))         return 'Cobalt';
  if (c.includes('cu') || c.includes('copper'))         return 'Copper';
  if (c.includes('coal'))                               return 'Coal';
  if (c.includes('bitumen'))                            return 'Bitumen';
  return commod;
}

/**
 * Get color for mineral type (matches frontend)
 */
export function getMineralColor(mineral: string): string {
  const colors: Record<string, string> = {
    'Lithium': '#00d4ff',
    'Gold': '#f5a623',
    'Iron Ore': '#ff5f57',
    'Rare Earth': '#9b59ff',
    'Lead': '#a0a0a0',
    'Zinc': '#4cde80',
    'Tin': '#c0c0c0',
    'Columbite-Tantalite': '#e74c3c',
    'Cobalt': '#3498db',
    'Copper': '#e67e22',
    'Coal': '#7f8c8d',
    'Bitumen': '#2c3e50',
  };
  return colors[mineral] || '#ffffff';
}
