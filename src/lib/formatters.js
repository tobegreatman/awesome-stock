const compactFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const integerFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})

export function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return '--'
  }

  return value.toFixed(2)
}

export function formatSigned(value, digits = 2, suffix = '') {
  if (!Number.isFinite(value)) {
    return '--'
  }

  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}${suffix}`
}

export function formatCompact(value) {
  if (!Number.isFinite(value)) {
    return '--'
  }

  return compactFormatter.format(value)
}

export function formatAmount(value) {
  if (!Number.isFinite(value)) {
    return '--'
  }

  if (Math.abs(value) >= 1e8) {
    return `${(value / 1e8).toFixed(2)} 亿`
  }

  if (Math.abs(value) >= 1e4) {
    return `${(value / 1e4).toFixed(2)} 万`
  }

  return integerFormatter.format(value)
}

export function formatTimestamp(value) {
  if (!value) {
    return '未刷新'
  }

  const date = new Date(value)
  return `${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })}`
}

export function getChangeTone(value) {
  if (value > 0) {
    return 'rise'
  }

  if (value < 0) {
    return 'fall'
  }

  return 'flat'
}