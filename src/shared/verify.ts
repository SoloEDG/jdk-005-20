import type {
  Credential,
  Evidence,
  Item,
  Receipt,
} from "./contracts";
import {
  categoryItem,
  categoryKind,
  categoryLabel,
  craftRequiredSegments,
  fieldRequiredSegments,
  fieldStepPlans,
} from "./certification";

let credentialSerial = 0;
/** 读档后接续凭证序号，避免新凭证与既有编号相撞。 */
export function adoptCredentialSerial(ids: readonly string[]) {
  for (const id of ids) {
    const match = /^c(\d+)$/.exec(id);
    if (match) credentialSerial = Math.max(credentialSerial, Number(match[1]));
  }
}
export const makeCredential = (
  category: string,
  item: Item,
  quantity: number,
  issued: number,
  origin: string,
  evidence: Evidence[],
): Credential => ({
  id: `c${++credentialSerial}`,
  category,
  item,
  quantity,
  issued,
  origin,
  evidence,
});

/**
 * 田间凭证只在全部照料步骤于各自窗口内单独确认、且收获状态合格时签发。
 * 记录发生即写入，之后补浇水、读档或拆分批次都无法改写已有时间戳。
 */
export function fieldEvidence(
  certTrack: boolean,
  steps: readonly {
    label: string;
    from: number;
    to: number;
    done: number | null;
  }[],
  harvestAt: number,
): Evidence[] | null {
  if (!certTrack || !steps.length) return null;
  const evidence: Evidence[] = [];
  for (const step of steps) {
    if (step.done === null || step.done < step.from || step.done > step.to)
      return null;
    evidence.push({
      segment: step.label,
      label: step.label,
      at: step.done,
      actor: "农场主",
      window: { from: step.from, to: step.to },
    });
  }
  evidence.push({
    segment: "收获",
    label: "收获",
    at: harvestAt,
    actor: "农场主",
    window: { from: harvestAt, to: harvestAt },
  });
  return evidence;
}

/**
 * 工坊凭证要求“全部合格输入 + 指定加工时段”。
 * 输入的田间记录逐段并入；混入普通输入时按份额比例只认证对应产出。
 */
export function craftEvidence(
  receipt: Receipt,
  windowOk: boolean,
  start: number,
  finish: number,
): Evidence[] {
  const evidence: Evidence[] = [];
  const certifiedInputs = receipt.certified.reduce((n, s) => n + s.quantity, 0);
  if (certifiedInputs > 0 && receipt.quantity > 0)
    evidence.push({
      segment: "合格输入份额",
      label: "合格输入份额",
      at: start,
      actor: "工坊",
      window: { from: start, to: finish },
      note: `${certifiedInputs}/${receipt.quantity} 份携带田间凭证`,
    });
  for (const record of receipt.certified.flatMap((s) => s.evidence))
    evidence.push({ ...record, actor: "工坊" });
  if (windowOk)
    evidence.push({
      segment: "指定加工时段",
      label: "指定加工时段",
      at: start,
      actor: "工坊",
      window: { from: start, to: finish },
    });
  return evidence;
}

/** 复核凭证：类别、必要记录段、以及每条记录的合法时间窗口。 */
export function verifyCredential(
  credential: Credential,
  kind: "field" | "craft",
): string | null {
  if (categoryKind(credential.category) !== kind) return "凭证类别不符";
  const required =
    kind === "craft"
      ? craftRequiredSegments()
      : fieldRequiredSegments(categoryItem(credential.category));
  const labels = new Set(credential.evidence.map((e) => e.segment));
  for (const segment of required)
    if (!labels.has(segment)) return `缺少${segment}记录`;
  for (const record of credential.evidence) {
    if (!record.window) return `无法复核${record.segment}`;
    if (record.at > record.window.to) return `${record.segment}晚于合法窗口`;
    if (record.at < record.window.from) return `${record.segment}早于合法窗口`;
  }
  if (kind === "field") {
    const plans = fieldStepPlans[categoryItem(credential.category)];
    const fieldRecords = credential.evidence.filter((e) => e.segment !== "收获");
    if (plans.length && fieldRecords.length !== plans.length)
      return "照料记录段数与作物不符";
  }
  return null;
}

/** 备货解释：说明认证类别、可用份额与欠缺的具体记录段。 */
export function stockMessage(
  category: string,
  required: number,
  qualified: number,
  shortfall: string | null,
) {
  const label = categoryLabel(category);
  if (qualified >= required)
    return `可用${label} ${qualified}/${required}，可提交`;
  const parts = [`可用${label} ${qualified}/${required}`];
  if (shortfall) parts.push(`欠缺：${shortfall}`);
  else parts.push(`还缺 ${required - qualified}，普通批次不能替代认证`);
  return parts.join("；");
}
