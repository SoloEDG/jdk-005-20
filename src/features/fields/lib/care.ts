import type { CareStep, Crop, Item } from "../../../shared/contracts";
import { fieldStepPlans } from "../../../shared/certification";

export function makeCareSteps(item: Item, roundStart: number): CareStep[] {
  return fieldStepPlans[item].map((plan) => ({
    id: plan.id,
    label: plan.label,
    from: roundStart + plan.from,
    to: roundStart + plan.to,
    done: null,
  }));
}

export type StepState = "done" | "open" | "waiting" | "missed";

export function stepState(step: Readonly<CareStep>, hour: number): StepState {
  if (step.done !== null) return "done";
  if (hour < step.from) return "waiting";
  if (hour > step.to) return "missed";
  return "open";
}

/** 旧存档作物没有开始计时点，不能凭空生成可追认的照料历史。 */
export function normalizeCrop(crop: Crop): Crop {
  const legacy = !Array.isArray(crop.steps);
  const roundStart = legacy
    ? crop.planted + (crop.growth ?? 0)
    : crop.roundStart;
  return {
    ...crop,
    round: crop.round ?? 1,
    roundStart,
    steps: legacy ? [] : crop.steps,
    certTrack: legacy ? false : crop.certTrack !== false,
  };
}
