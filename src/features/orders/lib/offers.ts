import type { Item, Order } from "../../../shared/contracts";
import { craftCategory, fieldCategory } from "../../../shared/certification";

const baseReward = (item: Item) => (item === "jam" || item === "flour" ? 42 : 30);
const categoryFor = (item: Item) =>
  item === "jam" || item === "flour" ? craftCategory(item) : fieldCategory(item);

/** 村民按认证类别生成固定奖励合同：奖励只由类别与数量决定。 */
export function contractReward(category: string, quantity: number) {
  const base = category.startsWith("craft:") ? 42 : 30;
  return Math.round(quantity * base * 1.6);
}

export function initialOrders(hour: number): Order[] {
  return [
    {
      id: "o1",
      item: "carrot",
      quantity: 5,
      reward: contractReward(fieldCategory("carrot"), 5),
      minQuality: 2,
      category: fieldCategory("carrot"),
      deadline: hour + 36,
      status: "open",
    },
    {
      id: "o2",
      item: "jam",
      quantity: 2,
      reward: contractReward(craftCategory("jam"), 2),
      minQuality: 2,
      category: craftCategory("jam"),
      deadline: hour + 48,
      status: "open",
    },
    {
      id: "o3",
      item: "flour",
      quantity: 3,
      reward: contractReward(craftCategory("flour"), 3),
      minQuality: 2,
      category: craftCategory("flour"),
      deadline: hour + 60,
      status: "open",
    },
  ];
}

export function nextOrder(serial: number, hour: number): Order {
  const item: Item = serial % 2 ? "corn" : "berry";
  const category = categoryFor(item);
  const quantity = 4;
  return {
    id: `o${serial}`,
    item,
    quantity,
    reward: contractReward(category, quantity),
    minQuality: 2,
    category,
    deadline: hour + 48,
    status: "open",
  };
}

export { baseReward };
