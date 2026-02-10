import swisseph as swe
from datetime import datetime
from dateutil import tz
from natal_chart import PLANETS, ASPECTS, longitude_to_sign_data, EPHE_PATH
import os

swe.set_ephe_path(EPHE_PATH)


def get_current_planetary_positions():
    now = datetime.now(tz.UTC)
    jd = swe.julday(now.year, now.month, now.day, now.hour + now.minute / 60.0)
    positions = {}
    for pid, pname in PLANETS.items():
        xx, ret = swe.calc_ut(jd, pid, swe.FLG_SPEED)
        positions[pname] = {
            "position": longitude_to_sign_data(xx[0]),
            "retrograde": xx[3] < 0,
            "speed": round(xx[3], 4),
        }
    return {"date": now.isoformat(), "planets": positions}


def find_active_transits(natal_chart: dict) -> list:
    current = get_current_planetary_positions()
    active = []
    transit_orbs = {"conjunction": 3, "opposition": 3, "trine": 2.5, "square": 2.5, "sextile": 2}
    
    priority = {"Pluto": 10, "Neptune": 9, "Uranus": 8, "Saturn": 7,
                "Jupiter": 6, "Mars": 5, "Venus": 4, "Mercury": 3, "Sun": 2, "Moon": 1}
    outer = ["Pluto", "Neptune", "Uranus", "Saturn", "Jupiter"]
    personal = ["Sun", "Moon", "Mercury", "Venus", "Mars"]
    
    for t_name, t_data in current["planets"].items():
        t_lon = t_data["position"]["total_longitude"]
        for n_name, n_data in natal_chart["planets"].items():
            n_lon = n_data["tropical"]["total_longitude"]
            diff = abs(t_lon - n_lon)
            if diff > 180:
                diff = 360 - diff
            for asp_name, orb in transit_orbs.items():
                target = ASPECTS[asp_name]["angle"]
                if abs(diff - target) <= orb:
                    significance = "MAJOR" if (t_name in outer and n_name in personal and asp_name in ["conjunction","opposition","square"]) else "MODERATE"
                    active.append({
                        "transit_planet": t_name,
                        "transit_sign": t_data["position"]["sign"],
                        "natal_planet": n_name,
                        "natal_sign": n_data["tropical"]["sign"],
                        "natal_house": n_data["house_western"],
                        "aspect": asp_name,
                        "orb": round(abs(diff - target), 2),
                        "transit_retrograde": t_data["retrograde"],
                        "significance": significance,
                    })
    
    active.sort(key=lambda t: priority.get(t["transit_planet"], 0), reverse=True)
    return active
