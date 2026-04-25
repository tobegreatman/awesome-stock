<template>
  <main class="app-shell">
    <div class="ambient-orb ambient-orb--red"></div>
    <div class="ambient-orb ambient-orb--blue"></div>
    <div class="ambient-orb ambient-orb--green"></div>

    <div class="app-frame">
      <AppHeader
        :active-view="activeView"
        :tracked-count="codes.length"
        :updated-at="activeUpdatedAt"
        :refreshing="isRefreshing"
        :focus-label="headerFocusLabel"
        :focus-name="headerFocusName"
        :focus-code="headerFocusCode"
        :focus-change-label="headerFocusChange"
        :focus-tone="headerFocusTone"
        :secondary-label="headerSecondaryLabel"
        :secondary-value="headerSecondaryValue"
        :secondary-meta="headerSecondaryMeta"
        :secondary-tone="headerSecondaryTone"
        :average-change-label="averageChangeLabel"
        :average-tone="summaryTone"
        :tertiary-label="headerTertiaryLabel"
        :tertiary-value="headerTertiaryValue"
        :tertiary-meta="headerTertiaryMeta"
        :tertiary-tone="headerTertiaryTone"
        :strongest-name="strongestName"
        :strongest-change="strongestChange"
        :hottest-industry-name="hottestIndustry.name"
        :hottest-industry-label="hottestIndustryLabel"
        :hottest-industry-tone="toneClass(hottestIndustry.changePct)"
        @switch-view="activeView = $event"
        @refresh="refreshActiveView"
      />

      <section class="summary-ribbon">
        <article class="summary-chip">
          <span class="summary-chip__label">上涨家数</span>
          <span class="summary-chip__value rise">{{ risingQuoteCount }}</span>
          <span class="summary-chip__sub">平盘 {{ flatQuoteCount }} 只</span>
        </article>
        <article class="summary-chip">
          <span class="summary-chip__label">下跌家数</span>
          <span class="summary-chip__value fall">{{ fallingQuoteCount }}</span>
          <span class="summary-chip__sub">净强弱差 {{ quoteBreadthLabel }}</span>
        </article>
        <article class="summary-chip">
          <span class="summary-chip__label">最强标的</span>
          <span class="summary-chip__value">{{ strongestName }}</span>
          <span class="summary-chip__sub" :class="toneClass(strongestStock?.changePct || 0)">{{ strongestChange }}</span>
        </article>
        <article class="summary-chip">
          <span class="summary-chip__label">最弱标的</span>
          <span class="summary-chip__value">{{ weakestName }}</span>
          <span class="summary-chip__sub" :class="toneClass(weakestStock?.changePct || 0)">{{ weakestChange }}</span>
        </article>
      </section>

      <div v-if="globalError" class="error-banner">{{ globalError }}</div>

      <template v-if="activeView === 'quotes'">
        <div class="panel-grid">
          <div class="stack-column">
            <StockPoolEditor :model-value="codes" @submit="applyCodes" />
            <QuoteList :items="quotes" :selected-code="selectedCode" :loading="loadingQuotes" @select="selectStock" />
          </div>

          <StockDetail :stock="selectedStock" :trend="trend" :period="selectedPeriod" :loading="loadingTrend" @change-period="selectPeriod" />
        </div>
      </template>

      <template v-else>
        <section class="market-grid">
          <div class="market-stats">
            <article class="summary-chip">
              <span class="summary-chip__label">{{ marketLeaderTitle }}</span>
              <span class="summary-chip__value">{{ marketLeaderDisplayName }}</span>
              <span class="summary-chip__sub" :class="hasVisibleIndustries ? toneClass(marketLeaderIndustry.changePct) : 'flat'">{{ marketLeaderDisplayMeta }}</span>
            </article>
            <article class="summary-chip">
              <span class="summary-chip__label">{{ marketLaggingTitle }}</span>
              <span class="summary-chip__value">{{ marketLaggingDisplayName }}</span>
              <span class="summary-chip__sub" :class="hasVisibleIndustries ? toneClass(marketLaggingIndustry.changePct) : 'flat'">{{ marketLaggingDisplayMeta }}</span>
            </article>
            <article class="summary-chip">
              <span class="summary-chip__label">{{ marketCoverageTitle }}</span>
              <span class="summary-chip__value" :class="toneClass(marketCoverageTone)">{{ marketCoverageValue }}</span>
              <span class="summary-chip__sub">{{ marketCoverageSub }}</span>
            </article>
            <article class="summary-chip">
              <span class="summary-chip__label">{{ marketFlowTitle }}</span>
              <span class="summary-chip__value" :class="hasVisibleIndustries ? toneClass(visibleIndustryFlow) : 'flat'">{{ marketFlowDisplayValue }}</span>
              <span class="summary-chip__sub">{{ marketFlowDisplaySub }}</span>
            </article>
          </div>

          <MarketTreemap :items="industries" :loading="loadingMarket" :filter-mode="marketFilterMode" @update:filter-mode="marketFilterMode = $event" />
        </section>
      </template>

      <footer class="app-footer">数据来源：东方财富公开行情接口，后端通过 Koa 代理并带短时缓存，降低频繁刷新带来的波动。</footer>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import MarketTreemap from '@/components/MarketTreemap.vue'
import QuoteList from '@/components/QuoteList.vue'
import StockDetail from '@/components/StockDetail.vue'
import StockPoolEditor from '@/components/StockPoolEditor.vue'
import { formatAmount, formatSigned, getChangeTone } from '@/lib/formatters'
import { getIndustries, getQuotes, getTrend } from '@/services/api'

const MARKET_FILTER_STORAGE_KEY = 'stock-atelier.market-filter-mode'
const MARKET_FILTER_VALUES = new Set(['all', 'up', 'flat', 'down'])
const VIEW_STORAGE_KEY = 'stock-atelier.active-view'
const STORAGE_KEY = 'stock-atelier.codes'
const DEFAULT_CODES = ['600519', '000001', '300750', '601318', '600036']

const activeView = ref(loadInitialView())
const marketFilterMode = ref(loadInitialMarketFilterMode())
const selectedPeriod = ref('intraday')
const quotes = ref([])
const trend = ref(null)
const industries = ref([])
const loadingQuotes = ref(false)
const loadingTrend = ref(false)
const loadingMarket = ref(false)
const quotesUpdatedAt = ref('')
const trendUpdatedAt = ref('')
const marketUpdatedAt = ref('')
const globalError = ref('')

const codes = ref(loadInitialCodes())
const selectedCode = ref(codes.value[0])

let quotesRequestId = 0
let trendRequestId = 0
let marketRequestId = 0

function loadInitialCodes() {
  const query = new URLSearchParams(window.location.search).get('codes')
  const raw = query || window.localStorage.getItem(STORAGE_KEY) || DEFAULT_CODES.join(',')
  return raw
    .split(/[\s,;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^\d{5,6}$/.test(item))
    .slice(0, 12)
}

function loadInitialView() {
  const raw = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return raw === 'market' ? 'market' : 'quotes'
}

function loadInitialMarketFilterMode() {
  const raw = window.localStorage.getItem(MARKET_FILTER_STORAGE_KEY)
  return MARKET_FILTER_VALUES.has(raw) ? raw : 'all'
}

function persistCodes(nextCodes) {
  window.localStorage.setItem(STORAGE_KEY, nextCodes.join(','))
  const url = new URL(window.location.href)
  url.searchParams.set('codes', nextCodes.join(','))
  window.history.replaceState({}, '', url)
}

function persistActiveView(nextView) {
  window.localStorage.setItem(VIEW_STORAGE_KEY, nextView)
}

function persistMarketFilterMode(nextMode) {
  window.localStorage.setItem(MARKET_FILTER_STORAGE_KEY, nextMode)
}

const selectedStock = computed(() => quotes.value.find((item) => item.code === selectedCode.value) || quotes.value[0] || null)
const activeUpdatedAt = computed(() => (activeView.value === 'quotes' ? trendUpdatedAt.value || quotesUpdatedAt.value : marketUpdatedAt.value))
const isRefreshing = computed(() => (activeView.value === 'quotes' ? loadingQuotes.value || loadingTrend.value : loadingMarket.value))

const averageChange = computed(() => {
  if (!quotes.value.length) {
    return 0
  }

  return quotes.value.reduce((sum, item) => sum + item.changePct, 0) / quotes.value.length
})

const strongestStock = computed(() => quotes.value.slice().sort((left, right) => right.changePct - left.changePct)[0] || null)
const weakestStock = computed(() => quotes.value.slice().sort((left, right) => left.changePct - right.changePct)[0] || null)
const strongestName = computed(() => strongestStock.value?.name || '--')
const strongestChange = computed(() => formatSigned(strongestStock.value?.changePct || 0, 2, '%'))
const weakestName = computed(() => weakestStock.value?.name || '--')
const weakestChange = computed(() => formatSigned(weakestStock.value?.changePct || 0, 2, '%'))
const averageChangeLabel = computed(() => formatSigned(averageChange.value, 2, '%'))
const summaryTone = computed(() => getChangeTone(averageChange.value))
const hottestIndustry = computed(() => industries.value[0] || { name: '--', changePct: 0 })
const coldestIndustry = computed(() => industries.value.slice().sort((left, right) => left.changePct - right.changePct)[0] || { name: '--', changePct: 0 })
const hottestIndustryLabel = computed(() => formatSigned(hottestIndustry.value.changePct || 0, 2, '%'))
const coldestIndustryLabel = computed(() => formatSigned(coldestIndustry.value.changePct || 0, 2, '%'))
const hottestLeadingLabel = computed(() => formatSigned(hottestIndustry.value.leadingStrength || 0, 2, '%'))
const coldestLeadingLabel = computed(() => formatSigned(coldestIndustry.value.leadingStrength || 0, 2, '%'))
const risingQuoteCount = computed(() => quotes.value.filter((item) => item.changePct > 0).length)
const fallingQuoteCount = computed(() => quotes.value.filter((item) => item.changePct < 0).length)
const flatQuoteCount = computed(() => quotes.value.filter((item) => item.changePct === 0).length)
const risingIndustryCount = computed(() => industries.value.filter((item) => item.changePct > 0).length)
const fallingIndustryCount = computed(() => industries.value.filter((item) => item.changePct < 0).length)
const flatIndustryCount = computed(() => industries.value.filter((item) => item.changePct === 0).length)
const industryBreadth = computed(() => risingIndustryCount.value - fallingIndustryCount.value)
const industryBreadthLabel = computed(() => `${industryBreadth.value > 0 ? '+' : ''}${industryBreadth.value}`)
const totalIndustryFlow = computed(() => industries.value.reduce((sum, item) => sum + (item.mainNetInflow || 0), 0))
const totalIndustryFlowLabel = computed(() => formatAmount(totalIndustryFlow.value))
const strongestFlowIndustry = computed(() => industries.value.slice().sort((left, right) => Math.abs(right.mainNetInflow) - Math.abs(left.mainNetInflow))[0] || { name: '--', mainNetInflow: 0 })
const strongestFlowLabel = computed(() => formatAmount(strongestFlowIndustry.value.mainNetInflow || 0))
const visibleIndustries = computed(() => {
  if (marketFilterMode.value === 'up') {
    return industries.value.filter((item) => item.changePct > 0)
  }

  if (marketFilterMode.value === 'flat') {
    return industries.value.filter((item) => item.changePct === 0)
  }

  if (marketFilterMode.value === 'down') {
    return industries.value.filter((item) => item.changePct < 0)
  }

  return industries.value
})
const hasVisibleIndustries = computed(() => visibleIndustries.value.length > 0)
const marketEmptyCopy = computed(() => {
  if (marketFilterMode.value === 'flat') {
    return {
      leaderName: '暂无平盘板块',
      leaderMeta: '等待新的平衡节点',
      laggingName: '切回全市场',
      laggingMeta: '当前没有零涨跌样本',
      focusName: '暂无平盘板块',
      focusChange: '等待新样本',
      tertiaryValue: '静候资金归拢',
      tertiaryMeta: '当前无匹配行业',
    }
  }

  if (marketFilterMode.value === 'up') {
    return {
      leaderName: '暂无上涨板块',
      leaderMeta: '等待新的上攻样本',
      laggingName: '切回全市场',
      laggingMeta: '当前没有上涨行业',
      focusName: '暂无上涨板块',
      focusChange: '等待新样本',
      tertiaryValue: '静候资金回流',
      tertiaryMeta: '当前无匹配行业',
    }
  }

  if (marketFilterMode.value === 'down') {
    return {
      leaderName: '暂无下跌板块',
      leaderMeta: '等待新的回撤样本',
      laggingName: '切回全市场',
      laggingMeta: '当前没有下跌行业',
      focusName: '暂无下跌板块',
      focusChange: '等待新样本',
      tertiaryValue: '静候资金再分配',
      tertiaryMeta: '当前无匹配行业',
    }
  }

  return {
    leaderName: '--',
    leaderMeta: '--',
    laggingName: '--',
    laggingMeta: '--',
    focusName: '--',
    focusChange: '--',
    tertiaryValue: '--',
    tertiaryMeta: '--',
  }
})
const marketChangeSortedIndustries = computed(() => visibleIndustries.value.slice().sort((left, right) => left.changePct - right.changePct))
const marketStrengthSortedIndustries = computed(() => visibleIndustries.value.slice().sort((left, right) => left.leadingStrength - right.leadingStrength))
const marketLeaderIndustry = computed(() => {
  if (!marketChangeSortedIndustries.value.length) {
    return { name: '--', changePct: 0, leadingStrength: 0 }
  }

  if (marketFilterMode.value === 'flat') {
    return marketStrengthSortedIndustries.value[marketStrengthSortedIndustries.value.length - 1]
  }

  return marketFilterMode.value === 'down'
    ? marketChangeSortedIndustries.value[0]
    : marketChangeSortedIndustries.value[marketChangeSortedIndustries.value.length - 1]
})
const marketLaggingIndustry = computed(() => {
  if (!marketChangeSortedIndustries.value.length) {
    return { name: '--', changePct: 0, leadingStrength: 0 }
  }

  if (marketFilterMode.value === 'flat') {
    return marketStrengthSortedIndustries.value[0]
  }

  return marketFilterMode.value === 'down'
    ? marketChangeSortedIndustries.value[marketChangeSortedIndustries.value.length - 1]
    : marketChangeSortedIndustries.value[0]
})
const marketLeaderTitle = computed(() => {
  if (marketFilterMode.value === 'up') {
    return '上涨领跑'
  }

  if (marketFilterMode.value === 'flat') {
    return '平盘焦点'
  }

  if (marketFilterMode.value === 'down') {
    return '下跌加速'
  }

  return '行业领涨'
})
const marketLaggingTitle = computed(() => {
  if (marketFilterMode.value === 'up') {
    return '末位上涨'
  }

  if (marketFilterMode.value === 'flat') {
    return '平盘偏弱'
  }

  if (marketFilterMode.value === 'down') {
    return '相对抗跌'
  }

  return '行业领跌'
})
const marketLeaderLabel = computed(() => formatSigned(marketLeaderIndustry.value.changePct || 0, 2, '%'))
const marketLaggingLabel = computed(() => formatSigned(marketLaggingIndustry.value.changePct || 0, 2, '%'))
const marketLeaderStrengthLabel = computed(() => formatSigned(marketLeaderIndustry.value.leadingStrength || 0, 2, '%'))
const marketLaggingStrengthLabel = computed(() => formatSigned(marketLaggingIndustry.value.leadingStrength || 0, 2, '%'))
const marketLeaderDisplayName = computed(() => (hasVisibleIndustries.value ? marketLeaderIndustry.value.name : marketEmptyCopy.value.leaderName))
const marketLaggingDisplayName = computed(() => (hasVisibleIndustries.value ? marketLaggingIndustry.value.name : marketEmptyCopy.value.laggingName))
const marketLeaderDisplayMeta = computed(() =>
  hasVisibleIndustries.value ? `${marketLeaderLabel.value} · 强度 ${marketLeaderStrengthLabel.value}` : marketEmptyCopy.value.leaderMeta,
)
const marketLaggingDisplayMeta = computed(() =>
  hasVisibleIndustries.value ? `${marketLaggingLabel.value} · 强度 ${marketLaggingStrengthLabel.value}` : marketEmptyCopy.value.laggingMeta,
)
const hiddenIndustryCount = computed(() => Math.max(industries.value.length - visibleIndustries.value.length, 0))
const marketCoverageTitle = computed(() => (marketFilterMode.value === 'all' ? '市场广度' : '筛选覆盖'))
const marketCoverageTone = computed(() => {
  if (marketFilterMode.value === 'up') {
    return 1
  }

  if (marketFilterMode.value === 'flat') {
    return 0
  }

  if (marketFilterMode.value === 'down') {
    return -1
  }

  return industryBreadth.value
})
const marketCoverageValue = computed(() => {
  if (marketFilterMode.value === 'all') {
    return industryBreadthLabel.value
  }

  return `${visibleIndustries.value.length} / ${industries.value.length}`
})
const marketCoverageSub = computed(() => {
  if (marketFilterMode.value === 'up') {
    return `上涨 ${visibleIndustries.value.length} · 筛除 ${hiddenIndustryCount.value} · 总样本 ${industries.value.length}`
  }

  if (marketFilterMode.value === 'flat') {
    return `平盘 ${visibleIndustries.value.length} · 筛除 ${hiddenIndustryCount.value} · 总样本 ${industries.value.length}`
  }

  if (marketFilterMode.value === 'down') {
    return `下跌 ${visibleIndustries.value.length} · 筛除 ${hiddenIndustryCount.value} · 总样本 ${industries.value.length}`
  }

  return `上涨 ${risingIndustryCount.value} · 下跌 ${fallingIndustryCount.value} · 平盘 ${flatIndustryCount.value}`
})
const visibleIndustryFlow = computed(() => visibleIndustries.value.reduce((sum, item) => sum + (item.mainNetInflow || 0), 0))
const visibleIndustryFlowLabel = computed(() => formatAmount(visibleIndustryFlow.value))
const strongestVisibleFlowIndustry = computed(() =>
  visibleIndustries.value.slice().sort((left, right) => Math.abs(right.mainNetInflow) - Math.abs(left.mainNetInflow))[0] || { name: '--', mainNetInflow: 0 },
)
const strongestVisibleFlowLabel = computed(() => formatAmount(strongestVisibleFlowIndustry.value.mainNetInflow || 0))
const marketFlowTitle = computed(() => (marketFilterMode.value === 'all' ? '主力流向' : '筛选流向'))
const marketFlowDisplayValue = computed(() => (hasVisibleIndustries.value ? visibleIndustryFlowLabel.value : marketEmptyCopy.value.tertiaryMeta))
const marketFlowDisplaySub = computed(() =>
  hasVisibleIndustries.value ? `焦点 ${strongestVisibleFlowIndustry.value.name} · ${strongestVisibleFlowLabel.value}` : marketEmptyCopy.value.tertiaryValue,
)
const marketFilterLabel = computed(() => {
  if (marketFilterMode.value === 'up') {
    return '上涨'
  }

  if (marketFilterMode.value === 'flat') {
    return '平盘'
  }

  if (marketFilterMode.value === 'down') {
    return '下跌'
  }

  return '全市场'
})
const quoteBreadthLabel = computed(() => {
  const breadth = risingQuoteCount.value - fallingQuoteCount.value
  return `${breadth > 0 ? '+' : ''}${breadth}`
})
const headerFocusLabel = computed(() => (activeView.value === 'quotes' ? '当前焦点' : marketLeaderTitle.value))
const headerFocusName = computed(() =>
  activeView.value === 'quotes' ? selectedStock.value?.name || '--' : hasVisibleIndustries.value ? marketLeaderIndustry.value.name || '--' : marketEmptyCopy.value.focusName,
)
const headerFocusCode = computed(() => (activeView.value === 'quotes' ? selectedStock.value?.code || '' : marketFilterLabel.value))
const headerFocusChange = computed(() =>
  activeView.value === 'quotes'
    ? formatSigned(selectedStock.value?.changePct || 0, 2, '%')
    : hasVisibleIndustries.value
      ? marketLeaderLabel.value
      : marketEmptyCopy.value.focusChange,
)
const headerFocusTone = computed(() =>
  activeView.value === 'quotes'
    ? toneClass(selectedStock.value?.changePct || 0)
    : hasVisibleIndustries.value
      ? toneClass(marketLeaderIndustry.value.changePct || 0)
      : 'flat',
)
const headerSecondaryLabel = computed(() => (activeView.value === 'quotes' ? '股票池均值' : marketCoverageTitle.value))
const headerSecondaryValue = computed(() => (activeView.value === 'quotes' ? averageChangeLabel.value : marketCoverageValue.value))
const headerSecondaryMeta = computed(() => (activeView.value === 'quotes' ? '盘中横截面' : marketCoverageSub.value))
const headerSecondaryTone = computed(() => (activeView.value === 'quotes' ? summaryTone.value : toneClass(marketCoverageTone.value)))
const headerTertiaryLabel = computed(() => (activeView.value === 'quotes' ? '板块热度' : marketFlowTitle.value))
const headerTertiaryValue = computed(() =>
  activeView.value === 'quotes'
    ? hottestIndustry.value.name
    : hasVisibleIndustries.value
      ? strongestVisibleFlowIndustry.value.name
      : marketEmptyCopy.value.tertiaryValue,
)
const headerTertiaryMeta = computed(() =>
  activeView.value === 'quotes'
    ? hottestIndustryLabel.value
    : hasVisibleIndustries.value
      ? strongestVisibleFlowLabel.value
      : marketEmptyCopy.value.tertiaryMeta,
)
const headerTertiaryTone = computed(() =>
  activeView.value === 'quotes'
    ? toneClass(hottestIndustry.value.changePct || 0)
    : hasVisibleIndustries.value
      ? toneClass(strongestVisibleFlowIndustry.value.mainNetInflow || 0)
      : 'flat',
)

async function refreshQuotes() {
  const requestId = ++quotesRequestId
  loadingQuotes.value = true
  globalError.value = ''

  try {
    const payload = await getQuotes(codes.value)
    if (requestId !== quotesRequestId) {
      return
    }

    quotes.value = payload.items || []
    quotesUpdatedAt.value = payload.updatedAt || new Date().toISOString()

    if (!quotes.value.some((item) => item.code === selectedCode.value)) {
      selectedCode.value = quotes.value[0]?.code || codes.value[0]
    }
  } catch (error) {
    if (requestId === quotesRequestId) {
      globalError.value = error.message
    }
  } finally {
    if (requestId === quotesRequestId) {
      loadingQuotes.value = false
    }
  }
}

async function refreshTrend() {
  if (!selectedCode.value) {
    return
  }

  const requestId = ++trendRequestId
  loadingTrend.value = true

  try {
    const payload = await getTrend(selectedCode.value, selectedPeriod.value)
    if (requestId !== trendRequestId) {
      return
    }

    trend.value = payload
    trendUpdatedAt.value = new Date().toISOString()
  } catch (error) {
    if (requestId === trendRequestId) {
      globalError.value = error.message
    }
  } finally {
    if (requestId === trendRequestId) {
      loadingTrend.value = false
    }
  }
}

async function refreshMarket() {
  const requestId = ++marketRequestId
  loadingMarket.value = true

  try {
    const payload = await getIndustries(80)
    if (requestId !== marketRequestId) {
      return
    }

    industries.value = payload.items || []
    marketUpdatedAt.value = payload.updatedAt || new Date().toISOString()
  } catch (error) {
    if (requestId === marketRequestId) {
      globalError.value = error.message
    }
  } finally {
    if (requestId === marketRequestId) {
      loadingMarket.value = false
    }
  }
}

async function refreshActiveView() {
  if (activeView.value === 'quotes') {
    await refreshQuotes()
    await refreshTrend()
    return
  }

  await refreshMarket()
}

async function applyCodes(nextCodes) {
  codes.value = nextCodes
  persistCodes(nextCodes)
  selectedCode.value = nextCodes[0]
  await refreshQuotes()
  await refreshTrend()
}

async function selectStock(code) {
  if (code === selectedCode.value) {
    return
  }

  selectedCode.value = code
  await refreshTrend()
}

async function selectPeriod(period) {
  if (period === selectedPeriod.value) {
    return
  }

  selectedPeriod.value = period
  await refreshTrend()
}

function toneClass(value) {
  return getChangeTone(value)
}

onMounted(async () => {
  persistCodes(codes.value)
  persistActiveView(activeView.value)
  persistMarketFilterMode(marketFilterMode.value)
  await Promise.all([refreshQuotes(), refreshMarket()])
  await refreshTrend()
})

watch(activeView, (nextView) => {
  persistActiveView(nextView)
})

watch(marketFilterMode, (nextMode) => {
  persistMarketFilterMode(nextMode)
})
</script>