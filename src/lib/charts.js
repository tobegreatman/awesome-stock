import { formatAmount, formatPrice, formatSigned } from './formatters.js'

function withOpacity(hex, alpha) {
  const sanitized = hex.replace('#', '')
  const bigint = Number.parseInt(sanitized, 16)
  const red = (bigint >> 16) & 255
  const green = (bigint >> 8) & 255
  const blue = bigint & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export const MOVING_AVERAGE_COLORS = Object.freeze({
  5: '#f8fafc',
  10: '#7dd3fc',
  20: '#f59e0b',
  60: '#c084fc',
})

const TOOLTIP_ACCENTS = Object.freeze({
  rise: '#ff8d8d',
  fall: '#78d68f',
  flat: '#f5f7fb',
  soft: '#d1d5db',
  average: '#7dd3fc',
})

function calculateMovingAverage(points, windowSize) {
  return points.map((_, index) => {
    if (index < windowSize - 1) {
      return null
    }

    const subset = points.slice(index - windowSize + 1, index + 1)
    const total = subset.reduce((sum, item) => sum + item.close, 0)
    return Number((total / windowSize).toFixed(2))
  })
}

function formatMovingAverageValue(points, dataIndex, windowSize) {
  const value = calculateMovingAverage(points, windowSize)[dataIndex]
  return formatPrice(value)
}

function buildTooltipMetric(label, value, accent = 'rgba(245, 247, 251, 0.92)') {
  return `<div style="display:flex;justify-content:space-between;gap:20px;margin-top:8px;"><span style="color:rgba(245,247,251,0.52);">${label}</span><strong style="font-weight:600;color:${accent};">${value}</strong></div>`
}

function getTooltipToneColor(value) {
  if (!Number.isFinite(value)) {
    return TOOLTIP_ACCENTS.flat
  }

  if (value > 0) {
    return TOOLTIP_ACCENTS.rise
  }

  if (value < 0) {
    return TOOLTIP_ACCENTS.fall
  }

  return TOOLTIP_ACCENTS.flat
}

function getRatioBiasColor(value, { high = 66, low = 34, highColor = TOOLTIP_ACCENTS.rise, lowColor = TOOLTIP_ACCENTS.fall } = {}) {
  if (!Number.isFinite(value)) {
    return TOOLTIP_ACCENTS.flat
  }

  if (value >= high) {
    return highColor
  }

  if (value <= low) {
    return lowColor
  }

  return TOOLTIP_ACCENTS.flat
}

function getUpColor(value) {
  const intensity = Math.min(Math.abs(value) / 8, 1)
  const red = Math.round(245 - intensity * 26)
  const green = Math.round(245 - intensity * 180)
  const blue = Math.round(245 - intensity * 185)
  return `rgb(${red}, ${green}, ${blue})`
}

function getDownColor(value) {
  const intensity = Math.min(Math.abs(value) / 8, 1)
  const red = Math.round(239 - intensity * 120)
  const green = Math.round(247 - intensity * 92)
  const blue = Math.round(239 - intensity * 150)
  return `rgb(${red}, ${green}, ${blue})`
}

function getTreemapColor(changePct) {
  if (changePct > 0.08) {
    return getUpColor(changePct)
  }

  if (changePct < -0.08) {
    return getDownColor(changePct)
  }

  return '#f5f7fb'
}

function getTreemapWeight(item, weightMode = 'blend') {
  const flowWeight = Math.abs(Number(item.mainNetInflow) || 0) / 1e8
  const changeWeight = Math.abs(Number(item.changePct) || 0) * 2
  const strengthWeight = Math.abs(Number(item.leadingStrength) || 0) * 1.5

  if (weightMode === 'flow') {
    return Math.max(flowWeight, 1)
  }

  if (weightMode === 'change') {
    return Math.max(changeWeight, 1)
  }

  return Math.max(flowWeight, changeWeight, strengthWeight, 1)
}

function getKlineDefaultZoom(period, pointCount) {
  const visibleCountByPeriod = {
    day: 90,
    week: 56,
    month: 36,
  }

  const desiredVisibleCount = visibleCountByPeriod[period] || 90

  if (!Number.isFinite(pointCount) || pointCount <= desiredVisibleCount) {
    return { start: 0, end: 100 }
  }

  return {
    start: Number((((pointCount - desiredVisibleCount) / pointCount) * 100).toFixed(2)),
    end: 100,
  }
}

export function buildIntradayOption(stock, trend) {
  const labels = trend.points.map((item) => item.timestamp.slice(11, 16))
  const prices = trend.points.map((item) => item.close)
  const average = trend.points.map((item) => item.average)
  const tone = stock?.changePct >= 0 ? '#ef4444' : '#22c55e'

  return {
    backgroundColor: 'transparent',
    animationDuration: 500,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10, 10, 12, 0.94)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: { color: '#f5f7fb' },
      formatter: (params) => {
        const source = Array.isArray(params) ? params[0] : params
        const dataIndex = source?.dataIndex ?? 0
        const point = trend.points[dataIndex]

        if (!point) {
          return ''
        }

        const change = Number.isFinite(stock?.preClose) ? point.close - stock.preClose : NaN
        const changePct = Number.isFinite(stock?.preClose) && stock.preClose !== 0 ? (change / stock.preClose) * 100 : NaN
        const changeTone = getTooltipToneColor(change)
        const averageBias = Number.isFinite(point.average) && point.average !== 0 ? ((point.close - point.average) / point.average) * 100 : NaN

        return `
          <div style="min-width:220px;padding:4px 2px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
              <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(245,247,251,0.5);">${point.timestamp.slice(11, 16)}</div>
              <div style="font-size:13px;font-weight:700;color:${changeTone};">${formatSigned(changePct, 2, '%')}</div>
            </div>
            <div style="margin-top:10px;padding:12px 14px;border-radius:16px;background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);">
              ${buildTooltipMetric('成交价', formatPrice(point.close), changeTone)}
              ${buildTooltipMetric('均价', formatPrice(point.average), TOOLTIP_ACCENTS.average)}
              ${buildTooltipMetric('涨跌额', formatSigned(change), changeTone)}
              ${buildTooltipMetric('涨跌幅', formatSigned(changePct, 2, '%'), changeTone)}
              ${buildTooltipMetric('均价乖离', formatSigned(averageBias, 2, '%'), getTooltipToneColor(averageBias))}
              ${buildTooltipMetric('成交量', formatAmount(point.volume), TOOLTIP_ACCENTS.soft)}
              ${buildTooltipMetric('成交额', formatAmount(point.amount), TOOLTIP_ACCENTS.soft)}
            </div>
          </div>
        `
      },
    },
    legend: {
      top: 0,
      textStyle: { color: 'rgba(245, 247, 251, 0.66)' },
    },
    grid: {
      left: 18,
      right: 18,
      top: 44,
      bottom: 76,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { color: 'rgba(245, 247, 251, 0.54)' },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: 'rgba(245, 247, 251, 0.54)' },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    },
    dataZoom: [
      {
        type: 'inside',
        start: 40,
        end: 100,
      },
      {
        type: 'slider',
        height: 32,
        bottom: 22,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        fillerColor: 'rgba(118, 169, 255, 0.24)',
        handleStyle: { color: '#f5f7fb' },
        textStyle: { color: 'rgba(245, 247, 251, 0.45)' },
        start: 40,
        end: 100,
      },
    ],
    series: [
      {
        name: '分时',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: tone, width: 2.6 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withOpacity(tone, 0.36) },
              { offset: 1, color: withOpacity(tone, 0.02) },
            ],
          },
        },
        data: prices,
      },
      {
        name: '均价',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#7dd3fc', width: 1.6, type: 'dashed' },
        data: average,
      },
    ],
  }
}

export function buildKlineOption(trend, movingAverageWindows = [], period = 'day') {
  const labels = trend.points.map((item) => item.date)
  const candle = trend.points.map((item) => [item.open, item.close, item.low, item.high])
  const volumes = trend.points.map((item) => ({
    value: item.volume,
    itemStyle: {
      color: item.close >= item.open ? '#ef4444' : '#22c55e',
    },
  }))
  const movingAverageSeries = movingAverageWindows.map((windowSize) => ({
    name: `MA${windowSize}`,
    type: 'line',
    data: calculateMovingAverage(trend.points, windowSize),
    showSymbol: false,
    smooth: true,
    connectNulls: false,
    lineStyle: {
      width: 1.5,
      color: MOVING_AVERAGE_COLORS[windowSize] || '#f5f7fb',
      opacity: 0.95,
    },
    emphasis: {
      focus: 'series',
    },
  }))
  const defaultZoom = getKlineDefaultZoom(period, trend.points.length)

  return {
    backgroundColor: 'transparent',
    animationDuration: 500,
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 6,
      textStyle: { color: 'rgba(245, 247, 251, 0.62)' },
      data: ['K线', ...movingAverageSeries.map((item) => item.name)],
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(10, 10, 12, 0.94)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#f5f7fb' },
      formatter: (params) => {
        const source = Array.isArray(params) ? params[0] : params
        const dataIndex = source?.dataIndex ?? 0
        const point = trend.points[dataIndex]

        if (!point) {
          return ''
        }

        const tone = getTooltipToneColor(point.change)
        const candleRange = point.high - point.low
        const upperShadowRatio = candleRange > 0 ? ((point.high - Math.max(point.open, point.close)) / candleRange) * 100 : NaN
        const lowerShadowRatio = candleRange > 0 ? ((Math.min(point.open, point.close) - point.low) / candleRange) * 100 : NaN
        const movingAverageRows = movingAverageWindows
          .map((windowSize) => buildTooltipMetric(`MA${windowSize}`, formatMovingAverageValue(trend.points, dataIndex, windowSize), MOVING_AVERAGE_COLORS[windowSize] || '#f5f7fb'))
          .join('')

        return `
          <div style="min-width:220px;padding:4px 2px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
              <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(245,247,251,0.5);">${point.date}</div>
              <div style="font-size:13px;font-weight:700;color:${tone};">${formatSigned(point.changePct, 2, '%')}</div>
            </div>
            <div style="margin-top:10px;padding:12px 14px;border-radius:16px;background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);">
              ${buildTooltipMetric('开盘', formatPrice(point.open), TOOLTIP_ACCENTS.flat)}
              ${buildTooltipMetric('收盘', formatPrice(point.close), tone)}
              ${buildTooltipMetric('最高', formatPrice(point.high), TOOLTIP_ACCENTS.flat)}
              ${buildTooltipMetric('最低', formatPrice(point.low), TOOLTIP_ACCENTS.soft)}
              ${buildTooltipMetric('成交量', formatAmount(point.volume), TOOLTIP_ACCENTS.soft)}
              ${buildTooltipMetric('成交额', formatAmount(point.amount), TOOLTIP_ACCENTS.soft)}
              ${buildTooltipMetric('上影占比', formatSigned(upperShadowRatio, 1, '%'), getRatioBiasColor(upperShadowRatio, { high: 40, low: 18, highColor: TOOLTIP_ACCENTS.fall, lowColor: TOOLTIP_ACCENTS.rise }))}
              ${buildTooltipMetric('下影占比', formatSigned(lowerShadowRatio, 1, '%'), getRatioBiasColor(lowerShadowRatio, { high: 40, low: 18, highColor: TOOLTIP_ACCENTS.rise, lowColor: TOOLTIP_ACCENTS.fall }))}
              ${movingAverageRows}
            </div>
          </div>
        `
      },
    },
    grid: [
      { left: 18, right: 18, top: 42, height: '56%', containLabel: true },
      { left: 18, right: 18, top: '76%', height: '14%', containLabel: true },
    ],
    xAxis: [
      {
        type: 'category',
        data: labels,
        scale: true,
        boundaryGap: false,
        axisLabel: { color: 'rgba(245, 247, 251, 0.54)' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        min: 'dataMin',
        max: 'dataMax',
      },
      {
        type: 'category',
        gridIndex: 1,
        data: labels,
        scale: true,
        boundaryGap: false,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisTick: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
    ],
    yAxis: [
      {
        scale: true,
        splitArea: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisLabel: { color: 'rgba(245, 247, 251, 0.54)' },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { color: 'rgba(245, 247, 251, 0.5)' },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: defaultZoom.start, end: defaultZoom.end },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        bottom: 8,
        height: 24,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        fillerColor: 'rgba(118, 169, 255, 0.2)',
        handleStyle: { color: '#f5f7fb' },
        textStyle: { color: 'rgba(245,247,251,0.45)' },
        start: defaultZoom.start,
        end: defaultZoom.end,
      },
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: candle,
        itemStyle: {
          color: '#ef4444',
          color0: '#22c55e',
          borderColor: '#ef4444',
          borderColor0: '#22c55e',
        },
      },
      ...movingAverageSeries,
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
      },
    ],
  }
}

export function buildTreemapOption(items, options = {}) {
  const weightMode = options.weightMode || 'blend'
  const data = items.map((item) => ({
    name: item.name,
    value: getTreemapWeight(item, weightMode),
    changePct: item.changePct,
    mainNetInflow: item.mainNetInflow,
    leadingStrength: item.leadingStrength,
    weightMode,
    itemStyle: {
      color: getTreemapColor(item.changePct),
      borderColor: 'rgba(5,5,5,0.4)',
      borderWidth: 2,
      gapWidth: 2,
    },
    label: {
      formatter: `${item.name}\n${item.changePct > 0 ? '+' : ''}${item.changePct.toFixed(2)}%`,
      color: item.changePct > 0.08 ? '#fff0f0' : item.changePct < -0.08 ? '#ecfff2' : '#0f172a',
      fontWeight: 700,
      lineHeight: 22,
    },
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params) => {
        const changePct = Number(params.data?.changePct || 0)
        const mainNetInflow = Number(params.data?.mainNetInflow || 0)
        const leadingStrength = Number(params.data?.leadingStrength || 0)
        const activeWeightMode = String(params.data?.weightMode || 'blend')
        const signed = `${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`
        const weightModeLabel = activeWeightMode === 'flow' ? '资金' : activeWeightMode === 'change' ? '涨幅' : '综合'
        return `
          <div style="min-width:220px;padding:4px 2px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
              <div style="font-size:14px;font-weight:700;color:#f5f7fb;">${params.name}</div>
              <div style="font-size:13px;font-weight:700;color:${getTooltipToneColor(changePct)};">${signed}</div>
            </div>
            <div style="margin-top:10px;padding:12px 14px;border-radius:16px;background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);">
              ${buildTooltipMetric('涨跌幅', signed, getTooltipToneColor(changePct))}
              ${buildTooltipMetric('主力净流入', formatAmount(mainNetInflow), getTooltipToneColor(mainNetInflow))}
              ${buildTooltipMetric('领先强度', formatSigned(leadingStrength, 2, '%'), getTooltipToneColor(leadingStrength))}
              ${buildTooltipMetric('面积模式', weightModeLabel, TOOLTIP_ACCENTS.soft)}
              ${buildTooltipMetric('热度权重', formatPrice(Number(params.data?.value || 0)), TOOLTIP_ACCENTS.soft)}
            </div>
          </div>
        `
      },
      backgroundColor: 'rgba(10, 10, 12, 0.94)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#f5f7fb' },
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        breadcrumb: { show: false },
        nodeClick: false,
        itemStyle: {
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          gapWidth: 4,
        },
        upperLabel: { show: false },
        label: {
          show: true,
          overflow: 'truncate',
        },
        emphasis: {
          itemStyle: {
            borderColor: '#f5f7fb',
            borderWidth: 2,
          },
        },
        data,
      },
    ],
  }
}