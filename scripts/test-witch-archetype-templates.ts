import assert from "node:assert/strict";
import { scoreWitchAnswers, WITCH_PROFILES, WITCH_QUESTIONS, WITCH_TRAITS, type WitchKey } from "../src/lib/witch-archetype";
import { localWitchTemplate } from "../src/lib/witch-archetype-preview";
import { isWitchTemplate } from "../src/lib/witch-archetype-template";

const keys = Object.keys(WITCH_PROFILES) as WitchKey[];
assert.equal(keys.length, 6);

for (const key of keys) {
  const profile = WITCH_PROFILES[key];
  const template = localWitchTemplate(key);
  assert.ok(isWitchTemplate(template, key), `${key} has a complete template`);
  const qualities = WITCH_TRAITS.map((trait) => template.details.qualities[trait]);
  assert.ok(qualities.every((value) => value >= 25 && value <= 80), `${key} uses the reviewed editorial range`);
  assert.equal(template.details.qualities[profile.primary], 80, `${key} primary quality leads`);
  assert.equal(template.details.qualities[profile.secondary], 70, `${key} secondary quality follows`);
  assert.ok(qualities.reduce((sum, value) => sum + value, 0) > 100, `${key} qualities are independent`);
  assert.ok(template.details.ritual.steps.every((step) => step.trim().length > 10), `${key} ritual has substantive steps`);

  const answers = Object.fromEntries(WITCH_QUESTIONS.map((question) => [question.id, question.options.find((option) => option.trait === profile.primary)!.id]));
  assert.equal(scoreWitchAnswers(answers).key, key, `${key} can be reached by its signature answers`);
}

console.log(`Validated ${keys.length} archetype templates, qualities, rituals, and scoring paths.`);
