import { reactive, readonly } from "vue";
import type {
  Batch,
  Credential,
  Item,
  Notice,
  Receipt,
  Reservation,
  StockReport,
} from "../../../shared/contracts";
import {
  categoryItem,
  categoryKind,
  requiredSegments,
} from "../../../shared/certification";
import {
  adoptCredentialSerial,
  stockMessage,
  verifyCredential,
} from "../../../shared/verify";
import { available } from "../lib/allocation";
import { credentialRoom, makeBatch } from "../lib/storage";

export function createWarehouse(now: () => number, notice: Notice) {
  const state = reactive({
    batches: [] as Batch[],
    reservations: [] as Reservation[],
    /** 每批货物的认证凭证按凭证号保留，与批次同生共死。 */
    credentials: [] as Credential[],
    serial: 0,
    wasted: 0,
  });

  const findBatch = (id: string) =>
    state.batches.find((b) => b.id === id) ?? null;
  const findCredential = (id?: string) =>
    id ? state.credentials.find((c) => c.id === id) ?? null : null;
  const validCredential = (batch: Batch) => {
    const c = findCredential(batch.credential);
    if (!c) return null;
    return verifyCredential(c, categoryKind(c.category)) ? null : c;
  };

  /**
   * 入仓必须携带可复核的凭证才能保留认证。普通高星货没有凭证，
   * 不能只改名称就当作认证品；凭证不通过复核时只能作为普通货。
   */
  const add = (
    item: Item,
    n: number,
    q = 1,
    hour = now(),
    source = "田间收获",
    credential?: Credential,
  ) => {
    if (!n) return null;
    let certifiedQuantity = 0;
    if (credential) {
      const problem = verifyCredential(credential, categoryKind(credential.category));
      const room = credentialRoom(credential, state.batches);
      const matches = credential.item === item;
      const reused = state.credentials.some((c) => c.id === credential.id);
      if (!problem && matches && !reused && room >= n) {
        certifiedQuantity = n;
        state.credentials.push(credential);
      } else {
        notice(
          `认证校验未通过（${
            problem ??
              (!matches ? "凭证品名不符" : reused ? "凭证已被占用" : "凭证份额不足")
          }），本批按普通货入仓`,
        );
      }
    }
    const id = `b${++state.serial}`;
    state.batches.push(
      makeBatch(
        item,
        n,
        q,
        hour,
        id,
        source,
        certifiedQuantity === n ? credential!.id : undefined,
      ),
    );
    return id;
  };

  add("carrot", 8, 2);
  add("berry", 6, 2);
  add("corn", 8, 1);

  /** 认证备货只占用带对应类别凭证、且在保质期内的合格份额。 */
  const reserveCertified = (
    owner: string,
    item: Item,
    n: number,
    category: string,
    minQuality = 1,
    at = now(),
  ) => {
    let remaining = n;
    const allocations: { batch: string; quantity: number }[] = [];
    for (const batch of state.batches
      .filter(
        (b) =>
          b.item === item &&
          b.expires > at &&
          b.quality >= minQuality &&
          (!category || validCredential(b)?.category === category),
      )
      .sort((a, b) => a.expires - b.expires)) {
      const take = Math.min(remaining, available(batch, state.reservations));
      if (take > 0) {
        allocations.push({ batch: batch.id, quantity: take });
        remaining -= take;
      }
      if (!remaining) break;
    }
    if (remaining > 0) return null;
    const id = `r${++state.serial}`;
    state.reservations.push({ id, owner, allocations, at });
    return id;
  };
  const reserve = (owner: string, item: Item, n: number, minQuality = 1) =>
    reserveCertified(owner, item, n, "", minQuality);

  /** 消费：逐份确认批次仍存在、未过期、未被别处占用。 */
  const consume = (id: string) => {
    const r = state.reservations.find((r) => r.id === id);
    if (!r) return null;
    const present: { allocation: Reservation["allocations"][number]; batch: Batch }[] = [];
    for (const a of r.allocations) {
      const b = findBatch(a.batch);
      const claimed = state.reservations
        .filter((x) => x.id !== r.id)
        .flatMap((x) => x.allocations)
        .filter((x) => x.batch === a.batch)
        .reduce((n, x) => n + x.quantity, 0);
      if (
        !b ||
        b.expires <= now() ||
        b.quantity - claimed < a.quantity
      )
        return null;
      present.push({ allocation: a, batch: b });
    }
    const certified = present.flatMap(({ allocation, batch }) => {
      const c = validCredential(batch);
      if (!c) return [];
      return [
        {
          credential: c.id,
          category: c.category,
          quantity: allocation.quantity,
          origin: c.origin,
          issued: c.issued,
          evidence: c.evidence,
        },
      ];
    });
    const receipt: Receipt = {
      quality: Math.min(...present.map((p) => p.batch.quality)),
      sources: present.map((p) => p.batch.source),
      quantity: present.reduce((n, p) => n + p.allocation.quantity, 0),
      certified,
    };
    for (const { allocation, batch } of present)
      batch.quantity -= allocation.quantity;
    state.batches = state.batches.filter((b) => b.quantity > 0);
    state.reservations = state.reservations.filter((x) => x.id !== id);
    // 凭证只跟随仍有存活批次的批次保留，防止过期后跨订单重复使用。
    state.credentials = state.credentials.filter((c) =>
      state.batches.some((b) => b.credential === c.id),
    );
    return receipt;
  };

  const release = (id: string) => {
    state.reservations = state.reservations.filter((r) => r.id !== id);
  };

  /** 交付前复核：占用份额仍实际存在、未过期，且每份都带对应类别凭证。 */
  const eligible = (id: string, category: string, hour: number) => {
    const r = state.reservations.find((r) => r.id === id);
    if (!r || !r.allocations.length) return false;
    return r.allocations.every((a) => {
      const b = findBatch(a.batch);
      if (!b || b.expires <= hour || b.quantity < a.quantity) return false;
      const c = validCredential(b);
      return !!c && c.category === category;
    });
  };

  const sell = (id: string, n: number) => {
    const b = findBatch(id);
    if (!b || available(b, state.reservations) < n) return null;
    b.quantity -= n;
    if (!b.quantity) state.batches = state.batches.filter((x) => x.id !== id);
    state.credentials = state.credentials.filter((c) =>
      state.batches.some((x) => x.credential === c.id),
    );
    return b.item;
  };

  /**
   * 备货解释：分别统计合格认证份额与普通份额，指出缺哪一段记录。
   * 混入普通批次只影响对应份额，不会把整仓货一律降级。
   */
  const report = (
    category: string,
    quantity: number,
    minQuality = 1,
    at = now(),
  ): StockReport => {
    const item = categoryItem(category);
    const candidates = state.batches.filter(
      (b) => b.item === item && b.expires > at && b.quality >= minQuality,
    );
    const eligible = candidates.filter(
      (b) => validCredential(b)?.category === category,
    );
    const certified = eligible.reduce(
      (n, b) => n + available(b, state.reservations),
      0,
    );
    const ordinary = candidates
      .filter((b) => !eligible.includes(b))
      .reduce((n, b) => n + available(b, state.reservations), 0);
    const segments = requiredSegments(category).map((segment) => ({
      segment,
      covered: eligible
        .filter((b) => validCredential(b)!.evidence.some((e) => e.segment === segment))
        .reduce((n, b) => n + available(b, state.reservations), 0),
    }));
    const missingSegments =
      certified >= quantity
        ? []
        : segments
            .filter((s) => s.covered < quantity)
            .map((s) => `${s.segment}（缺 ${quantity - s.covered} 份记录）`);
    if (certified < quantity && !missingSegments.length)
      missingSegments.push("足额且未被占用的合格份额");
    return {
      item,
      required: quantity,
      qualified: certified,
      certified,
      ordinary,
      category,
      segments,
      missingSegments,
      message: stockMessage(category, quantity, certified, missingSegments[0] ?? null),
    };
  };

  const tick = (hour: number) => {
    const expired = state.batches.filter((b) => b.expires <= hour);
    state.wasted += expired.reduce((n, b) => n + b.quantity, 0);
    state.batches = state.batches.filter((b) => b.expires > hour);
    state.credentials = state.credentials.filter((c) =>
      state.batches.some((b) => b.credential === c.id),
    );
    state.reservations = state.reservations.filter(
      (r) => !r.allocations.some((a) => expired.some((b) => b.id === a.batch)),
    );
    if (expired.length) notice(`${expired.length} 批库存已到保质期`);
  };

  return {
    state: readonly(state),
    add,
    free: (id: string) => {
      const b = findBatch(id);
      return b ? available(b, state.reservations) : 0;
    },
    credentialOf: findCredential,
    reserve,
    reserveCertified,
    consume,
    release,
    eligible,
    sell,
    report,
    tick,
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    restore: (data: typeof state) => {
      Object.assign(state, data);
      if (!Array.isArray(state.credentials)) state.credentials = [];
      if (!Array.isArray(state.batches)) state.batches = [];
      if (!Array.isArray(state.reservations)) state.reservations = [];
      adoptCredentialSerial(state.credentials.map((c) => c.id));
      // 旧存档货物保留原星级，但明确标记为未认证；无法复核的凭证降为普通。
      for (const batch of state.batches) {
        const c = findCredential(batch.credential);
        if (!c || verifyCredential(c, categoryKind(c.category))) {
          delete batch.credential;
          batch.legacy = true;
        } else batch.legacy = false;
      }
    },
  };
}
