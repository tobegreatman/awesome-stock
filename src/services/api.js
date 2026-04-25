async function request(path) {
  const response = await fetch(path)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.message || '请求失败，请稍后重试')
  }

  return payload
}

export function getQuotes(codes) {
  return request(`/api/quotes?codes=${encodeURIComponent(codes.join(','))}`)
}

export function getStockSuggestions(query) {
  return request(`/api/search/stocks?query=${encodeURIComponent(query)}`)
}

export function getTrend(code, period) {
  return request(`/api/trend/${code}?period=${encodeURIComponent(period)}`)
}

export function getIndustries(limit = 80) {
  return request(`/api/market/industries?limit=${limit}`)
}