# PalmCosmic Architecture Rules

## System Overview
PalmCosmic has 3 new modules being added to the existing app:
1. Astro Engine — Python FastAPI microservice (runs separately on port 8000)
2. Palm Vision — Claude Vision API integration (runs in the main app)  
3. Reading Generator — Claude API integration (runs in the main app)

## Rules
- The astro-engine/ folder is a SEPARATE Python project with its own venv
- The main app communicates with astro-engine via HTTP (POST http://localhost:8000/calculate)
- All AI prompts are stored in a prompts/ folder and must NEVER be modified by AI assistants
- Palm analysis uses Claude claude-sonnet-4-5-20250929 model
- Reading generation uses Claude claude-sonnet-4-5-20250929 model
- Swiss Ephemeris (pyswisseph) is the ONLY astrology calculation library — do not substitute
- Ephemeris data files (.se1) go in astro-engine/ephe/
- All calculations use both Western (tropical/Placidus) AND Vedic (sidereal/Whole Sign) systems

## Data Flow
User takes palm photo → Claude Vision extracts 50+ data points (JSON)
User enters birth data → Astro Engine calculates full chart + Dasha + transits
Both outputs + user context → Claude API generates 800-1500 word reading

## API Endpoints (Astro Engine - Port 8000)
- POST /calculate — Full natal chart + Dasha + transits
- GET /transits/now — Current planetary positions
- GET /health — Health check

## Cost Per Reading
- Palm analysis: ~$0.02 (Claude Vision)
- Chart calculation: $0 (self-hosted)
- Reading generation: ~$0.03-0.05 (Claude API)
- Total: ~$0.05-0.07 per reading
