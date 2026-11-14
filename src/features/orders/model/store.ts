import { reactive, readonly } from "vue";
import type {
  ContractEvent,
  Item,
  Notice,
  Receipt,
  StockReport,
} from "../../../shared/contracts";
import { initialOrders, nextOrder } from "../lib/offers";

interface Ports {
  reserveCertified: (
    owner: string,
    item: Item,
    n: number,
    category: string,
    minQuality?: number,
  ) => string | null;
  consume: (id: string) => Receipt | null;
  release: (id: string) => void;
  report: (
    category: string,
    quantity: number,
    minQuality?: number,
  ) => StockReport;
  /** 交付前复核：占用份额仍带该类别凭证且未过期。 */
  eligible: (reservation: string, category: string, hour: number) => boolean;
}

export function createOrders(
  ports: Ports,
  notice: Notice,
  now: () => number,
) {
  const state = reactive({
    coins: 180,
    xp: 0,
    delivered: 0,
    serial: 3,
    eventSerial: 0,
    orders: initialOrders(now()),
    /** 合同选择事件发生时的记录：备货、取消、交付、过期。 */
    events: [] as ContractEvent[],
  });

  const log = (order: string, kind: ContractEvent["kind"], detail: string) => {
    state.events.push({
      id: `e${++state.eventSerial}`,
      order,
      at: now(),
      kind,
      detail,
    });
    if (state.events.length > 40) state.events.shift();
  };

  const spend = (n: number) => {
    if (n < 0 || state.coins < n) return false;
    state.coins -= n;
    return true;
  };

  return {
    state: readonly(state),
    spend,
    earn: (n: number) => {
      state.coins += n;
    },
    /** 备货前的解释：缺哪一类认证、哪一段记录，普通份额有多少。 */
    report(id: string) {
      const o = state.orders.find((o) => o.id === id);
      if (!o || o.status !== "open") return null;
      return ports.report(o.category, o.quantity, o.minQuality);
    },
    reserve(id: string) {
      const o = state.orders.find((o) => o.id === id);
      if (!o || o.status !== "open") return;
      const report = ports.report(o.category, o.quantity, o.minQuality);
      const reservation = ports.reserveCertified(
        `order:${id}`,
        o.item,
        o.quantity,
        o.category,
        o.minQuality,
      );
      if (!reservation) {
        o.shortfall = report.message;
        notice(`无法备货：${report.message}`);
        log(id, "reserve", `失败：${report.message}`);
        return;
      }
      o.reservation = reservation;
      o.status = "reserved";
      delete o.shortfall;
      log(id, "reserve", `占用 ${o.quantity} 份 ${o.category} 凭证份额`);
      notice("订单已按认证类别备货，合格库存已占用");
    },
    deliver(id: string) {
      const o = state.orders.find((o) => o.id === id);
      if (!o || o.status !== "reserved" || !o.reservation) return;
      if (!ports.eligible(o.reservation, o.category, now())) {
        ports.release(o.reservation);
        o.status = "open";
        delete o.reservation;
        o.shortfall = "占用份额已过期或被别处占用，请重新备货";
        notice(`交付中止：${o.shortfall}`);
        log(id, "deliver", o.shortfall);
        return;
      }
      const receipt = ports.consume(o.reservation);
      if (!receipt) {
        ports.release(o.reservation);
        o.status = "open";
        delete o.reservation;
        o.shortfall = "实际存在且未被占用的合格份额不足";
        notice("货物已失效，无法交付；订单退回待备货");
        log(id, "deliver", o.shortfall);
        return;
      }
      // 只按本次实际消费到的对应类别认证份额结算。
      const certified = receipt.certified
        .filter((s) => s.category === o.category)
        .reduce((n, s) => n + s.quantity, 0);
      if (certified < o.quantity) {
        o.status = "open";
        delete o.reservation;
        o.shortfall = `仅 ${certified}/${o.quantity} 份具备该类别认证`;
        notice(`本次交付未达成：${o.shortfall}`);
        log(id, "deliver", o.shortfall);
        return;
      }
      o.status = "delivered";
      state.coins += o.reward;
      const gain = 40 + (receipt.quality > 1 ? 10 : 0);
      state.xp += gain;
      state.delivered++;
      log(id, "deliver", `交付 ${certified} 份，+¥${o.reward}`);
      state.orders.push(nextOrder(++state.serial, now()));
      notice(`交付成功（${o.category}），收入 ¥${o.reward} / +${gain} 经验`);
    },
    cancel(id: string) {
      const o = state.orders.find((o) => o.id === id);
      if (o?.status !== "reserved" || !o.reservation) return;
      ports.release(o.reservation);
      o.status = "open";
      delete o.reservation;
      o.shortfall = "合同已取消，占用的认证份额已归还";
      log(id, "cancel", o.shortfall);
      notice("合同已取消，占用的份额已释放");
    },
    tick(hour: number) {
      for (const o of state.orders)
        if (
          (o.status === "open" || o.status === "reserved") &&
          o.deadline <= hour
        ) {
          if (o.reservation) ports.release(o.reservation);
          o.status = "expired";
          o.shortfall = "合同已过期，占用的份额已归还";
          log(o.id, "expire", o.shortfall);
        }
    },
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    restore: (data: typeof state) => {
      Object.assign(state, data);
      if (!Array.isArray(state.events)) state.events = [];
      if (!Number.isFinite(state.eventSerial))
        state.eventSerial = state.events.length;
      // 旧存档订单没有认证类别字段，按品名补固定类别，不追认旧货为认证品。
      for (const o of state.orders) {
        if (!o.category)
          o.category =
            o.item === "jam" || o.item === "flour"
              ? `craft:${o.item}`
              : `field:${o.item}`;
      }
    },
  };
}
