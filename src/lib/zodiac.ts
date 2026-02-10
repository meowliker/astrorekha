export interface ZodiacSign {
  name: string;
  symbol: string;
  element: string;
  dates: string;
}

export const zodiacSigns: ZodiacSign[] = [
  { name: "Aries", symbol: "♈", element: "Fire", dates: "Mar 21 - Apr 19" },
  { name: "Taurus", symbol: "♉", element: "Earth", dates: "Apr 20 - May 20" },
  { name: "Gemini", symbol: "♊", element: "Air", dates: "May 21 - Jun 20" },
  { name: "Cancer", symbol: "♋", element: "Water", dates: "Jun 21 - Jul 22" },
  { name: "Leo", symbol: "♌", element: "Fire", dates: "Jul 23 - Aug 22" },
  { name: "Virgo", symbol: "♍", element: "Earth", dates: "Aug 23 - Sep 22" },
  { name: "Libra", symbol: "♎", element: "Air", dates: "Sep 23 - Oct 22" },
  { name: "Scorpio", symbol: "♏", element: "Water", dates: "Oct 23 - Nov 21" },
  { name: "Sagittarius", symbol: "♐", element: "Fire", dates: "Nov 22 - Dec 21" },
  { name: "Capricorn", symbol: "♑", element: "Earth", dates: "Dec 22 - Jan 19" },
  { name: "Aquarius", symbol: "♒", element: "Air", dates: "Jan 20 - Feb 18" },
  { name: "Pisces", symbol: "♓", element: "Water", dates: "Feb 19 - Mar 20" },
];

const monthToIndex: Record<string, number> = {
  "January": 0, "February": 1, "March": 2, "April": 3,
  "May": 4, "June": 5, "July": 6, "August": 7,
  "September": 8, "October": 9, "November": 10, "December": 11,
};

export function getSunSign(month: string, day: number): ZodiacSign {
  const m = monthToIndex[month];
  
  const signIndex = (() => {
    if ((m === 2 && day >= 21) || (m === 3 && day <= 19)) return 0;
    if ((m === 3 && day >= 20) || (m === 4 && day <= 20)) return 1;
    if ((m === 4 && day >= 21) || (m === 5 && day <= 20)) return 2;
    if ((m === 5 && day >= 21) || (m === 6 && day <= 22)) return 3;
    if ((m === 6 && day >= 23) || (m === 7 && day <= 22)) return 4;
    if ((m === 7 && day >= 23) || (m === 8 && day <= 22)) return 5;
    if ((m === 8 && day >= 23) || (m === 9 && day <= 22)) return 6;
    if ((m === 9 && day >= 23) || (m === 10 && day <= 21)) return 7;
    if ((m === 10 && day >= 22) || (m === 11 && day <= 21)) return 8;
    if ((m === 11 && day >= 22) || (m === 0 && day <= 19)) return 9;
    if ((m === 0 && day >= 20) || (m === 1 && day <= 18)) return 10;
    return 11;
  })();
  
  return zodiacSigns[signIndex];
}

export function getMoonSign(month: string, day: number, year: number): ZodiacSign {
  const hash = (parseInt(year.toString()) + monthToIndex[month] + day) % 12;
  return zodiacSigns[hash];
}

export function getAscendant(month: string, day: number, hour: number): ZodiacSign {
  const sunSignIndex = zodiacSigns.findIndex(
    (s) => s.name === getSunSign(month, day).name
  );
  const ascIndex = (sunSignIndex + Math.floor(hour / 2)) % 12;
  return zodiacSigns[ascIndex];
}
