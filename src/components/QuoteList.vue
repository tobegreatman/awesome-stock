<template>
  <section class="panel-card glass-card">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">股票池速览</h2>
        <p class="panel-copy">点击任意股票切换右侧详情。微图使用最近交易日收盘序列，便于快速比较节奏。</p>
      </div>
    </div>

    <div v-if="loading" class="loading-block">
      <span class="loading-line" v-for="index in 5" :key="index"></span>
    </div>

    <div v-else-if="!items.length" class="empty-state">当前股票池没有可展示的数据。</div>

    <div v-else class="quote-list">
      <button
        v-for="item in items"
        :key="item.code"
        class="quote-card"
        :class="{ 'is-active': item.code === selectedCode }"
        type="button"
        @click="$emit('select', item.code)"
      >
        <div class="quote-card__top">
          <div>
            <h3 class="quote-card__name">{{ item.name }}</h3>
            <div class="quote-card__code">{{ item.code }}</div>
          </div>
          <Sparkline :values="item.sparkline" :positive="item.changePct >= 0" />
        </div>

        <div class="quote-card__bottom">
          <div>
            <div class="quote-card__price" :class="toneClass(item.changePct)">{{ formatPrice(item.price) }}</div>
            <div class="quote-card__change" :class="toneClass(item.changePct)">
              {{ formatSigned(item.change) }} / {{ formatSigned(item.changePct, 2, '%') }}
            </div>
          </div>

          <div class="quote-card__meta">
            <span>成交额 {{ formatAmount(item.amount) }}</span>
            <span>量 {{ formatAmount(item.volume) }}</span>
          </div>
        </div>
      </button>
    </div>
  </section>
</template>

<script setup>
import Sparkline from './Sparkline.vue'
import { formatAmount, formatPrice, formatSigned, getChangeTone } from '@/lib/formatters'

defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  selectedCode: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['select'])

function toneClass(value) {
  return getChangeTone(value)
}
</script>