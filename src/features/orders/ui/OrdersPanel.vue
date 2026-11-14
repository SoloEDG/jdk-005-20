<script setup lang="ts">
import { reactive } from "vue";
import type { DeepReadonly } from "vue";
import type { ContractEvent, Order, StockReport } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
import { categoryLabel } from "../../../shared/certification";
defineProps<{
  orders: readonly DeepReadonly<Order>[];
  hour: number;
  report: (id: string) => StockReport | null;
  events: readonly DeepReadonly<ContractEvent>[];
}>();
defineEmits<{
  reserve: [id: string];
  deliver: [id: string];
  cancel: [id: string];
}>();
const statusName = {
  open: "待备货",
  reserved: "已备货",
  delivered: "已交付",
  expired: "已过期",
};
const expanded = reactive<Record<string, boolean>>({});
</script>
<template>
  <section class="panel orders-panel">
    <div class="panel-heading">
      <h2>村庄认证合同</h2>
      <span>按认证类别备货，记录不全不能提交</span>
    </div>
    <article
      v-for="order in orders"
      :key="order.id"
      class="order-card"
      :class="order.status"
    >
      <div class="order-icon">{{ items[order.item].icon }}</div>
      <div class="order-info">
        <strong
          >{{ items[order.item].name }} ×{{ order.quantity }}
          <em>{{ "★".repeat(order.minQuality) }}起</em></strong
        ><small
          >{{ order.id }} · {{ categoryLabel(order.category) }} ·
          {{ statusName[order.status] }} ·
          {{ Math.max(0, order.deadline - hour) }}h</small
        >
        <small v-if="order.shortfall" class="shortfall"
          >⚠ {{ order.shortfall }}</small
        >
      </div>
      <b class="reward">¥{{ order.reward }}</b>
      <div class="order-actions">
        <button
          v-if="order.status === 'open'"
          @click="expanded[order.id] = !expanded[order.id]"
        >
          {{ expanded[order.id] ? "收起说明" : "查看备货说明" }}</button
        ><button
          v-if="order.status === 'open'"
          @click="$emit('reserve', order.id)"
        >
          备货</button
        ><template v-if="order.status === 'reserved'"
          ><button class="primary" @click="$emit('deliver', order.id)">
            交付</button
          ><button @click="$emit('cancel', order.id)">取消</button></template
        >
      </div>
      <div
        v-if="
          expanded[order.id] && order.status === 'open' && report(order.id)
        "
        class="stock-report"
      >
        <p>{{ report(order.id)!.message }}</p>
        <p class="hint">
          普通份额 {{ report(order.id)!.ordinary }} 份不会让整仓降级，
          只会补不上对应认证份额。
        </p>
        <ul>
          <li
            v-for="segment in report(order.id)!.segments"
            :key="segment.segment"
          >
            {{ segment.segment }}：覆盖
            {{ segment.covered }}/{{ order.quantity }} 份
          </li>
        </ul>
      </div>
    </article>
    <details v-if="events.length" class="contract-events">
      <summary>合同事件记录（{{ events.length }}）</summary>
      <p v-for="event in events.slice(-5).reverse()" :key="event.id">
        第{{ Math.floor(event.at / 24) + 1 }}天
        {{ String(event.at % 24).padStart(2, "0") }}:00 · {{ event.order }} ·
        {{ event.detail }}
      </p>
    </details>
  </section>
</template>
