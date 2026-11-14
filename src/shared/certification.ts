import type { Item } from "./contracts";
import { itemName } from "./catalog";

/** 认证类别由“环节 + 品名”固定生成，不能只靠改名获得。 */
export const fieldCategory = (item: Item) => `field:${item}`;
export const craftCategory = (item: Item) => `craft:${item}`;
export const categoryKind = (category: string): "field" | "craft" =>
  category.startsWith("craft:") ? "craft" : "field";
export const categoryItem = (category: string) =>
  category.slice(category.indexOf(":") + 1) as Item;
export const categoryLabel = (category: string) =>
  categoryKind(category) === "craft"
    ? `工坊认证·${itemName(categoryItem(category))}`
    : `田间认证·${itemName(categoryItem(category))}`;

export interface StepPlan {
  id: string;
  label: string;
  /** 相对本轮起点的合法时间窗口，闭区间。 */
  from: number;
  to: number;
}

/** 认证照料步骤与普通浇水互相独立，各有自己的时间窗口。 */
export const fieldStepPlans: Record<Item, StepPlan[]> = {
  carrot: [
    { id: "s1", label: "巡田记录", from: 3, to: 6 },
    { id: "s2", label: "人工除草", from: 7, to: 10 },
  ],
  corn: [
    { id: "s1", label: "巡田记录", from: 5, to: 9 },
    { id: "s2", label: "培土固根", from: 11, to: 16 },
  ],
  berry: [
    { id: "s1", label: "疏果检查", from: 6, to: 12 },
    { id: "s2", label: "追肥记录", from: 15, to: 21 },
  ],
  jam: [],
  flour: [],
};

export const fieldRequiredSegments = (item: Item) => [
  ...fieldStepPlans[item].map((s) => s.label),
  "收获",
];
export const craftRequiredSegments = () => ["合格输入份额", "指定加工时段"];
export const requiredSegments = (category: string) =>
  categoryKind(category) === "craft"
    ? craftRequiredSegments()
    : fieldRequiredSegments(categoryItem(category));
