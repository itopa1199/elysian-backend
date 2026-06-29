# ELYSIAN Geo AI Backend

Express + TypeScript API that powers the ELYSIAN Geo AI Platform with:
- **Real mineral deposit data** from USGS MRDS (free, no key needed)
- **Live AI chat** via Anthropic Claude (streaming)
- **Location search** with deposit lookup
- **Supabase** for caching + your own verified deposits

---

## Setup (15 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
```

Fill in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...      # console.anthropic.com → API Keys
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...       # Supabase → Settings → API → service_role key
MAPBOX_ACCESS_TOKEN=pk.eyJ...     # account.mapbox.com → Tokens (optional)
```

### 3. Set up Supabase database
1. Go to **supabase.com** → your project → **SQL Editor**
2. Paste the entire contents of `supabase_schema.sql`
3. Click **Run** — this creates all tables and seeds real deposit data

### 4. Run the backend
```bash
npm run dev
```

Server starts at `http://localhost:3001`

---

## API Routes

### Search any location
```
GET /api/search?q=Nasarawa
GET /api/search?q=Lithium
GET /api/search?q=8.52,8.56
```
Returns: location coordinates + all mineral deposits found there (real USGS data)

### Get deposits near coordinates
```
GET /api/minerals/nearby?lon=8.52&lat=8.56&radius=150
GET /api/minerals/nearby?lon=8.52&lat=8.56&mineral=Lithium
```

### All Nigeria deposits as GeoJSON
```
GET /api/minerals/geojson
GET /api/minerals/geojson?mineral=Gold
```

### AI Chat (streaming)
```
POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "What minerals are near Jos Plateau?" }
  ],
  "context": {
    "activeProject": "Nasarawa Lithium Survey",
    "mapCenter": { "lon": 8.89, "lat": 9.90 },
    "visibleLocation": "Jos Plateau"
  }
}
```
Returns Server-Sent Events stream.

### Location AI Analysis (one-shot)
```
POST /api/chat/analyze-location
{ "location": "Nasarawa", "lon": 8.52, "lat": 8.56 }
```

---

## Connect to your Frontend

In your `ELYSIAN_GeoAI_Platform.html`, update:

```javascript
const API_BASE = 'http://localhost:3001/api';  // dev
// const API_BASE = 'https://your-api.railway.app/api';  // prod

// Search → gets real data
async function searchLocation(q) {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (data.found) {
    flyTo(data.location.longitude, data.location.latitude);
    plotDeposits(data.deposits);  // plot real USGS deposits on map
    updateSidebar(data.top_minerals);
  }
}

// AI Chat → real streaming from Claude
async function sendAIMessage(message, mapCenter) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: chatHistory,
      context: { mapCenter, activeProject: currentProject }
    })
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Read SSE stream...
}
```

---

## Deploy to Railway (free)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set env vars in Railway dashboard
# Your API will be live at https://your-app.railway.app
```

---

## Data Sources

| Source | What it provides | Cost |
|--------|-----------------|------|
| USGS MRDS | Global mineral deposit records including Nigeria | Free |
| NGSA (seeded in Supabase) | Nigerian Geological Survey verified deposits | Free |
| Anthropic Claude | AI geological analysis and chat | ~$0.003/query |
| Mapbox Geocoding | Place name → coordinates | Free tier: 100k/month |
