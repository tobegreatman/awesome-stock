<template>
  <section class="panel-card glass-card">
    <div v-if="stock" class="detail-hero">
      <div class="detail-hero__title">
        <span class="eyebrow">{{ stock.code }}</span>
        <h2>{{ stock.name }}</h2>
        <p>拖动底部滑块可向左查看更早数据。</p>
      </div>

      <div class="detail-price">
        <div class="detail-price__value" :class="toneClass(stock.changePct)">{{ formatPrice(stock.price) }}</div>
        <div class="detail-price__change" :class="toneClass(stock.changePct)">
          {{ formatSigned(stock.change) }} / {{ formatSigned(stock.changePct, 2, '%') }}
        </div>
      </div>
    </div>

    <div class="period-tabs">
      <button
        v-for="option in periods"
        :key="option.value"
        class="tab-pill"
        :class="{ 'is-active': option.value === period }"
        type="button"
        @click="$emit('change-period', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="hasCustomObservationMode" class="detail-toolbar-meta">
      <span class="detail-toolbar-meta__copy">当前详情偏好已偏离默认设置，你可以一键恢复周期、指标 deck 和均线配置。</span>
      <button class="detail-toolbar-meta__action" type="button" @click="resetDetailPreferences">全部恢复默认</button>
    </div>

    <div v-if="period !== DEFAULT_PERIOD" class="detail-toolbar">
      <span class="detail-toolbar__label">均线叠加</span>
      <div class="ma-toggle-group">
        <button
          v-for="option in movingAverageOptions"
          :key="option.value"
          class="ma-chip"
          :class="{ 'is-active': activeMovingAverages.includes(option.value) }"
          :style="{ '--ma-color': option.color }"
          type="button"
          @click="toggleMovingAverage(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-block">
      <span class="loading-line"></span>
      <span class="loading-line" style="height: 320px"></span>
    </div>

    <div v-else-if="!trend?.points?.length" class="empty-state">当前股票没有拿到走势图数据。</div>

    <template v-else>
      <EChartCanvas :option="chartOption" :height="period === 'intraday' ? '500px' : '560px'" />

      <div v-if="metricDecks.length" class="metric-deck-tabs">
        <button
          v-for="deck in metricDecks"
          :key="deck.value"
          class="metric-deck-chip"
          :class="{ 'is-active': activeMetricDeck === deck.value }"
          type="button"
          @click="activeMetricDeck = deck.value"
        >
          {{ deck.label }}
        </button>
      </div>

      <Transition name="metric-swap" mode="out-in">
        <div :key="`${period}:${activeMetricDeck}`" class="metric-row" v-if="activeMetrics.length">
          <div
            v-for="metric in activeMetrics"
            :key="metric.label"
            class="metric-box"
            :class="metric.tone ? `metric-box--${metric.tone}` : ''"
          >
            <div class="metric-box__label">{{ metric.label }}</div>
            <div class="metric-box__value" :class="metric.tone || ''">{{ metric.value }}</div>
          </div>
        </div>
      </Transition>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import EChartCanvas from './EChartCanvas.vue'
import { buildIntradayOption, buildKlineOption, MOVING_AVERAGE_COLORS } from '@/lib/charts'
import { formatAmount, formatPrice, formatSigned, getChangeTone } from '@/lib/formatters'

const DEFAULT_PERIOD = 'intraday'
const DEFAULT_METRIC_DECK = 'snapshot'
const METRIC_DECK_STORAGE_KEY = 'stock-atelier.metric-deck'
const MOVING_AVERAGE_STORAGE_KEY = 'stock-atelier.moving-averages'
const DEFAULT_MOVING_AVERAGES = [5, 10, 20]

const props = defineProps({
  stock: {
    type: Object,
    default: null,
  },
  trend: {
    type: Object,
    default: null,
  },
  period: {
    type: String,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['change-period'])

const periods = [
  { label: '分时', value: 'intraday' },
  { label: '日 K', value: 'day' },
  { label: '周 K', value: 'week' },
  { label: '月 K', value: 'month' },
]

const movingAverageOptions = [
  { label: 'MA5', value: 5, color: MOVING_AVERAGE_COLORS[5] },
  { label: 'MA10', value: 10, color: MOVING_AVERAGE_COLORS[10] },
  { label: 'MA20', value: 20, color: MOVING_AVERAGE_COLORS[20] },
  { label: 'MA60', value: 60, color: MOVING_AVERAGE_COLORS[60] },
]

const activeMetricDeck = ref(loadMetricDeck())
const activeMovingAverages = ref(loadMovingAverages())
const hasCustomObservationMode = computed(() => {
  if (props.period !== DEFAULT_PERIOD) {
    return true
  }

  if (activeMetricDeck.value !== DEFAULT_METRIC_DECK) {
    return true
  }

  return !areMovingAveragesDefault(activeMovingAverages.value)
})

watch(activeMetricDeck, (nextValue) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(METRIC_DECK_STORAGE_KEY, nextValue)
})

watch(
  activeMovingAverages,
  (nextValues) => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(MOVING_AVERAGE_STORAGE_KEY, JSON.stringify(nextValues))
  },
  { deep: true },
)

const chartOption = computed(() => {
  if (!props.trend) {
    return {}
  }

  return props.period === 'intraday'
    ? buildIntradayOption(props.stock, props.trend)
    : buildKlineOption(props.trend, activeMovingAverages.value, props.period)
})

const lastPoint = computed(() => props.trend?.points?.[props.trend.points.length - 1] || null)
const intradayHigh = computed(() => {
  const values = props.trend?.points?.map((item) => item.high) || []
  return values.length ? Math.max(...values) : null
})
const intradayLow = computed(() => {
  const values = props.trend?.points?.map((item) => item.low) || []
  return values.length ? Math.min(...values) : null
})
const intradayAverage = computed(() => props.trend?.points?.[props.trend.points.length - 1]?.average || null)
const intradayRange = computed(() => {
  if (!Number.isFinite(intradayHigh.value) || !Number.isFinite(intradayLow.value)) {
    return null
  }

  return intradayHigh.value - intradayLow.value
})
const intradayAmplitude = computed(() => {
  if (!Number.isFinite(props.stock?.preClose) || !Number.isFinite(intradayRange.value) || props.stock.preClose === 0) {
    return null
  }

  return (intradayRange.value / props.stock.preClose) * 100
})
const priceVsAverage = computed(() => {
  if (!Number.isFinite(props.stock?.price) || !Number.isFinite(intradayAverage.value) || intradayAverage.value === 0) {
    return null
  }

  return ((props.stock.price - intradayAverage.value) / intradayAverage.value) * 100
})
const priceRangePosition = computed(() => {
  if (!Number.isFinite(props.stock?.price) || !Number.isFinite(intradayLow.value) || !Number.isFinite(intradayRange.value) || intradayRange.value === 0) {
    return null
  }

  return ((props.stock.price - intradayLow.value) / intradayRange.value) * 100
})
const upperShadow = computed(() => {
  if (!lastPoint.value) {
    return null
  }

  return lastPoint.value.high - Math.max(lastPoint.value.open, lastPoint.value.close)
})
const lowerShadow = computed(() => {
  if (!lastPoint.value) {
    return null
  }

  return Math.min(lastPoint.value.open, lastPoint.value.close) - lastPoint.value.low
})
const candleRange = computed(() => {
  if (!lastPoint.value) {
    return null
  }

  return lastPoint.value.high - lastPoint.value.low
})
const candleBody = computed(() => {
  if (!lastPoint.value) {
    return null
  }

  return Math.abs(lastPoint.value.close - lastPoint.value.open)
})
const candleBodyRatio = computed(() => {
  if (!Number.isFinite(candleBody.value) || !Number.isFinite(candleRange.value) || candleRange.value === 0) {
    return null
  }

  return (candleBody.value / candleRange.value) * 100
})
const upperShadowRatio = computed(() => {
  if (!Number.isFinite(upperShadow.value) || !Number.isFinite(candleRange.value) || candleRange.value === 0) {
    return null
  }

  return (upperShadow.value / candleRange.value) * 100
})
const lowerShadowRatio = computed(() => {
  if (!Number.isFinite(lowerShadow.value) || !Number.isFinite(candleRange.value) || candleRange.value === 0) {
    return null
  }

  return (lowerShadow.value / candleRange.value) * 100
})

const metricDecks = computed(() => [
  { label: '快照', value: 'snapshot' },
  { label: '成交', value: 'flow' },
  { label: '波动', value: 'volatility' },
])

const metricsByDeck = computed(() => {
  if (!props.stock) {
    return {
      snapshot: [],
      flow: [],
      volatility: [],
    }
  }

  if (props.period === 'intraday') {
    return {
      snapshot: [
        { label: '昨收', value: formatPrice(props.stock.preClose) },
        { label: '最新价', value: formatPrice(props.stock.price), tone: toneClass(props.stock.changePct) },
        { label: '分时高点', value: formatPrice(intradayHigh.value) },
        { label: '分时低点', value: formatPrice(intradayLow.value) },
      ],
      flow: [
        { label: '成交量', value: formatAmount(props.stock.volume) },
        { label: '成交额', value: formatAmount(props.stock.amount) },
        { label: '分时均价', value: formatPrice(intradayAverage.value) },
        { label: '现价偏离均价', value: formatSigned(priceVsAverage.value, 2, '%'), tone: getChangeTone(priceVsAverage.value || 0) },
      ],
      volatility: [
        { label: '振幅', value: formatSigned(intradayAmplitude.value, 2, '%'), tone: getChangeTone(intradayAmplitude.value || 0) },
        { label: '区间价差', value: formatPrice(intradayRange.value) },
        { label: '区间位置', value: formatSigned(priceRangePosition.value, 1, '%'), tone: getRangePositionTone(priceRangePosition.value) },
        { label: '均价乖离', value: formatSigned(priceVsAverage.value, 2, '%'), tone: getChangeTone(priceVsAverage.value || 0) },
      ],
    }
  }

  return {
    snapshot: [
      { label: '开盘', value: formatPrice(lastPoint.value?.open) },
      { label: '收盘', value: formatPrice(lastPoint.value?.close), tone: getChangeTone(lastPoint.value?.changePct || 0) },
      { label: '最高', value: formatPrice(lastPoint.value?.high), tone: lastPoint.value?.high >= lastPoint.value?.open ? 'rise' : 'fall' },
      { label: '最低', value: formatPrice(lastPoint.value?.low), tone: lastPoint.value?.low < lastPoint.value?.open ? 'fall' : '' },
    ],
    flow: [
      { label: '成交量', value: formatAmount(lastPoint.value?.volume) },
      { label: '成交额', value: formatAmount(lastPoint.value?.amount) },
      { label: '换手率', value: formatSigned(lastPoint.value?.turnover, 2, '%'), tone: getChangeTone(lastPoint.value?.turnover || 0) },
      { label: '阶段涨跌', value: formatSigned(lastPoint.value?.changePct, 2, '%'), tone: getChangeTone(lastPoint.value?.changePct || 0) },
    ],
    volatility: [
      { label: '振幅', value: formatSigned(lastPoint.value?.amplitude, 2, '%'), tone: getChangeTone(lastPoint.value?.amplitude || 0) },
      { label: '实体占比', value: formatSigned(candleBodyRatio.value, 1, '%'), tone: getBodyTone(candleBodyRatio.value, lastPoint.value?.change || 0) },
      { label: '上影占比', value: formatSigned(upperShadowRatio.value, 1, '%'), tone: getUpperShadowTone(upperShadowRatio.value) },
      { label: '下影占比', value: formatSigned(lowerShadowRatio.value, 1, '%'), tone: getLowerShadowTone(lowerShadowRatio.value) },
    ],
  }
})

const activeMetrics = computed(() => metricsByDeck.value[activeMetricDeck.value] || metricsByDeck.value.snapshot || [])

function toneClass(value) {
  return getChangeTone(value)
}

function getRangePositionTone(value) {
  if (!Number.isFinite(value)) {
    return ''
  }

  if (value >= 66) {
    return 'rise'
  }

  if (value <= 34) {
    return 'fall'
  }

  return 'flat'
}

function getBodyTone(value, change) {
  if (!Number.isFinite(value) || value < 55) {
    return 'flat'
  }

  return getChangeTone(change)
}

function getUpperShadowTone(value) {
  if (!Number.isFinite(value)) {
    return ''
  }

  if (value >= 40) {
    return 'fall'
  }

  if (value <= 18) {
    return 'rise'
  }

  return 'flat'
}

function getLowerShadowTone(value) {
  if (!Number.isFinite(value)) {
    return ''
  }

  if (value >= 40) {
    return 'rise'
  }

  if (value <= 18) {
    return 'fall'
  }

  return 'flat'
}

function toggleMovingAverage(windowSize) {
  if (activeMovingAverages.value.includes(windowSize)) {
    activeMovingAverages.value = activeMovingAverages.value.filter((item) => item !== windowSize)
    return
  }

  activeMovingAverages.value = [...activeMovingAverages.value, windowSize].sort((left, right) => left - right)
}

function resetDetailPreferences() {
  activeMetricDeck.value = DEFAULT_METRIC_DECK
  activeMovingAverages.value = [...DEFAULT_MOVING_AVERAGES]

  if (props.period !== DEFAULT_PERIOD) {
    emit('change-period', DEFAULT_PERIOD)
  }
}

function areMovingAveragesDefault(values) {
  if (!Array.isArray(values) || values.length !== DEFAULT_MOVING_AVERAGES.length) {
    return false
  }

  return values.every((value, index) => value === DEFAULT_MOVING_AVERAGES[index])
}

function loadMovingAverages() {
  if (typeof window === 'undefined') {
    return DEFAULT_MOVING_AVERAGES
  }

  try {
    const raw = window.localStorage.getItem(MOVING_AVERAGE_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_MOVING_AVERAGES
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return DEFAULT_MOVING_AVERAGES
    }

    const allowedValues = new Set(movingAverageOptions.map((item) => item.value))
    return parsed.filter((item) => allowedValues.has(item)).sort((left, right) => left - right)
  } catch {
    return DEFAULT_MOVING_AVERAGES
  }
}

function loadMetricDeck() {
  if (typeof window === 'undefined') {
    return DEFAULT_METRIC_DECK
  }

  const raw = window.localStorage.getItem(METRIC_DECK_STORAGE_KEY)
  return raw === 'flow' || raw === 'volatility' ? raw : DEFAULT_METRIC_DECK
}
</script>