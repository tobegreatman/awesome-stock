<template>
  <svg class="sparkline" viewBox="0 0 110 42" preserveAspectRatio="none" aria-hidden="true">
    <path :d="areaPath" :fill="fill" />
    <path :d="linePath" :stroke="stroke" stroke-width="2.2" fill="none" stroke-linecap="round" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  values: {
    type: Array,
    default: () => [],
  },
  positive: {
    type: Boolean,
    default: true,
  },
})

const stroke = computed(() => (props.positive ? '#ff7f7f' : '#5bd085'))
const fill = computed(() => (props.positive ? 'rgba(239, 68, 68, 0.14)' : 'rgba(34, 197, 94, 0.14)'))

const linePath = computed(() => {
  if (props.values.length < 2) {
    return ''
  }

  const min = Math.min(...props.values)
  const max = Math.max(...props.values)
  const range = max - min || 1

  return props.values
    .map((value, index) => {
      const x = (index / (props.values.length - 1)) * 110
      const y = 38 - ((value - min) / range) * 30
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
})

const areaPath = computed(() => {
  if (!linePath.value) {
    return ''
  }

  return `${linePath.value} L110 42 L0 42 Z`
})
</script>