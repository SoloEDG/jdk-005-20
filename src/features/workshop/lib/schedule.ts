import type { Job } from "../../../shared/contracts";
export const queueFinish = (
  jobs: readonly Job[],
  hour: number,
  duration: number,
) =>
  Math.max(
    hour,
    ...jobs.filter((j) => j.status === "queued").map((j) => j.finish),
  ) + duration;
export const queueProgress = (finish: number, hour: number, duration: number) =>
  Math.max(0, Math.min(100, (1 - (finish - hour) / duration) * 100));

/** 指定加工时段：每天 06:00 与 18:00 开班，必须按整段时长完成。 */
const shifts = [6, 18];
export function nextCraftWindow(hour: number) {
  let t = Math.max(0, Math.ceil(hour));
  while (!shifts.includes(t % 24)) t++;
  return t;
}
export function inCraftWindow(start: number, duration: number, finish: number) {
  if (!Number.isInteger(start) || start < 0) return false;
  if (finish - start !== duration) return false;
  return shifts.includes(start % 24);
}
export function craftWindowLabel(hour: number) {
  return `第${Math.floor(hour / 24) + 1}天 ${String(hour % 24).padStart(2, "0")}:00`;
}
