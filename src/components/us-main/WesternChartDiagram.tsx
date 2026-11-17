import type { WesternChart } from "@/lib/western-zodiac";

// Preserve the diamond presentation; place planets using the engine's actual
// Placidus house values, never sign order or a sidereal conversion.
const CELLS = [[200,100],[100,43],[43,100],[100,200],[43,300],[100,357],[200,300],[300,357],[357,300],[300,200],[357,100],[300,43]];
const ABBREVIATIONS: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mercury: "Me", Venus: "Ve", Mars: "Ma",
  Jupiter: "Ju", Saturn: "Sa", Uranus: "Ur", Neptune: "Ne", Pluto: "Pl",
  "North Node": "NN", "South Node": "SN",
};

export default function WesternChartDiagram({ data }: { data: WesternChart }) {
  if (!data.knowsBirthTime) return null;
  return <svg viewBox="0 0 400 400" role="img" aria-label="Western tropical birth chart, planets in Placidus houses" className="w-full h-full bg-white text-black">
    <title>Western tropical birth chart</title>
    <desc>H1 to H12 are houses. Asc marks the first house. Planet positions use the saved Western chart.</desc>
    <g fill="none" stroke="#666" strokeWidth="1"><rect x="8" y="8" width="384" height="384" /><path d="M8 8L392 392M392 8L8 392M200 8L392 200L200 392L8 200Z" /></g>
    {CELLS.map(([x,y], index) => {
      const house = index + 1;
      const planets = Object.entries(data.planets).filter(([, planet]) => planet.house === house);
      const labels = planets.map(([name, planet]) => `${ABBREVIATIONS[name] || name}${planet.retrograde ? " ℞" : ""}`);
      const rows = labels.length > 3 ? Array.from({length:Math.ceil(labels.length/2)},(_,i)=>labels.slice(i*2,i*2+2).join("  ")) : labels;
      const lineHeight = rows.length > 4 ? 8 : 13;
      const firstRowY = y + 8 - Math.max(0, rows.length - 1) * lineHeight / 2;
      return <g key={house} data-house={house}>
        <title>{`House ${house}${house===1 ? ` · Ascendant ${data.ascendant}` : ""}: ${planets.map(([name])=>name).join(", ") || "No planets"}`}</title>
        <text x={x} y={firstRowY-16} textAnchor="middle" fontSize="10" fill="#555">H{house}{house===1 ? " · Asc" : ""}</text>
        {rows.map((label,row)=><text key={row} x={x} y={firstRowY+row*lineHeight} textAnchor="middle" fontSize={rows.length>4 ? 8 : 12} fill="#111">{label}</text>)}
      </g>;
    })}
  </svg>;
}
