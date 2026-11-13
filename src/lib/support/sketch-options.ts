import { SKETCH_QUESTION_BANK } from "@/lib/layout-b-funnel";
import { SupportError } from "./policy";
export const sketchFields = SKETCH_QUESTION_BANK.filter((q) =>
  ["attracted_to", "age_group", "vibe", "main_worry", "future_goal"].includes(
    q.id,
  ),
).map(({ id, title, options }) => ({
  id,
  title,
  options: options.map(({ value, label }) => ({ value, label })),
  multiple: ["main_worry", "future_goal"].includes(id),
}));
export function sketchPatch(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SupportError(
      "Provide the customer-confirmed sketch answer changes",
    );
  const entries = Object.entries(value);
  if (!entries.length)
    throw new SupportError("Select at least one sketch detail to correct");
  return Object.fromEntries(
    entries.map(([key, raw]) => {
      const field = sketchFields.find((f) => f.id === key);
      if (!field || typeof raw !== "string")
        throw new SupportError("Unknown sketch field or invalid answer");
      const values = raw.split(",").map((v) => v.trim());
      if (
        (!field.multiple && values.length !== 1) ||
        values.some((v) => !field.options.some((o) => o.value === v))
      )
        throw new SupportError(`Select a supported value for ${key}`);
      return [key, [...new Set(values)].join(",")];
    }),
  );
}
export function safeSketchAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    SKETCH_QUESTION_BANK.flatMap((f) => {
      const v = (value as Record<string, unknown>)[f.id];
      return typeof v === "string" ? [[f.id, v.slice(0, 500)]] : [];
    }),
  );
}
