import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Database types ──
export interface MineralDeposit {
  id: string;
  name: string;
  mineral_type: string;        // 'Lithium' | 'Gold' | 'Iron Ore' | 'Rare Earth' | etc.
  deposit_type: string;        // 'Pegmatite' | 'Placer' | 'BIF' | etc.
  longitude: number;
  latitude: number;
  state: string;               // Nigerian state
  lga: string;                 // Local Government Area
  ai_probability: number;      // 0-100
  estimated_tonnage: string;   // e.g. '2.4M tonnes LCE'
  deposit_grade: string;       // 'High' | 'Medium' | 'Low'
  survey_confidence: number;   // 0-100
  source: string;              // 'USGS_MRDS' | 'NGSA' | 'AI_DETECTED'
  last_surveyed: string;       // ISO date
  description: string;
  recommended_action: string;
  created_at: string;
}

export interface SurveyProject {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'pending' | 'completed';
  lead_analyst: string;
  mineral_focus: string[];
  region: string;
  start_date: string;
  deposit_count: number;
  ai_confidence: number;
  created_at: string;
}
