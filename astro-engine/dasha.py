from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

DASHA_YEARS = {
    "Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10, "Mars": 7,
    "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17,
}
DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]
TOTAL_CYCLE = 120
NAK_RULERS = DASHA_ORDER * 3


def calculate_dasha(moon_sidereal_longitude: float, birth_date: datetime) -> dict:
    nak_span = 360 / 27
    nak_idx = int(moon_sidereal_longitude / nak_span) % 27
    pos_in_nak = moon_sidereal_longitude % nak_span
    fraction_remaining = 1 - (pos_in_nak / nak_span)
    
    starting_ruler = NAK_RULERS[nak_idx]
    start_idx = DASHA_ORDER.index(starting_ruler)
    
    mahadashas = []
    current_date = birth_date
    
    for cycle in range(3):
        for i in range(9):
            idx = (start_idx + i) % 9
            ruler = DASHA_ORDER[idx]
            full_years = DASHA_YEARS[ruler]
            
            if cycle == 0 and i == 0:
                years = full_years * fraction_remaining
            else:
                years = full_years
            
            total_days = years * 365.25
            end_date = current_date + timedelta(days=total_days)
            age_start = (current_date - birth_date).days / 365.25
            age_end = (end_date - birth_date).days / 365.25
            
            md = {
                "ruler": ruler,
                "start_date": current_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "duration_years": round(years, 2),
                "age_start": round(age_start, 1),
                "age_end": round(age_end, 1),
                "sub_periods": [],
            }
            
            sub_date = current_date
            for j in range(9):
                sub_idx = (idx + j) % 9
                sub_ruler = DASHA_ORDER[sub_idx]
                sub_years = (DASHA_YEARS[ruler] * DASHA_YEARS[sub_ruler]) / TOTAL_CYCLE
                if cycle == 0 and i == 0:
                    sub_years *= fraction_remaining
                sub_days = sub_years * 365.25
                sub_end = sub_date + timedelta(days=sub_days)
                sub_age_start = (sub_date - birth_date).days / 365.25
                sub_age_end = (sub_end - birth_date).days / 365.25
                
                md["sub_periods"].append({
                    "ruler": sub_ruler,
                    "start_date": sub_date.strftime("%Y-%m-%d"),
                    "end_date": sub_end.strftime("%Y-%m-%d"),
                    "duration_months": round(sub_years * 12, 1),
                    "age_start": round(sub_age_start, 1),
                    "age_end": round(sub_age_end, 1),
                    "label": f"{ruler}/{sub_ruler}",
                })
                sub_date = sub_end
            
            mahadashas.append(md)
            current_date = end_date
            if (current_date - birth_date).days > 100 * 365.25:
                break
        if (current_date - birth_date).days > 100 * 365.25:
            break
    
    now = datetime.now()
    current_md = None
    current_ad = None
    for md in mahadashas:
        md_start = datetime.strptime(md["start_date"], "%Y-%m-%d")
        md_end = datetime.strptime(md["end_date"], "%Y-%m-%d")
        if md_start <= now <= md_end:
            current_md = md["ruler"]
            for ad in md["sub_periods"]:
                ad_start = datetime.strptime(ad["start_date"], "%Y-%m-%d")
                ad_end = datetime.strptime(ad["end_date"], "%Y-%m-%d")
                if ad_start <= now <= ad_end:
                    current_ad = ad["ruler"]
                    break
            break
    
    return {
        "starting_ruler": starting_ruler,
        "balance_at_birth": round(fraction_remaining, 4),
        "current_period": {
            "mahadasha": current_md,
            "antardasha": current_ad,
            "label": f"{current_md} Mahadasha / {current_ad} Antardasha",
        },
        "mahadashas": mahadashas,
    }
