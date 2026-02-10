"""
PalmCosmic Natal Chart Calculator
Uses Swiss Ephemeris (NASA JPL DE431) for 0.0001° precision.
"""

import swisseph as swe
import os
from datetime import datetime
from dateutil import tz
from timezonefinder import TimezoneFinder
from geopy.geocoders import Nominatim

EPHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ephe')
swe.set_ephe_path(EPHE_PATH)

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

SIGN_ELEMENTS = {
    "Aries": "Fire", "Taurus": "Earth", "Gemini": "Air", "Cancer": "Water",
    "Leo": "Fire", "Virgo": "Earth", "Libra": "Air", "Scorpio": "Water",
    "Sagittarius": "Fire", "Capricorn": "Earth", "Aquarius": "Air", "Pisces": "Water"
}

SIGN_MODALITIES = {
    "Aries": "Cardinal", "Taurus": "Fixed", "Gemini": "Mutable",
    "Cancer": "Cardinal", "Leo": "Fixed", "Virgo": "Mutable",
    "Libra": "Cardinal", "Scorpio": "Fixed", "Sagittarius": "Mutable",
    "Capricorn": "Cardinal", "Aquarius": "Fixed", "Pisces": "Mutable"
}

PLANETS = {
    swe.SUN: "Sun", swe.MOON: "Moon", swe.MERCURY: "Mercury",
    swe.VENUS: "Venus", swe.MARS: "Mars", swe.JUPITER: "Jupiter",
    swe.SATURN: "Saturn", swe.URANUS: "Uranus", swe.NEPTUNE: "Neptune",
    swe.PLUTO: "Pluto", swe.MEAN_NODE: "Rahu",
}

ASPECTS = {
    "conjunction":     {"angle": 0,   "orb": 8,   "nature": "major", "harmony": "neutral"},
    "opposition":      {"angle": 180, "orb": 8,   "nature": "major", "harmony": "hard"},
    "trine":           {"angle": 120, "orb": 7,   "nature": "major", "harmony": "soft"},
    "square":          {"angle": 90,  "orb": 7,   "nature": "major", "harmony": "hard"},
    "sextile":         {"angle": 60,  "orb": 5,   "nature": "major", "harmony": "soft"},
    "quincunx":        {"angle": 150, "orb": 3,   "nature": "minor", "harmony": "hard"},
    "semi_sextile":    {"angle": 30,  "orb": 2,   "nature": "minor", "harmony": "neutral"},
    "semi_square":     {"angle": 45,  "orb": 2,   "nature": "minor", "harmony": "hard"},
    "sesquiquadrate":  {"angle": 135, "orb": 2,   "nature": "minor", "harmony": "hard"},
}

DIGNITIES = {
    "Sun":     {"domicile": ["Leo"], "exaltation": ["Aries"], "detriment": ["Aquarius"], "fall": ["Libra"]},
    "Moon":    {"domicile": ["Cancer"], "exaltation": ["Taurus"], "detriment": ["Capricorn"], "fall": ["Scorpio"]},
    "Mercury": {"domicile": ["Gemini", "Virgo"], "exaltation": ["Virgo"], "detriment": ["Sagittarius", "Pisces"], "fall": ["Pisces"]},
    "Venus":   {"domicile": ["Taurus", "Libra"], "exaltation": ["Pisces"], "detriment": ["Scorpio", "Aries"], "fall": ["Virgo"]},
    "Mars":    {"domicile": ["Aries", "Scorpio"], "exaltation": ["Capricorn"], "detriment": ["Libra", "Taurus"], "fall": ["Cancer"]},
    "Jupiter": {"domicile": ["Sagittarius", "Pisces"], "exaltation": ["Cancer"], "detriment": ["Gemini", "Virgo"], "fall": ["Capricorn"]},
    "Saturn":  {"domicile": ["Capricorn", "Aquarius"], "exaltation": ["Libra"], "detriment": ["Cancer", "Leo"], "fall": ["Aries"]},
}

NAKSHATRAS = [
    {"name": "Ashwini", "ruler": "Ketu", "quality": "Swift, healing, new beginnings"},
    {"name": "Bharani", "ruler": "Venus", "quality": "Transformation, bearing responsibility"},
    {"name": "Krittika", "ruler": "Sun", "quality": "Sharp, purifying, courage"},
    {"name": "Rohini", "ruler": "Moon", "quality": "Growth, beauty, sensuality"},
    {"name": "Mrigashira", "ruler": "Mars", "quality": "Searching, curious, gentle"},
    {"name": "Ardra", "ruler": "Rahu", "quality": "Storm, destruction for renewal"},
    {"name": "Punarvasu", "ruler": "Jupiter", "quality": "Renewal, optimism after hardship"},
    {"name": "Pushya", "ruler": "Saturn", "quality": "Nourishing, most auspicious"},
    {"name": "Ashlesha", "ruler": "Mercury", "quality": "Mystical, hypnotic, transformative"},
    {"name": "Magha", "ruler": "Ketu", "quality": "Royal, ancestral power, authority"},
    {"name": "Purva Phalguni", "ruler": "Venus", "quality": "Pleasure, creativity, romance"},
    {"name": "Uttara Phalguni", "ruler": "Sun", "quality": "Patronage, contracts, friendship"},
    {"name": "Hasta", "ruler": "Moon", "quality": "Skill with hands, craftsmanship"},
    {"name": "Chitra", "ruler": "Mars", "quality": "Brilliant, artistic creation"},
    {"name": "Swati", "ruler": "Rahu", "quality": "Independence, flexibility"},
    {"name": "Vishakha", "ruler": "Jupiter", "quality": "Determination, single-pointed focus"},
    {"name": "Anuradha", "ruler": "Saturn", "quality": "Devotion, friendship"},
    {"name": "Jyeshtha", "ruler": "Mercury", "quality": "Seniority, protective, chief"},
    {"name": "Mula", "ruler": "Ketu", "quality": "Root, investigation"},
    {"name": "Purva Ashadha", "ruler": "Venus", "quality": "Invincibility, declaration"},
    {"name": "Uttara Ashadha", "ruler": "Sun", "quality": "Final victory, universal"},
    {"name": "Shravana", "ruler": "Moon", "quality": "Listening, learning, connection"},
    {"name": "Dhanishtha", "ruler": "Mars", "quality": "Wealth, music, adaptability"},
    {"name": "Shatabhisha", "ruler": "Rahu", "quality": "Hundred healers, mystical healing"},
    {"name": "Purva Bhadrapada", "ruler": "Jupiter", "quality": "Transformative fire, spiritual warrior"},
    {"name": "Uttara Bhadrapada", "ruler": "Saturn", "quality": "Depth, wisdom from cosmic ocean"},
    {"name": "Revati", "ruler": "Mercury", "quality": "Journey's end, compassion"},
]


_geocode_cache = {}

COMMON_PLACES = {
    "new delhi, india": {"latitude": 28.6139, "longitude": 77.2090, "timezone": "Asia/Kolkata", "address": "New Delhi, India"},
    "mumbai, india": {"latitude": 19.0760, "longitude": 72.8777, "timezone": "Asia/Kolkata", "address": "Mumbai, India"},
    "bangalore, india": {"latitude": 12.9716, "longitude": 77.5946, "timezone": "Asia/Kolkata", "address": "Bangalore, India"},
    "chennai, india": {"latitude": 13.0827, "longitude": 80.2707, "timezone": "Asia/Kolkata", "address": "Chennai, India"},
    "kolkata, india": {"latitude": 22.5726, "longitude": 88.3639, "timezone": "Asia/Kolkata", "address": "Kolkata, India"},
    "hyderabad, india": {"latitude": 17.3850, "longitude": 78.4867, "timezone": "Asia/Kolkata", "address": "Hyderabad, India"},
    "new york, usa": {"latitude": 40.7128, "longitude": -74.0060, "timezone": "America/New_York", "address": "New York, USA"},
    "los angeles, usa": {"latitude": 34.0522, "longitude": -118.2437, "timezone": "America/Los_Angeles", "address": "Los Angeles, USA"},
    "london, uk": {"latitude": 51.5074, "longitude": -0.1278, "timezone": "Europe/London", "address": "London, UK"},
}

def geocode_place(place_name: str) -> dict:
    place_lower = place_name.lower().strip()
    if place_lower in COMMON_PLACES:
        return COMMON_PLACES[place_lower]
    if place_lower in _geocode_cache:
        return _geocode_cache[place_lower]
    
    geolocator = Nominatim(user_agent="palmcosmic_v2", timeout=10)
    location = geolocator.geocode(place_name)
    if not location:
        raise ValueError(f"Cannot find location: {place_name}")
    tf = TimezoneFinder()
    tz_str = tf.timezone_at(lat=location.latitude, lng=location.longitude)
    result = {
        "latitude": round(location.latitude, 6),
        "longitude": round(location.longitude, 6),
        "timezone": tz_str,
        "address": location.address,
    }
    _geocode_cache[place_lower] = result
    return result


def to_julian_day(year, month, day, hour, minute, second, timezone_str):
    local_tz = tz.gettz(timezone_str)
    local_dt = datetime(year, month, day, hour, minute, second, tzinfo=local_tz)
    utc_dt = local_dt.astimezone(tz.UTC)
    decimal_hour = utc_dt.hour + utc_dt.minute / 60.0 + utc_dt.second / 3600.0
    return swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, decimal_hour)


def longitude_to_sign_data(lon):
    sign_idx = int(lon / 30) % 12
    deg_in_sign = lon % 30
    degrees = int(deg_in_sign)
    minutes = int((deg_in_sign - degrees) * 60)
    seconds = int(((deg_in_sign - degrees) * 60 - minutes) * 60)
    return {
        "sign": SIGNS[sign_idx],
        "sign_index": sign_idx,
        "degree": degrees,
        "minute": minutes,
        "second": seconds,
        "formatted": f"{degrees}°{minutes:02d}'{seconds:02d}\" {SIGNS[sign_idx]}",
        "total_longitude": round(lon, 4),
        "element": SIGN_ELEMENTS[SIGNS[sign_idx]],
        "modality": SIGN_MODALITIES[SIGNS[sign_idx]],
    }


def get_nakshatra(sidereal_lon):
    nak_span = 360 / 27
    nak_idx = int(sidereal_lon / nak_span) % 27
    pos_in_nak = sidereal_lon % nak_span
    pada = int(pos_in_nak / (nak_span / 4)) + 1
    nak = NAKSHATRAS[nak_idx]
    return {
        "name": nak["name"],
        "ruler": nak["ruler"],
        "quality": nak["quality"],
        "pada": pada,
        "degree_in_nakshatra": round(pos_in_nak, 2),
    }


def get_dignity(planet_name, sign):
    if planet_name not in DIGNITIES:
        return "neutral"
    d = DIGNITIES[planet_name]
    for status in ["domicile", "exaltation", "detriment", "fall"]:
        if sign in d[status]:
            return status
    return "neutral"


def find_house(planet_lon, house_cusps):
    for i in range(12):
        cusp_current = house_cusps[i]
        cusp_next = house_cusps[(i + 1) % 12]
        if cusp_current < cusp_next:
            if cusp_current <= planet_lon < cusp_next:
                return i + 1
        else:
            if planet_lon >= cusp_current or planet_lon < cusp_next:
                return i + 1
    return 1


def calculate_natal_chart(year, month, day, hour, minute, second, place_name):
    loc = geocode_place(place_name)
    lat, lon, tz_str = loc["latitude"], loc["longitude"], loc["timezone"]
    jd = to_julian_day(year, month, day, hour, minute, second, tz_str)
    
    swe.set_sid_mode(swe.SIDM_LAHIRI)
    ayanamsa = swe.get_ayanamsa_ut(jd)
    
    cusps_placidus, ascmc_placidus = swe.houses(jd, lat, lon, b'P')
    cusps_wholesign, ascmc_wholesign = swe.houses(jd, lat, lon, b'W')
    
    asc_lon = ascmc_placidus[0]
    mc_lon = ascmc_placidus[1]
    
    houses_western = {}
    for i in range(12):
        houses_western[i + 1] = {
            "cusp_longitude": round(cusps_placidus[i], 4),
            "sign": longitude_to_sign_data(cusps_placidus[i]),
        }
    
    planets = {}
    for pid, pname in PLANETS.items():
        xx, ret = swe.calc_ut(jd, pid, swe.FLG_SPEED | swe.FLG_SWIEPH)
        trop_lon = xx[0]
        sid_lon = (trop_lon - ayanamsa) % 360
        planets[pname] = {
            "tropical": longitude_to_sign_data(trop_lon),
            "sidereal": longitude_to_sign_data(sid_lon),
            "nakshatra": get_nakshatra(sid_lon),
            "dignity": get_dignity(pname, longitude_to_sign_data(trop_lon)["sign"]),
            "house_western": find_house(trop_lon, cusps_placidus),
            "house_vedic": find_house(sid_lon, cusps_wholesign),
            "retrograde": xx[3] < 0,
            "speed_deg_per_day": round(xx[3], 6),
            "latitude": round(xx[1], 4),
        }
    
    rahu_trop = planets["Rahu"]["tropical"]["total_longitude"]
    ketu_trop = (rahu_trop + 180) % 360
    ketu_sid = (ketu_trop - ayanamsa) % 360
    planets["Ketu"] = {
        "tropical": longitude_to_sign_data(ketu_trop),
        "sidereal": longitude_to_sign_data(ketu_sid),
        "nakshatra": get_nakshatra(ketu_sid),
        "dignity": "neutral",
        "house_western": find_house(ketu_trop, cusps_placidus),
        "house_vedic": find_house(ketu_sid, cusps_wholesign),
        "retrograde": True,
        "speed_deg_per_day": 0,
        "latitude": 0,
    }
    
    aspects = []
    planet_names = list(planets.keys())
    for i in range(len(planet_names)):
        for j in range(i + 1, len(planet_names)):
            p1, p2 = planet_names[i], planet_names[j]
            lon1 = planets[p1]["tropical"]["total_longitude"]
            lon2 = planets[p2]["tropical"]["total_longitude"]
            diff = abs(lon1 - lon2)
            if diff > 180:
                diff = 360 - diff
            for asp_name, asp_data in ASPECTS.items():
                orb_actual = abs(diff - asp_data["angle"])
                if orb_actual <= asp_data["orb"]:
                    strength = round(1 - (orb_actual / asp_data["orb"]), 3)
                    aspects.append({
                        "planet1": p1, "planet2": p2,
                        "aspect": asp_name, "nature": asp_data["nature"],
                        "harmony": asp_data["harmony"],
                        "orb": round(orb_actual, 2), "strength": strength,
                    })
    aspects.sort(key=lambda a: a["strength"], reverse=True)
    
    sign_groups = {}
    for pname, pdata in planets.items():
        sign = pdata["tropical"]["sign"]
        sign_groups.setdefault(sign, []).append(pname)
    stelliums = [{"sign": s, "planets": p, "count": len(p)} for s, p in sign_groups.items() if len(p) >= 3]
    
    elements = {"Fire": 0, "Earth": 0, "Air": 0, "Water": 0}
    modalities = {"Cardinal": 0, "Fixed": 0, "Mutable": 0}
    weights = {"Sun": 3, "Moon": 3, "Mercury": 2, "Venus": 2, "Mars": 2,
               "Jupiter": 1, "Saturn": 1, "Uranus": 1, "Neptune": 1, "Pluto": 1}
    for pname, pdata in planets.items():
        w = weights.get(pname, 0)
        if w > 0:
            sign = pdata["tropical"]["sign"]
            elements[SIGN_ELEMENTS[sign]] += w
            modalities[SIGN_MODALITIES[sign]] += w
    asc_sign = longitude_to_sign_data(asc_lon)["sign"]
    elements[SIGN_ELEMENTS[asc_sign]] += 3
    modalities[SIGN_MODALITIES[asc_sign]] += 3
    
    big_three = {
        "sun": {"sign": planets["Sun"]["tropical"]["sign"], "house": planets["Sun"]["house_western"], "degree": planets["Sun"]["tropical"]["formatted"]},
        "moon": {"sign": planets["Moon"]["tropical"]["sign"], "house": planets["Moon"]["house_western"], "degree": planets["Moon"]["tropical"]["formatted"],
                 "nakshatra": planets["Moon"]["nakshatra"]["name"], "nakshatra_pada": planets["Moon"]["nakshatra"]["pada"]},
        "rising": {"sign": asc_sign, "degree": longitude_to_sign_data(asc_lon)["formatted"]},
    }
    
    return {
        "birth_data": {"date": f"{year}-{month:02d}-{day:02d}", "time": f"{hour:02d}:{minute:02d}:{second:02d}",
                       "place": place_name, "latitude": lat, "longitude": lon, "timezone": tz_str,
                       "julian_day": round(jd, 6), "ayanamsa_lahiri": round(ayanamsa, 4)},
        "big_three": big_three,
        "planets": planets,
        "houses": houses_western,
        "ascendant": longitude_to_sign_data(asc_lon),
        "midheaven": longitude_to_sign_data(mc_lon),
        "aspects": aspects,
        "stelliums": stelliums,
        "elements": {"counts": elements, "dominant": max(elements, key=elements.get)},
        "modalities": {"counts": modalities, "dominant": max(modalities, key=modalities.get)},
    }
