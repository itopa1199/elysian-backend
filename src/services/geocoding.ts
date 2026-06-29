import axios from 'axios';

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

export interface GeocodedLocation {
  name: string;
  longitude: number;
  latitude: number;
  placeType: string;  // 'state' | 'city' | 'region' | 'poi'
  fullName: string;
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

/**
 * Geocode a place name, biased to Nigeria
 */
export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  // First check our local Nigeria lookup table (faster + no API cost)
  const local = NIGERIA_LOCATIONS[query.toLowerCase().trim()];
  if (local) return local;

  // Fall back to Mapbox Geocoding API
  if (!MAPBOX_TOKEN) {
    console.warn('No MAPBOX_ACCESS_TOKEN — geocoding unavailable');
    return null;
  }

  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json`;
    const response = await axios.get(url, {
      params: {
        access_token: MAPBOX_TOKEN,
        country: 'NG',           // bias to Nigeria
        proximity: '8.0,9.0',   // center of Nigeria
        types: 'region,place,locality,poi',
        limit: 1,
      },
      timeout: 5000,
    });

    const feature = response.data?.features?.[0];
    if (!feature) return null;

    return {
      name: feature.text,
      longitude: feature.center[0],
      latitude: feature.center[1],
      placeType: feature.place_type[0],
      fullName: feature.place_name,
      bbox: feature.bbox,
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Parse coordinate string like "8.52, 8.56" or "8.52N 8.56E"
 */
export function parseCoordinates(input: string): { lon: number; lat: number } | null {
  const clean = input.replace(/[°NSEW]/gi, ' ').trim();
  const match = clean.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
  if (!match) return null;
  const a = parseFloat(match[1]);
  const b = parseFloat(match[2]);
  if (isNaN(a) || isNaN(b)) return null;
  // Auto-detect lon/lat order (Nigeria: lon 2–15, lat 4–14)
  if (a >= 2 && a <= 15 && b >= 4 && b <= 14) return { lon: a, lat: b };
  if (b >= 2 && b <= 15 && a >= 4 && a <= 14) return { lon: b, lat: a };
  return { lon: a, lat: b }; // trust user input order
}

// ── Nigeria location lookup table (no API cost) ──
const NIGERIA_LOCATIONS: Record<string, GeocodedLocation> = {
  'nasarawa':       { name:'Nasarawa',       longitude:8.52,  latitude:8.56,  placeType:'state',   fullName:'Nasarawa State, Nigeria',       bbox:[7.6,7.8,9.4,9.1] },
  'jos plateau':    { name:'Jos Plateau',    longitude:8.89,  latitude:9.90,  placeType:'region',  fullName:'Jos Plateau, Plateau State, Nigeria', bbox:[8.0,9.0,10.0,11.0] },
  'jos':            { name:'Jos',            longitude:8.89,  latitude:9.90,  placeType:'city',    fullName:'Jos, Plateau State, Nigeria',   bbox:[8.6,9.6,9.2,10.2] },
  'kaduna':         { name:'Kaduna',         longitude:7.44,  latitude:10.52, placeType:'state',   fullName:'Kaduna State, Nigeria',         bbox:[6.2,9.3,8.8,11.7] },
  'zamfara':        { name:'Zamfara',        longitude:6.24,  latitude:12.17, placeType:'state',   fullName:'Zamfara State, Nigeria',        bbox:[5.0,11.1,7.5,13.1] },
  'kogi':           { name:'Kogi',           longitude:6.74,  latitude:7.73,  placeType:'state',   fullName:'Kogi State, Nigeria',           bbox:[5.6,6.5,8.0,9.0] },
  'abuja':          { name:'Abuja',          longitude:7.49,  latitude:9.06,  placeType:'capital', fullName:'Abuja, FCT, Nigeria',           bbox:[6.8,8.4,8.2,9.7] },
  'lagos':          { name:'Lagos',          longitude:3.38,  latitude:6.52,  placeType:'city',    fullName:'Lagos, Lagos State, Nigeria',   bbox:[2.7,6.3,4.3,6.8] },
  'kano':           { name:'Kano',           longitude:8.51,  latitude:12.00, placeType:'city',    fullName:'Kano, Kano State, Nigeria',     bbox:[8.0,11.5,9.1,12.5] },
  'enugu':          { name:'Enugu',          longitude:7.49,  latitude:6.46,  placeType:'city',    fullName:'Enugu, Enugu State, Nigeria',   bbox:[7.0,6.0,8.0,7.0] },
  'port harcourt':  { name:'Port Harcourt',  longitude:7.01,  latitude:4.77,  placeType:'city',    fullName:'Port Harcourt, Rivers State, Nigeria', bbox:[6.8,4.5,7.4,5.1] },
  'ibadan':         { name:'Ibadan',         longitude:3.89,  latitude:7.37,  placeType:'city',    fullName:'Ibadan, Oyo State, Nigeria',    bbox:[3.5,7.0,4.3,7.8] },
  'abeokuta':       { name:'Abeokuta',       longitude:3.35,  latitude:7.16,  placeType:'city',    fullName:'Abeokuta, Ogun State, Nigeria', bbox:[3.0,6.8,3.7,7.5] },
  'ondo':           { name:'Ondo',           longitude:4.84,  latitude:7.10,  placeType:'state',   fullName:'Ondo State, Nigeria',           bbox:[4.0,5.8,6.1,8.0] },
  'cross river':    { name:'Cross River',    longitude:8.33,  latitude:6.00,  placeType:'state',   fullName:'Cross River State, Nigeria',    bbox:[7.7,4.5,9.6,7.4] },
  'benue':          { name:'Benue',          longitude:8.75,  latitude:7.34,  placeType:'state',   fullName:'Benue State, Nigeria',          bbox:[7.5,6.0,10.1,8.7] },
  'niger':          { name:'Niger',          longitude:5.58,  latitude:9.98,  placeType:'state',   fullName:'Niger State, Nigeria',          bbox:[3.8,8.4,7.4,11.8] },
  'kwara':          { name:'Kwara',          longitude:4.55,  latitude:8.49,  placeType:'state',   fullName:'Kwara State, Nigeria',          bbox:[3.0,7.4,6.3,9.7] },
  'osun':           { name:'Osun',           longitude:4.57,  latitude:7.56,  placeType:'state',   fullName:'Osun State, Nigeria',           bbox:[4.0,7.0,5.2,8.2] },
  'bauchi':         { name:'Bauchi',         longitude:9.84,  latitude:10.31, placeType:'state',   fullName:'Bauchi State, Nigeria',         bbox:[8.9,9.3,11.1,12.3] },
  'gombe':          { name:'Gombe',          longitude:11.17, latitude:10.29, placeType:'state',   fullName:'Gombe State, Nigeria',          bbox:[10.0,9.4,12.2,11.6] },
  'taraba':         { name:'Taraba',         longitude:11.44, latitude:7.87,  placeType:'state',   fullName:'Taraba State, Nigeria',         bbox:[9.8,6.3,12.5,10.0] },
  'nigeria':        { name:'Nigeria',        longitude:8.0,   latitude:9.0,   placeType:'country', fullName:'Nigeria',                       bbox:[2.6,4.2,14.7,13.9] },
};
