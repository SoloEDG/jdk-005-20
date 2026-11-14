import { reactive, readonly } from "vue";
import type {
  Credential,
  Job,
  Item,
  Notice,
  Receipt,
} from "../../../shared/contracts";
import {
  categoryLabel,
  craftCategory,
  fieldCategory,
} from "../../../shared/certification";
import {
  adoptCredentialSerial,
  craftEvidence,
  makeCredential,
  verifyCredential,
} from "../../../shared/verify";
import { items } from "../../../shared/catalog";
import { recipeById } from "../lib/recipes";
import { craftWindowLabel, inCraftWindow, nextCraftWindow } from "../lib/schedule";

interface Ports {
  reserveCertified: (
    owner: string,
    item: Item,
    n: number,
    category: string,
    minQuality?: number,
    at?: number,
  ) => string | null;
  reserve: (
    owner: string,
    item: Item,
    n: number,
    minQuality?: number,
  ) => string | null;
  consume: (id: string) => Receipt | null;
  release: (id: string) => void;
  add: (
    item: Item,
    n: number,
    q?: number,
    hour?: number,
    source?: string,
    credential?: Credential,
  ) => string | null;
  spend: (n: number) => boolean;
}

export function createWorkshop(ports: Ports, notice: Notice) {
  const state = reactive({ jobs: [] as Job[], serial: 0 });

  return {
    state: readonly(state),
    /**
     * 单机顺序加工。只有全部输入都带对应田间认证，成品才可能保留认证；
     * 混入普通输入时，按合格份额比例只认证对应产出。
     */
    enqueue(recipe: string, hour: number) {
      const r = recipeById(recipe);
      if (!r || state.jobs.filter((j) => j.status === "queued").length >= 4) {
        notice("加工队列已满");
        return;
      }
      const prevFinish = state.jobs
        .filter((j) => j.status === "queued")
        .reduce((n, j) => Math.max(n, j.finish), hour);
      const start = nextCraftWindow(prevFinish);
      // 原料必须在开工时仍在保质期内，且只能使用未被占用的份额。
      const reservation =
        ports.reserveCertified(
          "workshop",
          r.input,
          r.amount,
          fieldCategory(r.input),
          1,
          start,
        ) ??
        ports.reserveCertified("workshop", r.input, r.amount, "", 1, start);
      if (!reservation) {
        notice("加工原料不足（需未过期且未被订单占用）");
        return;
      }
      if (!ports.spend(r.cost)) {
        ports.release(reservation);
        notice("加工费不足");
        return;
      }
      state.jobs.push({
        id: `j${++state.serial}`,
        recipe,
        reservation,
        start,
        finish: start + r.duration,
        status: "queued",
      });
      notice(`原料已锁定；指定加工时段自 ${craftWindowLabel(start)} 开始`);
    },
    tick(hour: number) {
      for (const job of state.jobs)
        if (job.status === "queued" && job.finish <= hour) {
          const receipt = ports.consume(job.reservation);
          if (!receipt) {
            job.status = "failed";
            notice("原料已过期或被占用，本批加工终止");
            continue;
          }
          const r = recipeById(job.recipe)!;
          const inputCategory = fieldCategory(r.input);
          const category = craftCategory(r.output);
          const windowOk = inCraftWindow(job.start, r.duration, job.finish);
          const certifiedInputs = receipt.certified
            .filter((s) => s.category === inputCategory)
            .reduce((n, s) => n + s.quantity, 0);
          // 只有全部输入合格且时段正确，成品才保留认证；
          // 混入普通输入时，只有对应产出份额失去认证资格。
          const allQualified = certifiedInputs === receipt.quantity;
          const certifiedQuantity =
            allQualified && windowOk ? r.quantity : 0;
          job.receipt = receipt;
          job.cert = {
            inputQuantity: certifiedInputs,
            inputTotal: receipt.quantity,
            inputCategory,
            windowOk,
            outputQuantity: r.quantity,
            certifiedQuantity,
            category,
            evidence: craftEvidence(receipt, windowOk, job.start, job.finish),
          };
          // 全部合格输入 + 指定加工时段，二者齐备才预签成品凭证。
          if (allQualified && windowOk) {
            job.pending = makeCredential(
              category,
              r.output,
              r.quantity,
              job.finish,
              `工坊${job.id}·${receipt.certified.map((s) => s.origin).join("/")}`,
              craftEvidence(receipt, windowOk, job.start, job.finish),
            );
          }
          job.status = "ready";
          notice(
            job.pending
              ? `${categoryLabel(category)}成品已可保留认证`
              : `加工完成，未取得认证：${
                  !windowOk
                    ? "指定加工时段不符"
                    : `${certifiedInputs}/${receipt.quantity} 份输入合格；混入普通输入，本批成品不带认证`
                }`,
          );
        }
    },
    claim(id: string, hour: number) {
      const job = state.jobs.find((j) => j.id === id),
        r = job && recipeById(job.recipe);
      if (!job || job.status !== "ready" || !r || !job.receipt) return;
      if (job.finish + items[r.output].life <= hour) {
        job.status = "failed";
        notice("成品存放过久，已变质");
        return;
      }
      const certifiedQty = job.pending ? job.cert?.certifiedQuantity ?? 0 : 0;
      const plainQty = r.quantity - certifiedQty;
      if (certifiedQty > 0 && job.pending)
        ports.add(
          r.output,
          certifiedQty,
          job.receipt.quality,
          job.finish,
          `工坊${job.id}·认证·${job.receipt.sources.join(" / ")}`,
          job.pending,
        );
      if (plainQty > 0)
        ports.add(
          r.output,
          plainQty,
          job.receipt.quality,
          job.finish,
          `工坊${job.id}·未认证·${job.receipt.sources.join(" / ")}`,
        );
      job.status = "claimed";
      notice(
        certifiedQty > 0
          ? `成品 ${certifiedQty} 份带认证入仓，${plainQty} 份为普通货`
          : "成品已入仓，但未取得认证；普通高星货不能当作认证品",
      );
    },
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    restore: (data: typeof state) => {
      Object.assign(state, data);
      for (const job of state.jobs) {
        // 旧存档工序没有开工时段记录，不补造历史凭证。
        if (!Number.isFinite(job.start)) {
          job.start = job.finish;
          job.legacy = true;
          delete job.cert;
          delete job.pending;
        } else if (job.pending && verifyCredential(job.pending, "craft")) {
          delete job.pending;
        }
        if (job.pending) adoptCredentialSerial([job.pending.id]);
      }
    },
  };
}
