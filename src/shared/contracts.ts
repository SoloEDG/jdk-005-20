export type Item = "carrot" | "corn" | "berry" | "jam" | "flour";
export type Weather = "sun" | "rain" | "wind";
export interface CareStep {
  id: string;
  label: string;
  /** 合法时间窗口，闭区间。 */
  from: number;
  to: number;
  /** 玩家在窗口内单独确认的时刻；未确认为 null。 */
  done: number | null;
}
export interface Crop {
  item: Item;
  planted: number;
  growth: number;
  water: number;
  stress: number;
  harvests: number;
  /** 当前收获轮次，从 1 开始。 */
  round: number;
  /** 本轮开始计时点（播种或上次收获）。 */
  roundStart: number;
  /** 本轮可核验的认证照料步骤。 */
  steps: CareStep[];
  /** 旧存档作物没有历史照料记录，不能追认认证。 */
  certTrack: boolean;
}
export interface Plot {
  id: number;
  crop: Crop | null;
}
export interface Evidence {
  segment: string;
  label: string;
  at: number;
  actor: string;
  /** 该记录合法的绝对时间窗口，用于事后复核。 */
  window?: { from: number; to: number };
  note?: string;
}
export interface Credential {
  id: string;
  category: string;
  item: Item;
  quantity: number;
  issued: number;
  origin: string;
  evidence: Evidence[];
}
export interface Receipt {
  quality: number;
  sources: readonly string[];
  quantity: number;
  /** 只记录消费时确实存在、通过复核且未被占用的认证份额。 */
  certified: CertifiedShare[];
}
export interface CertifiedShare {
  credential: string;
  category: string;
  quantity: number;
  origin: string;
  issued: number;
  evidence: Evidence[];
}
export interface Batch {
  id: string;
  item: Item;
  quantity: number;
  quality: number;
  source: string;
  expires: number;
  /** 关联仓库中的认证凭证；普通批次没有凭证。 */
  credential?: string;
  /** 旧存档货物：保留原星级，但明确未认证。 */
  legacy?: boolean;
}
export interface Allocation {
  batch: string;
  quantity: number;
}
export interface Reservation {
  id: string;
  owner: string;
  allocations: Allocation[];
  at: number;
}
export interface JobCertification {
  inputQuantity: number;
  inputTotal: number;
  inputCategory: string;
  windowOk: boolean;
  outputQuantity: number;
  certifiedQuantity: number;
  category: string;
  evidence: Evidence[];
}
export interface Job {
  id: string;
  recipe: string;
  reservation: string;
  receipt?: Receipt;
  finish: number;
  /** 指定加工时段内的开工时刻。 */
  start: number;
  status: "queued" | "ready" | "claimed" | "failed";
  cert?: JobCertification;
  /** 加工完成时按合格输入与加工时段预签的成品凭证。 */
  pending?: Credential;
  /** 旧存档工序没有开工记录，不补发认证。 */
  legacy?: boolean;
}
export interface Order {
  id: string;
  item: Item;
  quantity: number;
  reward: number;
  minQuality: number;
  deadline: number;
  /** 村民合同要求的认证类别，固定生成，不随改名变化。 */
  category: string;
  status: "open" | "reserved" | "delivered" | "expired";
  reservation?: string;
  /** 最近一次备货失败时的解释：哪一段记录欠缺。 */
  shortfall?: string;
}
export interface StockReport {
  item: Item;
  required: number;
  qualified: number;
  certified: number;
  ordinary: number;
  category: string;
  /** 认证份数只覆盖了哪几段记录，用于解释欠缺。 */
  segments: { segment: string; covered: number }[];
  missingSegments: string[];
  message: string;
}
export interface ContractEvent {
  id: string;
  order: string;
  at: number;
  kind: "reserve" | "cancel" | "deliver" | "expire";
  detail: string;
}
export interface Tick {
  from: number;
  to: number;
  weather: Weather;
}
export type Notice = (message: string) => void;
