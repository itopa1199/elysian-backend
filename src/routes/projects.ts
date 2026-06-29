import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ projects: data || SEED_PROJECTS });
});

router.get('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Project not found' });
  return res.json(data);
});

// Seed data (shown if Supabase table is empty)
const SEED_PROJECTS = [
  { id:'1', name:'Nasarawa Lithium Survey', status:'active', mineral_focus:['Lithium'], region:'North-Central', ai_confidence:96, deposit_count:18, lead_analyst:'Dr. Adaeze N.' },
  { id:'2', name:'Zamfara Gold Mapping',    status:'active', mineral_focus:['Gold'],    region:'North-West',    ai_confidence:88, deposit_count:34, lead_analyst:'Dr. Adaeze N.' },
  { id:'3', name:'Jos Plateau Iron Survey', status:'pending',mineral_focus:['Iron Ore'],region:'North-Central', ai_confidence:91, deposit_count:12, lead_analyst:'Dr. Adaeze N.' },
];

export default router;
