import type { Batch, Reservation } from "../../../shared/contracts";

export function available(batch: Batch, reservations: Reservation[]) {
  const held = reservations
    .flatMap((r) => r.allocations)
    .filter((a) => a.batch === batch.id)
    .reduce((n, a) => n + a.quantity, 0);
  return batch.quantity - held;
}
