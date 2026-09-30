import assert from "node:assert/strict";
import {
  computeSpiritAnimalResult,
  SPIRIT_ANIMAL_KEYS,
  SPIRIT_ANIMAL_QUESTIONS,
  SPIRIT_ANIMALS,
  SPIRIT_TRAITS,
  type SpiritAnimalAnswer,
} from "../src/lib/spirit-animal-report";

assert.equal(SPIRIT_ANIMAL_QUESTIONS.length, 10, "assessment must contain ten questions");

for (const question of SPIRIT_ANIMAL_QUESTIONS) {
  assert.equal(question.options.length, 6, `${question.id} must contain six options`);
  assert.deepEqual(
    [...new Set(question.options.map((option) => option.primaryTrait))].sort(),
    [...SPIRIT_TRAITS].sort(),
    `${question.id} must expose every trait once as primary`
  );
  assert.deepEqual(
    [...new Set(question.options.map((option) => option.secondaryTrait))].sort(),
    [...SPIRIT_TRAITS].sort(),
    `${question.id} must expose every trait once as secondary`
  );
  for (const option of question.options) {
    assert.notEqual(option.primaryTrait, option.secondaryTrait, `${option.id} must measure two distinct traits`);
  }
}

for (const animalKey of SPIRIT_ANIMAL_KEYS) {
  const values = Object.values(SPIRIT_ANIMALS[animalKey].weights);
  assert.equal(values.filter((value) => value === 2).length, 2, `${animalKey} needs two primary traits`);
  assert.equal(values.filter((value) => value === 1).length, 2, `${animalKey} needs two secondary traits`);
  assert.equal(values.reduce<number>((sum, value) => sum + value, 0), 6, `${animalKey} has an unequal profile size`);
  assert.equal(values.reduce<number>((sum, value) => sum + value * value, 0), 10, `${animalKey} has an unequal profile norm`);
}

for (const trait of SPIRIT_TRAITS) {
  const primaryCount = SPIRIT_ANIMAL_KEYS.filter((key) => SPIRIT_ANIMALS[key].weights[trait] === 2).length;
  const secondaryCount = SPIRIT_ANIMAL_KEYS.filter((key) => SPIRIT_ANIMALS[key].weights[trait] === 1).length;
  assert.equal(primaryCount, 4, `${trait} must have equal primary exposure`);
  assert.equal(secondaryCount, 4, `${trait} must have equal secondary exposure`);
}

let randomState = 123456789;
const random = () => {
  randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
  return randomState / 2 ** 32;
};

const counts = Object.fromEntries(SPIRIT_ANIMAL_KEYS.map((key) => [key, 0])) as Record<(typeof SPIRIT_ANIMAL_KEYS)[number], number>;
const sampleSize = 100_000;
for (let index = 0; index < sampleSize; index += 1) {
  const answers: SpiritAnimalAnswer[] = SPIRIT_ANIMAL_QUESTIONS.map((question) => ({
    questionId: question.id,
    optionId: question.options[Math.floor(random() * question.options.length)].id,
  }));
  const first = computeSpiritAnimalResult(answers);
  const second = computeSpiritAnimalResult(answers);
  assert.equal(first.animalKey, second.animalKey, "the same user and answers must always return the same animal");
  assert.equal(SPIRIT_ANIMAL_KEYS.includes(first.animalKey), true, "every response must return exactly one valid animal");
  counts[first.animalKey] += 1;
}

for (const animalKey of SPIRIT_ANIMAL_KEYS) {
  const share = counts[animalKey] / sampleSize;
  assert.ok(share >= 0.07 && share <= 0.10, `${animalKey} neutral share ${(share * 100).toFixed(2)}% is outside the 7–10% guardrail`);
}

assert.throws(() => computeSpiritAnimalResult([]), /answer all 10 questions/i);

console.log(JSON.stringify({ sampleSize, counts }, null, 2));
