<template>
  <div ref="chartRef" class="chart-host" :style="{ height }"></div>
</template>

<script setup>
import { BarChart, CandlestickChart, LineChart, TreemapChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

use([BarChart, CandlestickChart, LineChart, TreemapChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({
  option: {
    type: Object,
    required: true,
  },
  height: {
    type: String,
    default: '420px',
  },
})

const chartRef = ref(null)
let chartInstance
let resizeObserver

function render() {
  if (!chartInstance) {
    return
  }

  chartInstance.setOption(props.option, true)
}

onMounted(() => {
  chartInstance = init(chartRef.value)
  render()

  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })

  resizeObserver.observe(chartRef.value)
})

watch(
  () => props.option,
  () => {
    render()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
</script>