import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { fetchDepositsNearPoint, normalizeMineralName } from '../services/usgs';
import { geocodeLocation } from '../services/geocoding';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Message schema
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).min(1).max(20),
  // Map context — what the user is currently looking at
  context: z.object({
    activeProject: z.string().optional(),
    visibleLocation: z.string().optional(),
    mapCenter: z.object({ lon: z.number(), lat: z.number() }).optional(),
    activeLayers: z.array(z.string()).optional(),
    selectedMineral: z.string().optional(),
  }).optional(),
});

/**
 * POST /api/chat
 * Streaming AI chat with geological context
 *
 * The AI knows:
 * - What project the user is viewing
 * - What location is on the map
 * - Real deposit data near their current map view
 * - Nigerian geology context
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const { messages, context } = parsed.data;

  try {
    // ── Build context for AI ──
    let contextBlock = '';
    let nearbyDeposits: any[] = [];

    if (context?.mapCenter) {
      const { lon, lat } = context.mapCenter;
      // Fetch real nearby deposits to ground the AI response
      nearbyDeposits = await fetchDepositsNearPoint(lon, lat, 150);
      const mineralCounts: Record<string, number> = {};
      nearbyDeposits.forEach(d => {
        const m = normalizeMineralName(d.commod1);
        mineralCounts[m] = (mineralCounts[m] || 0) + 1;
      });
      const summary = Object.entries(mineralCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([m, c]) => `${m}: ${c} deposit${c > 1 ? 's' : ''}`)
        .join(', ');

      contextBlock = `
CURRENT MAP STATE:
- Map center: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E
- Active project: ${context.activeProject || 'Nasarawa Lithium Survey'}
- Visible location: ${context.visibleLocation || 'Nigeria'}
- Active layers: ${context.activeLayers?.join(', ') || 'All layers'}
- Selected mineral: ${context.selectedMineral || 'None'}
- Nearby deposits (${nearbyDeposits.length} total from USGS MRDS): ${summary || 'None found in this area'}
      `.trim();
    }

    // ── System prompt ──
    const systemPrompt = `You are Geo AI, the intelligent assistant for the ELYSIAN Geo AI Platform — a geospatial mineral survey tool for Nigeria.

You are speaking with Dr. Adaeze N., a Geological Analyst.

YOUR EXPERTISE:
- Nigerian geology, mineral deposits, and geological formations
- Lithium pegmatite deposits (Nasarawa, Plateau State)
- Gold deposits (Zamfara, Kaduna, Osun greenstone belts)
- Iron ore (Jos Plateau BIF formations)
- Rare earth elements (Kogi carbonatite intrusions)
- Tin/Columbite-Tantalite (Jos Plateau)
- Geospatial analysis and survey methodology
- USGS MRDS data interpretation
- Nigeria Geological Survey Agency (NGSA) data

RESPONSE STYLE:
- Be concise, data-driven, and professional
- Quote specific coordinates, tonnage estimates, and confidence levels when known
- Recommend concrete next actions (e.g., "Deploy magnetometric survey", "Submit drill permit")
- Reference real Nigerian geological formations and Nigerian Geological Survey data
- Keep responses under 150 words unless detail is specifically requested
- Use metric units

${contextBlock ? `\nCURRENT CONTEXT:\n${contextBlock}` : ''}

IMPORTANT: You have access to real USGS MRDS deposit data for the user's current map view. Base your responses on this data when relevant.`;

    // ── Set up streaming response ──
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // ── Stream from Anthropic ──
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
      }
    }

    // Send nearby deposits as structured data at end of stream
    if (nearbyDeposits.length > 0) {
      const depositSummary = nearbyDeposits.slice(0, 10).map(d => ({
        name: d.name,
        mineral: normalizeMineralName(d.commod1),
        lon: d.longitude,
        lat: d.latitude,
        type: d.depositType,
      }));
      res.write(`data: ${JSON.stringify({ type: 'deposits', deposits: depositSummary })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'AI chat failed' });
    }
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI response failed' })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/chat/analyze-location
 * One-shot location analysis (no streaming)
 * Used when user searches a location — auto-generates AI summary
 */
router.post('/analyze-location', async (req: Request, res: Response) => {
  const schema = z.object({ location: z.string(), lon: z.number(), lat: z.number() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid params' });

  const { location, lon, lat } = parsed.data;

  try {
    const deposits = await fetchDepositsNearPoint(lon, lat, 150);
    const counts: Record<string, number> = {};
    deposits.forEach(d => { const m = normalizeMineralName(d.commod1); counts[m] = (counts[m]||0)+1; });
    const summary = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([m,c])=>`${c} ${m}`).join(', ');

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Analyze the geological significance of ${location} (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E) in Nigeria. USGS data shows: ${summary || 'no deposits in database'}. Give a 2-3 sentence expert geological summary and the top recommended action. Be specific to Nigerian geology.`,
      }],
      system: 'You are a Nigerian geological survey expert AI. Be concise, data-driven, and reference specific Nigerian geological formations.',
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return res.json({
      location,
      analysis: text,
      deposit_count: deposits.length,
      top_minerals: Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([m,c])=>({mineral:m,count:c})),
    });

  } catch (error) {
    return res.status(500).json({ error: 'Analysis failed' });
  }
});

export default router;
