"use client";
import { useState } from "react";
import { sketchFields } from "@/lib/support/sketch-options";
export default function SketchCorrection({
  answers,
  updatedAt,
  unlocked,
  busy,
  submit,
}: {
  answers: Record<string, string>;
  updatedAt: string | null;
  unlocked: boolean;
  busy: boolean;
  submit: (payload: Record<string, unknown>) => void;
}) {
  const [changes, setChanges] = useState<Record<string, string>>({});
  return (
    <details className="support-panel">
      <summary>Correct Soulmate Sketch details</summary>
      <p>
        Change only the details the customer requested. Other saved answers are
        preserved. The corrected sketch is generated and verified before a reply
        is prepared.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ answers: changes, expectedUpdatedAt: updatedAt });
        }}
      >
        <div className="support-report-grid">
          {sketchFields.map((field) => (
            <label key={field.id}>
              {field.title}
              <select
                aria-label={field.title}
                multiple={field.multiple}
                value={
                  field.multiple
                    ? (changes[field.id] ?? answers[field.id] ?? "")
                        .split(",")
                        .filter(Boolean)
                    : (changes[field.id] ?? answers[field.id] ?? "")
                }
                onChange={(e) => {
                  const value = field.multiple
                    ? Array.from(e.target.selectedOptions, (o) => o.value).join(
                        ",",
                      )
                    : e.target.value;
                  setChanges((old) => {
                    const next = { ...old };
                    if (value === (answers[field.id] ?? ""))
                      delete next[field.id];
                    else next[field.id] = value;
                    return next;
                  });
                }}
              >
                {!field.multiple && <option value="">Not specified</option>}
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p>
          The correction uses the evidence entered in Case context. A partner
          preference does not change the customer’s own gender or birth details.
        </p>
        <button
          disabled={
            busy || !unlocked || !updatedAt || !Object.keys(changes).length
          }
        >
          Correct details & regenerate sketch
        </button>
      </form>
    </details>
  );
}
