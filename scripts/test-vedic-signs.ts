import assert from "node:assert/strict";
import { getVedicSignsFromChart, signFromLongitude } from "../src/lib/vedic-signs";

// Swiss Ephemeris chart for 1 Jan 2000, 12:00 PM, New Delhi (Lahiri).
const sampleChart = {
  planets: {
    Sun: { sidereal: { sign: "Sagittarius" } },
    Moon: { sidereal: { sign: "Libra" } },
  },
  ascendant: { sign: "Aries", total_longitude: 7.0423 },
  birth_data: { ayanamsa_lahiri: 23.8571 },
};

assert.deepEqual(getVedicSignsFromChart(sampleChart), {
  sun: "Sagittarius",
  moon: "Libra",
  ascendant: "Pisces",
});
assert.equal(signFromLongitude(-0.01), "Pisces");
assert.equal(signFromLongitude(360), "Aries");
assert.equal(signFromLongitude(Number.NaN), null);
assert.equal(getVedicSignsFromChart({ ...sampleChart, birth_data: {} }), null);
assert.equal(getVedicSignsFromChart({ ...sampleChart, planets: {} }), null);

console.log("Vedic sign extraction passed.");
