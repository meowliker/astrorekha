import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from natal_chart import calculate_natal_chart
from dasha import calculate_dasha
from transits import get_current_planetary_positions, find_active_transits
from datetime import datetime
import swisseph as swe

# Ensure ephemeris path is set correctly for any environment
EPHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ephe')
if os.path.exists(EPHE_PATH):
    swe.set_ephe_path(EPHE_PATH)

app = FastAPI(title="PalmCosmic Astro Engine", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://palmcosmic.com",
        "https://www.palmcosmic.com",
        "https://palmcosmic.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BirthData(BaseModel):
    year: int
    month: int
    day: int
    hour: int
    minute: int
    second: Optional[int] = 0
    place: str

@app.post("/calculate")
async def full_calculation(data: BirthData):
    try:
        chart = calculate_natal_chart(
            data.year, data.month, data.day,
            data.hour, data.minute, data.second,
            data.place
        )
        moon_sid = chart["planets"]["Moon"]["sidereal"]["total_longitude"]
        birth_dt = datetime(data.year, data.month, data.day, data.hour, data.minute)
        dasha = calculate_dasha(moon_sid, birth_dt)
        active_transits = find_active_transits(chart)
        
        return {
            "success": True,
            "chart": chart,
            "dasha": dasha,
            "active_transits": active_transits,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")

@app.get("/transits/now")
async def current_transits():
    return get_current_planetary_positions()

@app.get("/health")
async def health_check():
    return {"status": "running", "engine": "Swiss Ephemeris"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
