import { reactive, readonly } from "vue";
import type { Credential, Item, Plot, Tick, Notice } from "../../../shared/contracts";
import { fieldCategory } from "../../../shared/certification";
import { fieldEvidence, makeCredential } from "../../../shared/verify";
import { crops, grow, ready } from "../lib/crops";
import { makeCareSteps, normalizeCrop, stepState } from "../lib/care";

export function createFields(
  spend: (amount: number) => boolean,
  harvest: (
    item: Item,
    n: number,
    q: number,
    hour: number,
    credential?: Credential,
  ) => void,
  notice: Notice,
) {
  const state = reactive({
    plots: Array.from({ length: 12 }, (_, id): Plot => ({ id, crop: null })),
    selected: "carrot" as Item,
  });

  const freshRound = (crop: NonNullable<Plot["crop"]>, hour: number) => {
    crop.harvests += 1;
    crop.round += 1;
    crop.roundStart = hour;
    crop.steps = makeCareSteps(crop.item, hour);
    crop.growth = 0;
  };

  return {
    state: readonly(state),
    select: (item: Item) => {
      state.selected = item;
    },
    plant(id: number, hour: number) {
      const plot = state.plots[id],
        seed = crops[state.selected];
      if (!plot || plot.crop || !seed) return;
      if (!spend(seed.cost)) {
        notice("资金不足，交付订单或出售库存后再试");
        return;
      }
      plot.crop = {
        item: state.selected,
        planted: hour,
        growth: 0,
        water: 70,
        stress: 0,
        harvests: 0,
        round: 1,
        roundStart: hour,
        steps: makeCareSteps(state.selected, hour),
        certTrack: true,
      };
      notice("种下了新的希望；本轮认证照料窗口开始计时");
    },
    /** 普通浇水只补水分，不写入任何认证照料记录。 */
    water(id: number, hour = -1) {
      const crop = state.plots[id]?.crop;
      if (!crop) return;
      crop.water = 100;
      if (crop.steps.some((s) => stepState(s, hour) === "open"))
        notice("普通浇水不能替代认证照料；请在窗口内单独确认");
    },
    /** 认证照料必须在窗口内单独确认；未到时间或已过时间都不能提交。 */
    certify(id: number, stepId: string, hour: number) {
      const crop = state.plots[id]?.crop;
      const step = crop?.steps.find((s) => s.id === stepId);
      if (!crop || !step) return;
      if (!crop.certTrack) {
        notice("本批来自旧存档，没有可补造的照料历史");
        return;
      }
      const status = stepState(step, hour);
      if (status === "done") {
        notice(`「${step.label}」已经确认过了`);
        return;
      }
      if (status === "waiting") {
        notice(`还未到「${step.label}」的合法窗口，不能提前提交`);
        return;
      }
      if (status === "missed") {
        notice(`「${step.label}」的合法窗口已错过，本轮只能作为普通货`);
        return;
      }
      // 事件发生的此刻即写入凭证记录，之后无法补造或改写。
      step.done = hour;
      notice(
        `已在窗口内确认认证照料：${step.label}（第${Math.floor(hour / 24) + 1}天 ${String(hour % 24).padStart(2, "0")}:00）`,
      );
    },
    harvest(id: number, hour: number) {
      const plot = state.plots[id],
        crop = plot?.crop;
      if (!crop || !ready(crop)) return;
      const def = crops[crop.item]!;
      const quality = crop.stress <= 2 ? 2 : 1;
      const evidence =
        crop.stress <= 2 ? fieldEvidence(crop.certTrack, crop.steps, hour) : null;
      const credential = evidence
        ? makeCredential(
            fieldCategory(crop.item),
            crop.item,
            def.yield,
            hour,
            `田块${id + 1}·第${crop.round}轮`,
            evidence,
          )
        : undefined;
      harvest(crop.item, def.yield, quality, hour, credential);
      if (!credential) {
        const missed = crop.steps.filter((s) =>
          s.done === null ? hour > s.to : s.done > s.to,
        );
        const reason = !crop.certTrack
          ? "旧存档没有照料历史"
          : crop.stress > 2
            ? "作物曾缺水受损"
            : missed.length
              ? `缺少「${missed[0]!.label}」的窗口内记录`
              : "收获不在认证条件内";
        notice(`本批未取得认证：${reason}；仍按 ${quality} 星普通货入仓`);
      }
      if (crop.harvests < def.repeat) {
        freshRound(crop, hour);
        notice("已开始下一轮，认证照料窗口重新计时");
      } else plot.crop = null;
    },
    tick(tick: Tick) {
      for (const plot of state.plots)
        if (plot.crop)
          plot.crop = grow(plot.crop, tick.weather, tick.to - tick.from);
    },
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    restore: (data: typeof state) => {
      Object.assign(state, data);
      // 读档只恢复既有记录，不会补齐窗口外的照料。
      for (const plot of state.plots)
        if (plot.crop) plot.crop = normalizeCrop(plot.crop);
    },
    stepState,
    categoryOf: (item: Item) => fieldCategory(item),
  };
}
