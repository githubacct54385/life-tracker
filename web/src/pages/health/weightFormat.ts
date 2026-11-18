import { fromPounds, toPounds, type WeightUnit } from "@life-tracker/shared";

export const UNIT_LABEL: Record<WeightUnit, string> = { lb: "lb", kg: "kg" };

/** Pounds as shown in the owner's unit, "172.4 lb" or "78.2 kg" (AC-HLT-01.4). */
export const formatWeight = (pounds: number, unit: WeightUnit) => `${fromPounds(pounds, unit).toFixed(1)} ${UNIT_LABEL[unit]}`;

/** The text shown when editing an entry, in the owner's unit: "172.4". */
export const weightToInput = (pounds: number, unit: WeightUnit) => fromPounds(pounds, unit).toFixed(1);

/**
 * What the owner typed (in their unit) -> pounds to 0.1 for storage, or undefined when it is not a usable weight.
 * Accepts "172", "172.4" and "172,4". Entry is capped at three digits before the point.
 */
export function parseWeight(text: string, unit: WeightUnit): number | undefined {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return undefined;
  const value = Number(`${match[1]}.${match[2] ?? "0"}`);
  if (!(value > 0)) return undefined;
  try {
    const pounds = toPounds(value, unit);
    return pounds >= 20 && pounds <= 1500 ? pounds : undefined;
  } catch {
    return undefined;
  }
}
