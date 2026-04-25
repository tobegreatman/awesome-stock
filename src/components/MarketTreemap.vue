<template>
  <section class="panel-card glass-card">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">行业涨跌幅矩形树图</h2>
        <p class="panel-copy">颜色严格遵循红涨、白平、绿跌；你可以直接切换排序规则和面积权重，观察行业热度结构如何变化。</p>
      </div>
      <div class="market-panel-side">
        <div class="legend-row">
          <span>上涨</span>
          <span>平盘</span>
          <span>下跌</span>
        </div>
      </div>
    </div>

    <div v-if="items.length" class="market-toolbar">
      <div class="market-toolbar__group">
        <span class="market-toolbar__label">方向</span>
        <div class="market-toggle-row">
          <button
            v-for="option in filterOptions"
            :key="option.value"
            class="market-toggle-chip"
            :class="{ 'is-active': activeFilterMode === option.value }"
            type="button"
            @click="activeFilterMode = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="market-toolbar__group">
        <span class="market-toolbar__label">排序</span>
        <div class="market-toggle-row">
          <button
            v-for="option in sortOptions"
            :key="option.value"
            class="market-toggle-chip"
            :class="{ 'is-active': sortMode === option.value }"
            type="button"
            @click="sortMode = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="market-toolbar__group">
        <span class="market-toolbar__label">面积</span>
        <div class="market-toggle-row">
          <button
            v-for="option in weightOptions"
            :key="option.value"
            class="market-toggle-chip"
            :class="{ 'is-active': weightMode === option.value }"
            type="button"
            @click="weightMode = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="items.length && hasCustomControlState" class="market-toolbar-meta">
      <span class="market-toolbar-meta__copy">当前市场视角已经偏离默认设置，你可以一键恢复方向、排序和面积。</span>
      <button class="market-toolbar-meta__action" type="button" @click="resetAllControls">全部恢复默认</button>
    </div>

    <div v-if="items.length && !loading" class="market-status-strip">
      <div class="market-status-strip__block">
        <span class="market-status-strip__label">当前视图</span>
        <strong>{{ activeFilterLabel }}</strong>
      </div>
      <div class="market-status-strip__block">
        <span class="market-status-strip__label">已展示</span>
        <strong>{{ displayItems.length }} / {{ items.length }}</strong>
      </div>
      <div class="market-status-strip__block">
        <span class="market-status-strip__label">筛除</span>
        <strong>{{ filteredOutCount }}</strong>
      </div>
    </div>

    <div v-if="loading" class="loading-block">
      <span class="loading-line"></span>
      <span class="loading-line" style="height: 420px"></span>
    </div>

    <div v-else-if="!items.length" class="empty-state">当前没有拿到行业板块数据。</div>

    <div v-else-if="!displayItems.length" class="empty-state market-empty-state">
      <p>当前没有匹配“{{ activeFilterLabel }}”视角的行业板块，切回“全部”或等待新样本后再看。</p>
      <button v-if="activeFilterMode !== 'all'" class="market-empty-state__action" type="button" @click="activeFilterMode = 'all'">
        回到全部视图
      </button>
    </div>

    <EChartCanvas v-else :option="option" height="640px" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import EChartCanvas from './EChartCanvas.vue'
import { buildTreemapOption } from '@/lib/charts'

const DEFAULT_SORT_MODE = 'change'
const DEFAULT_WEIGHT_MODE = 'blend'
const SORT_MODE_STORAGE_KEY = 'stock-atelier.market-sort-mode'
const WEIGHT_MODE_STORAGE_KEY = 'stock-atelier.market-weight-mode'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  filterMode: {
    type: String,
    default: 'all',
  },
})

const emit = defineEmits(['update:filterMode'])

const sortOptions = [
  { label: '涨幅', value: 'change' },
  { label: '资金', value: 'flow' },
  { label: '强度', value: 'strength' },
]

const filterOptions = [
  { label: '全部', value: 'all' },
  { label: '上涨', value: 'up' },
  { label: '平盘', value: 'flat' },
  { label: '下跌', value: 'down' },
]

const weightOptions = [
  { label: '综合', value: 'blend' },
  { label: '资金', value: 'flow' },
  { label: '涨幅', value: 'change' },
]

const sortMode = ref(loadStoredMode(SORT_MODE_STORAGE_KEY, sortOptions, DEFAULT_SORT_MODE))
const weightMode = ref(loadStoredMode(WEIGHT_MODE_STORAGE_KEY, weightOptions, DEFAULT_WEIGHT_MODE))
const activeFilterMode = computed({
  get: () => (filterOptions.some((option) => option.value === props.filterMode) ? props.filterMode : 'all'),
  set: (nextValue) => emit('update:filterMode', nextValue),
})
const hasCustomPresentationMode = computed(() => sortMode.value !== DEFAULT_SORT_MODE || weightMode.value !== DEFAULT_WEIGHT_MODE)
const hasCustomControlState = computed(() => activeFilterMode.value !== 'all' || hasCustomPresentationMode.value)

watch(sortMode, (nextValue) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SORT_MODE_STORAGE_KEY, nextValue)
})

watch(weightMode, (nextValue) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(WEIGHT_MODE_STORAGE_KEY, nextValue)
})

const displayItems = computed(() => {
  const items = props.items
    .slice()
    .filter((item) => {
      if (activeFilterMode.value === 'up') {
        return item.changePct > 0
      }

      if (activeFilterMode.value === 'flat') {
        return item.changePct === 0
      }

      if (activeFilterMode.value === 'down') {
        return item.changePct < 0
      }

      return true
    })

  const sorters = {
    change: (left, right) => right.changePct - left.changePct,
    flow: (left, right) => Math.abs(right.mainNetInflow) - Math.abs(left.mainNetInflow),
    strength: (left, right) => Math.abs(right.leadingStrength) - Math.abs(left.leadingStrength),
  }

  return items.sort(sorters[sortMode.value] || sorters.change)
})

const activeFilterLabel = computed(() => filterOptions.find((option) => option.value === activeFilterMode.value)?.label || '全部')
const filteredOutCount = computed(() => Math.max(props.items.length - displayItems.value.length, 0))

const option = computed(() => buildTreemapOption(displayItems.value, { weightMode: weightMode.value }))

function resetPresentationMode() {
  sortMode.value = DEFAULT_SORT_MODE
  weightMode.value = DEFAULT_WEIGHT_MODE
}

function resetAllControls() {
  activeFilterMode.value = 'all'
  resetPresentationMode()
}

function loadStoredMode(storageKey, options, fallback) {
  if (typeof window === 'undefined') {
    return fallback
  }

  const raw = window.localStorage.getItem(storageKey)
  const allowedValues = new Set(options.map((item) => item.value))
  return allowedValues.has(raw) ? raw : fallback
}
</script>