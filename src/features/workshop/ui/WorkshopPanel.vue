<script setup lang="ts">
import type { DeepReadonly } from "vue";
import type { Job } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
import { recipes, recipeById } from "../lib/recipes";
import { craftWindowLabel, nextCraftWindow, queueProgress } from "../lib/schedule";
defineProps<{ jobs: readonly DeepReadonly<Job>[]; hour: number }>();
defineEmits<{ enqueue: [recipe: string]; claim: [id: string] }>();
</script>
<template>
  <section class="panel workshop-panel">
    <div class="panel-heading">
      <h2>手作工坊</h2>
      <span>单机顺序加工 · 06:00 / 18:00 开班</span>
    </div>
    <div class="recipe-list">
      <button v-for="r in recipes" :key="r.id" @click="$emit('enqueue', r.id)">
        <b>{{ items[r.output].icon }}</b><strong>{{ r.name }}</strong
        ><small
          >{{ r.amount }} {{ items[r.input].name }} →
          {{ r.quantity }} 份<br />{{ r.duration }}h · ¥{{ r.cost }}</small
        ><span>＋ 制作</span>
      </button>
    </div>
    <div
      v-for="job in jobs.filter((j) => j.status !== 'claimed')"
      :key="job.id"
      class="job-row"
    >
      <span
        >{{ recipeById(job.recipe)?.name }} <small>{{ job.id }}</small></span
      ><template v-if="job.status === 'queued'"
        ><progress
          :value="
            queueProgress(job.finish, hour, recipeById(job.recipe)!.duration)
          "
          max="100"
        ></progress
        ><small>还需 {{ job.finish - hour }}h</small></template
      ><template v-else-if="job.status === 'ready'"
        ><small>
          {{
            job.pending
              ? "认证成品待领取"
              : job.cert?.windowOk
                ? "未认证成品（输入不合格）"
                : "未认证成品（加工时段不符）"
          }}
        </small>
        <button class="primary" @click="$emit('claim', job.id)">
          领取成品
          {{
            job.pending
              ? `✔${job.cert?.certifiedQuantity ?? 0}`
              : "（普通）"
          }}</button
        ></template
      ><small v-else>加工失败</small>
    </div>
    <p v-if="!jobs.some((j) => j.status !== 'claimed')" class="hint">
      机器空闲中；下一合法开班时段
      {{ craftWindowLabel(nextCraftWindow(hour)) }}。
    </p>
  </section>
</template>
