import type { Batch, Credential } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";

export function makeBatch(
  item: Batch["item"],
  quantity: number,
  quality: number,
  hour: number,
  id: string,
  source = "收获",
  credential?: string,
): Batch {
  return {
    id,
    item,
    quantity,
    quality,
    source,
    expires: hour + items[item].life,
    ...(credential ? { credential } : {}),
  };
}

export function summarize(batches: readonly Batch[]) {
  return batches.reduce((n, b) => n + b.quantity, 0);
}

/** 凭证按批保留；每批的剩余数量不能超过凭证标注的份额。 */
export function credentialRoom(credential: Credential, batches: readonly Batch[]) {
  const used = batches
    .filter((b) => b.credential === credential.id)
    .reduce((n, b) => n + b.quantity, 0);
  return Math.max(0, credential.quantity - used);
}
