<script setup lang="ts">
import type { DeepReadonly } from "vue";
import type { Item, Plot } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
import { crops, ready } from "../lib/crops";
import { stepState } from "../lib/care";
import { fieldCategory, categoryLabel } from "../../../shared/certification";

const props = defineProps<{
  plots: readonly DeepReadonly<Plot>[];
  selected: Item;
  active: number;
  hour: number;
}>();
defineEmits<{
  select: [item: Item];
  plant: [id: number];
  water: [id: number];
  certify: [id: number, step: string];
  harvest: [id: number];
}>();
const seeds: Item[] = ["carrot", "corn", "berry"];
const statusName = {
  done: "已确认",
  open: "可确认",
  waiting: "未到窗口",
  missed: "已错过",
} as const;
</script>
<template>
  <section class="panel seed-panel">
    <div class="panel-heading">
      <h2>土地与种植</h2>
      <span>12 块沃土 · 认证照料需逐段确认</span>
    </div>
    <div class="seed-list">
      <button
        v-for="item in seeds"
        :key="item"
        :class="{ selected: selected === item }"
        @click="$emit('select', item)"
      >
        <b>{{ items[item].icon }}</b><strong>{{ items[item].name }}</strong
        ><small>{{ crops[item]?.duration }}h · ¥{{ crops[item]?.cost }}</small>
      </button>
    </div>
    <div class="plot-details">
      <strong>土地 {{ active + 1 }}</strong
      ><template v-if="props.plots[active]?.crop"
        ><span
          >生长 {{ props.plots[active]!.crop!.growth.toFixed(1) }} /
          {{ crops[props.plots[active]!.crop!.item]?.duration }}h · 水分
          {{ props.plots[active]!.crop!.water }}%</span
        ><button @click="$emit('water', active)">浇水 +</button
        ><button
          :disabled="!ready(props.plots[active]!.crop!)"
          @click="$emit('harvest', active)"
        >
          收获作物
        </button></template
      ><template v-else
        ><span>翻好的土地，等待新种子</span
        ><button class="primary" @click="$emit('plant', active)">
          播种 {{ items[selected].name }}
        </button></template
      >
    </div>
    <div
      v-if="props.plots[active]?.crop && props.plots[active]!.crop!.certTrack"
      class="care-steps"
    >
      <div class="care-head">
        <span>认证照料 · 第 {{ props.plots[active]!.crop!.round }} 轮</span>
        <em>{{ categoryLabel(fieldCategory(props.plots[active]!.crop!.item)) }}</em>
      </div>
      <div
        v-for="step in props.plots[active]!.crop!.steps"
        :key="step.id"
        class="care-step"
        :class="stepState(step, hour)"
      >
        <span>{{ step.label }}</span>
        <small
          >窗口 {{ step.from }}–{{ step.to }}h ·
          {{ statusName[stepState(step, hour)] }}</small
        ><button
          :disabled="stepState(step, hour) !== 'open'"
          @click="$emit('certify', active, step.id)"
        >
          确认认证照料
        </button>
      </div>
      <p class="hint">普通浇水只补水分，不能替代认证照料；未到窗口不能提交。</p>
    </div>
    <div v-else-if="props.plots[active]?.crop" class="care-steps">
      <p class="hint">本批来自旧存档，没有可核验的照料历史，只能作为普通货。</p>
    </div>
  </section>
</template>
