<script setup lang="ts">
import type { DeepReadonly } from "vue";
import type { Batch, Credential } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
import { categoryLabel } from "../../../shared/certification";
defineProps<{
  batches: readonly DeepReadonly<Batch>[];
  credentials: readonly DeepReadonly<Credential>[];
  hour: number;
  free: (id: string) => number;
  wasted: number;
}>();
defineEmits<{ sell: [id: string] }>();
</script>
<template>
  <section class="panel warehouse-panel">
    <div class="panel-heading">
      <h2>谷仓库存</h2>
      <span>{{ batches.length }} 批 · 认证凭证 {{ credentials.length }} 份</span>
    </div>
    <div class="inventory-list">
      <div v-for="batch in batches" :key="batch.id" class="inventory-row">
        <b class="item-icon">{{ items[batch.item].icon }}</b>
        <div>
          <strong
            >{{ items[batch.item].name }}
            <em>{{ "★".repeat(batch.quality) }}</em></strong
          ><small
            >{{ batch.id }} · {{ batch.source }} · {{ batch.expires - hour }}h
            后到期</small
          >
          <small
            v-if="batch.credential"
            class="cert-tag"
            >✔
            {{
              categoryLabel(
                credentials.find((c) => c.id === batch.credential)?.category ??
                "",
              )
            }}·凭证 {{ batch.credential }}</small
          >
          <small v-else class="cert-tag uncertified"
            >✖ 未认证 · 普通批次（星级不代表认证）</small
          >
        </div>
        <div class="quantity">
          <strong>×{{ batch.quantity }}</strong
          ><small>可用 {{ free(batch.id) }}</small>
        </div>
        <button :disabled="!free(batch.id)" @click="$emit('sell', batch.id)">
          卖 1
        </button>
      </div>
      <p v-if="!batches.length" class="empty">谷仓空了，去田里收获吧。</p>
    </div>
    <p class="hint">
      凭证按批保留 · 已占用货物不可出售 · 普通高星货不能改称认证品
    </p>
  </section>
</template>
