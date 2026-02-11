const ASTRO_ENGINE_URL = process.env.ASTRO_ENGINE_URL || 'http://localhost:8000';

export async function fetchFromAstroEngine(endpoint: string, data: any) {
  const url = `${ASTRO_ENGINE_URL}${endpoint}`;
  
  // 8-second timeout so fallback logic kicks in quickly if engine is unreachable
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Astro engine error (${endpoint}):`, errorText);
      throw new Error(`Astro engine request failed: ${response.status}`);
    }
    
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function calculateNatalChart(birthData: {
  date: string;
  time: string;
  lat: number;
  lon: number;
  tz: string;
}) {
  return fetchFromAstroEngine('/calculate', birthData);
}

export async function calculateDasha(birthData: any) {
  return fetchFromAstroEngine('/dasha', birthData);
}

export async function calculateTransits(data: any) {
  return fetchFromAstroEngine('/transits', data);
}
