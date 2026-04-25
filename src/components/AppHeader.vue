<template>
  <section class="hero-card glass-card">
    <div class="hero-grid">
      <div>
        <p class="eyebrow">Realtime Stock Atelier</p>
        <p class="hero-copy">
          基于真实行情接口构建，默认聚焦盘中节奏与板块扩散。左侧盯股票池，右侧放大单只走势，再用行业矩形树图快速扫全市场。
        </p>
        <div class="hero-pulse-strip" aria-label="盘中脉搏">
          <article class="pulse-chip">
            <span class="pulse-chip__label">{{ focusLabel }}</span>
            <strong class="pulse-chip__value">{{ focusName }}</strong>
            <span class="pulse-chip__meta" :class="focusTone">{{ focusCode }} · {{ focusChangeLabel }}</span>
          </article>
          <article class="pulse-chip">
            <span class="pulse-chip__label">{{ secondaryLabel }}</span>
            <strong class="pulse-chip__value" :class="secondaryTone">{{ secondaryValue }}</strong>
            <span class="pulse-chip__meta">{{ secondaryMeta }}</span>
          </article>
          <article class="pulse-chip">
            <span class="pulse-chip__label">{{ tertiaryLabel }}</span>
            <strong class="pulse-chip__value">{{ tertiaryValue }}</strong>
            <span class="pulse-chip__meta" :class="tertiaryTone">{{ tertiaryMeta }}</span>
          </article>
        </div>
        <div class="hero-actions">
          <button class="pill-button" type="button" @click="$emit('switch-view', 'quotes')">进入行情视图</button>
          <button class="pill-button--ghost" type="button" @click="$emit('switch-view', 'market')">查看市场概览</button>
        </div>
      </div>

      <div class="hero-aside">
        <div class="stat-card">
          <span class="stat-card__label">股票池</span>
          <strong class="stat-card__value">{{ trackedCount }}</strong>
          <span class="stat-card__meta">动态通过代码配置，自带记忆</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">当前视图</span>
          <strong class="stat-card__value">{{ activeView === 'quotes' ? '行情' : '市场概览' }}</strong>
          <span class="stat-card__meta">{{ updatedLabel }}</span>
        </div>
      </div>
    </div>

    <div class="topbar">
      <div class="tab-row" role="tablist" aria-label="主导航">
        <button class="tab-pill" :class="{ 'is-active': activeView === 'quotes' }" type="button" @click="$emit('switch-view', 'quotes')">
          行情
        </button>
        <button class="tab-pill" :class="{ 'is-active': activeView === 'market' }" type="button" @click="$emit('switch-view', 'market')">
          市场概览
        </button>
      </div>

      <div class="topbar-meta">
        <span>最近刷新 {{ updatedLabel }}</span>
        <button class="control-button" type="button" @click="$emit('refresh')">
          {{ refreshing ? '刷新中…' : '手动刷新' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { formatTimestamp } from '@/lib/formatters'

const props = defineProps({
  activeView: {
    type: String,
    required: true,
  },
  trackedCount: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: String,
    default: '',
  },
  refreshing: {
    type: Boolean,
    default: false,
  },
  focusName: {
    type: String,
    default: '--',
  },
  focusLabel: {
    type: String,
    default: '当前焦点',
  },
  focusCode: {
    type: String,
    default: '',
  },
  focusChangeLabel: {
    type: String,
    default: '--',
  },
  focusTone: {
    type: String,
    default: 'flat',
  },
  averageChangeLabel: {
    type: String,
    default: '--',
  },
  averageTone: {
    type: String,
    default: 'flat',
  },
  secondaryLabel: {
    type: String,
    default: '股票池均值',
  },
  secondaryValue: {
    type: String,
    default: '--',
  },
  secondaryMeta: {
    type: String,
    default: '盘中横截面',
  },
  secondaryTone: {
    type: String,
    default: 'flat',
  },
  strongestName: {
    type: String,
    default: '--',
  },
  strongestChange: {
    type: String,
    default: '--',
  },
  hottestIndustryName: {
    type: String,
    default: '--',
  },
  hottestIndustryLabel: {
    type: String,
    default: '--',
  },
  hottestIndustryTone: {
    type: String,
    default: 'flat',
  },
  tertiaryLabel: {
    type: String,
    default: '板块热度',
  },
  tertiaryValue: {
    type: String,
    default: '--',
  },
  tertiaryMeta: {
    type: String,
    default: '--',
  },
  tertiaryTone: {
    type: String,
    default: 'flat',
  },
})

defineEmits(['switch-view', 'refresh'])

const updatedLabel = computed(() => formatTimestamp(props.updatedAt))
</script>