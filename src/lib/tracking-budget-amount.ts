export function parseBudgetAmount(input: string, fractionDigits: number): number | null {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 3) return null;
  const value = input.trim();
  if (!/^(?:\d+)(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > fractionDigits) return null;
  const scale = 10 ** fractionDigits;
  const result = Number(whole) * scale + Number(fraction.padEnd(fractionDigits, "0"));
  return Number.isSafeInteger(result) && result > 0 && result <= 1_000_000_000_000 ? result : null;
}

export function budgetAmountInput(amountMinor: number, fractionDigits: number): string {
  const scale = 10 ** fractionDigits;
  return (amountMinor / scale).toFixed(fractionDigits);
}
