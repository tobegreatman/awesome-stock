import axios from 'axios'

const EASTMONEY = axios.create({
  timeout: 12000,
  headers: {
    Referer: 'https://quote.eastmoney.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
})

const cache = new Map()

const QUOTE_FIELDS = 'f12,f14,f2,f3,f4,f5,f6,f18'
const BOARD_FIELDS = 'f12,f14,f3,f62,f184'
const DEFAULT_CODES = ['600519', '000001', '300750', '601318', '600036']
const BOARD_TOTAL = 496
const SEARCH_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8'
const PERIOD_MAP = {
  day: 101,
  week: 102,
  month: 103,
}
const TENCENT_KLINE_KEY_MAP = {
  day: 'qfqday',
  week: 'qfqweek',
  month: 'qfqmonth',
}

function getCached(key) {
  const record = cache.get(key)

  if (!record) {
    return null
  }

  if (record.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }

  return record.value
}

async function withCache(key, ttl, loader) {
  const existing = getCached(key)
  if (existing) {
    return existing
  }

  const value = await loader()
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  })
  return value
}

function inferMarket(code) {
  if (/^(5|6|9|11|13)/.test(code)) {
    return 1
  }

  return 0
}

function toSecId(code) {
  return `${inferMarket(code)}.${code}`
}

function toTencentSymbol(code) {
  return `${inferMarket(code) === 1 ? 'sh' : 'sz'}${code}`
}

function normalizeCodes(codesParam) {
  const raw = (codesParam || DEFAULT_CODES.join(','))
    .split(/[\s,;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const unique = [...new Set(raw)]
  const valid = unique.filter((item) => /^\d{5,6}$/.test(item))

  return valid.length ? valid.slice(0, 12) : DEFAULT_CODES
}

function normalizeSuggestion(item) {
  return {
    code: item.UnifiedCode || item.Code,
    name: item.Name,
    market: item.SecurityTypeName || item.Classify || '',
    quoteId: item.QuoteID || '',
  }
}

function parseTrendRow(row) {
  const [timestamp, open, close, high, low, volume, amount, average] = row.split(',')
  return {
    timestamp,
    open: Number(open),
    close: Number(close),
    high: Number(high),
    low: Number(low),
    volume: Number(volume),
    amount: Number(amount),
    average: Number(average),
  }
}

function parseKlineRow(row) {
  const [date, open, close, high, low, volume, amount, amplitude, changePct, change, turnover] = row.split(',')
  return {
    date,
    open: Number(open),
    close: Number(close),
    high: Number(high),
    low: Number(low),
    volume: Number(volume),
    amount: Number(amount),
    amplitude: Number(amplitude),
    changePct: Number(changePct),
    change: Number(change),
    turnover: Number(turnover),
  }
}

function pickSparklineValues(points, maxPoints = 56) {
  if (!points.length) {
    return []
  }

  if (points.length <= maxPoints) {
    return points.map((point) => point.close)
  }

  const sampled = []

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index * (points.length - 1)) / (maxPoints - 1))
    sampled.push(points[sourceIndex].close)
  }

  return sampled
}

function formatTencentTradeDate(rawValue) {
  if (/^\d{8,}$/.test(rawValue)) {
    return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`
  }

  return new Date().toISOString().slice(0, 10)
}

function formatTencentMinute(rawValue) {
  if (/^\d{4}$/.test(rawValue)) {
    return `${rawValue.slice(0, 2)}:${rawValue.slice(2, 4)}`
  }

  return rawValue
}

function parseTencentMinuteRows(rows, tradeDate) {
  let previousLots = 0
  let previousAmount = 0
  const normalizedDate = formatTencentTradeDate(tradeDate)

  return rows.map((row) => {
    const [rawTime, rawPrice, rawLots, rawAmount] = row.trim().split(/\s+/)
    const close = Number(rawPrice)
    const cumulativeLots = Number(rawLots)
    const cumulativeAmount = Number(rawAmount)
    const lots = previousLots > 0 ? Math.max(cumulativeLots - previousLots, 0) : cumulativeLots
    const amount = previousAmount > 0 ? Math.max(cumulativeAmount - previousAmount, 0) : cumulativeAmount
    const average = cumulativeLots > 0 ? cumulativeAmount / (cumulativeLots * 100) : close

    previousLots = cumulativeLots
    previousAmount = cumulativeAmount

    return {
      timestamp: `${normalizedDate} ${formatTencentMinute(rawTime)}`,
      open: close,
      close,
      high: close,
      low: close,
      volume: lots * 100,
      amount,
      average: Number(average.toFixed(2)),
    }
  })
}

function parseTencentKlineRows(rows) {
  let previousClose = null

  return rows.map((row) => {
    const [date, open, close, high, low, volume] = row
    const openValue = Number(open)
    const closeValue = Number(close)
    const highValue = Number(high)
    const lowValue = Number(low)
    const volumeValue = Number(volume) * 100
    const referenceClose = previousClose ?? openValue
    const change = closeValue - referenceClose
    const changePct = referenceClose ? (change / referenceClose) * 100 : 0
    const amplitude = referenceClose ? ((highValue - lowValue) / referenceClose) * 100 : 0

    previousClose = closeValue

    return {
      date,
      open: openValue,
      close: closeValue,
      high: highValue,
      low: lowValue,
      volume: volumeValue,
      amount: 0,
      amplitude: Number(amplitude.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      change: Number(change.toFixed(2)),
      turnover: 0,
    }
  })
}

function getTencentQuoteMeta(stock, symbol) {
  const quote = stock?.qt?.[symbol]
  return {
    name: quote?.[1] || symbol,
    preClose: Number(quote?.[4] || 0),
    tradeDate: String(quote?.[30] || ''),
  }
}

async function fetchTencentJson(url) {
  const response = await fetch(url, {
    headers: {
      Referer: 'https://gu.qq.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    throw new Error(`trend fallback request failed with status ${response.status}`)
  }

  return response.json()
}

async function fetchTencentTrend(code, period) {
  const symbol = toTencentSymbol(code)

  if (period === 'intraday') {
    const payload = await fetchTencentJson(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${symbol}`)
    const stock = payload.data?.[symbol]
    const meta = getTencentQuoteMeta(stock, symbol)
    const points = parseTencentMinuteRows(stock?.data?.data || [], meta.tradeDate)

    if (!points.length) {
      throw new Error('intraday fallback returned empty data')
    }

    return {
      code,
      name: meta.name || code,
      period,
      preClose: meta.preClose,
      points,
    }
  }

  const seriesKey = TENCENT_KLINE_KEY_MAP[period] || TENCENT_KLINE_KEY_MAP.day
  const payload = await fetchTencentJson(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},${period},,,240,qfq`)
  const stock = payload.data?.[symbol]
  const meta = getTencentQuoteMeta(stock, symbol)
  const points = parseTencentKlineRows(stock?.[seriesKey] || [])

  if (!points.length) {
    throw new Error('kline fallback returned empty data')
  }

  return {
    code,
    name: meta.name || code,
    period,
    points,
  }
}

async function fetchPrimaryTrend(code, period) {
  if (period === 'intraday') {
    const response = await EASTMONEY.get('https://push2.eastmoney.com/api/qt/stock/trends2/get', {
      params: {
        secid: toSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
        iscr: 0,
        ndays: 1,
        ut: 'fa5fd1943c7b386f172d6893dbfba10b',
      },
    })

    const data = response.data?.data
    return {
      code,
      name: data?.name || code,
      period,
      preClose: Number(data?.preClose || data?.prePrice || 0),
      points: (data?.trends || []).map(parseTrendRow),
    }
  }

  const klt = PERIOD_MAP[period] || PERIOD_MAP.day
  const response = await EASTMONEY.get('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
    params: {
      secid: toSecId(code),
      klt,
      fqt: 1,
      beg: 0,
      end: 20500000,
      lmt: 240,
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
      ut: 'fa5fd1943c7b386f172d6893dbfba10b',
    },
  })

  const data = response.data?.data
  return {
    code,
    name: data?.name || code,
    period,
    points: (data?.klines || []).map(parseKlineRow),
  }
}

async function fetchIntradaySparkline(code) {
  return withCache(`spark:${code}`, 20_000, async () => {
    try {
      const trend = await fetchPrimaryTrend(code, 'intraday')
      return pickSparklineValues(trend.points)
    } catch {
      const fallbackTrend = await fetchTencentTrend(code, 'intraday')
      return pickSparklineValues(fallbackTrend.points)
    }
  })
}

export async function fetchQuotes(codesParam) {
  const codes = normalizeCodes(codesParam)
  const secids = codes.map(toSecId).join(',')

  return withCache(`quotes:${codes.join(',')}`, 20_000, async () => {
    const response = await EASTMONEY.get('https://push2.eastmoney.com/api/qt/ulist.np/get', {
      params: {
        secids,
        fltt: 2,
        invt: 2,
        fields: QUOTE_FIELDS,
      },
    })

    const diff = response.data?.data?.diff || []
    const byCode = new Map(diff.map((item) => [item.f12, item]))
    const sparklines = await Promise.all(
      codes.map(async (code) => {
        try {
          const series = await fetchIntradaySparkline(code)
          return [code, series]
        } catch {
          return [code, []]
        }
      }),
    )

    const sparklineMap = new Map(sparklines)

    return codes
      .map((code) => byCode.get(code))
      .filter(Boolean)
      .map((item) => ({
        code: item.f12,
        name: item.f14,
        price: Number(item.f2),
        changePct: Number(item.f3),
        change: Number(item.f4),
        volume: Number(item.f5),
        amount: Number(item.f6),
        preClose: Number(item.f18),
        market: inferMarket(item.f12),
        sparkline: sparklineMap.get(item.f12) || [],
      }))
  })
}

export async function fetchTrend(code, period = 'intraday') {
  if (!/^\d{5,6}$/.test(code)) {
    throw new Error('股票代码格式不正确')
  }

  return withCache(`trend:${code}:${period}`, period === 'intraday' ? 20_000 : 60_000, async () => {
    try {
      return await fetchPrimaryTrend(code, period)
    } catch {
      try {
        return await fetchTencentTrend(code, period)
      } catch {
        throw new Error('暂时拿不到走势图数据，请稍后重试')
      }
    }
  })
}

export async function fetchIndustryBoards(limit = 80) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 80, 2), BOARD_TOTAL)
  const risingCount = Math.ceil(normalizedLimit / 2)
  const fallingCount = Math.floor(normalizedLimit / 2)

  return withCache(`boards:${normalizedLimit}`, 60_000, async () => {
    const baseParams = {
      pn: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90+t:2',
      fields: BOARD_FIELDS,
    }

    const requests = [
      EASTMONEY.get('https://push2.eastmoney.com/api/qt/clist/get', {
        params: {
          ...baseParams,
          pz: risingCount,
          po: 1,
        },
      }),
    ]

    if (fallingCount > 0) {
      requests.push(
        EASTMONEY.get('https://push2.eastmoney.com/api/qt/clist/get', {
          params: {
            ...baseParams,
            pz: fallingCount,
            po: 0,
          },
        }),
      )
    }

    const responses = await Promise.all(requests)
    const merged = new Map()

    for (const response of responses) {
      for (const item of response.data?.data?.diff || []) {
        merged.set(item.f12, {
          code: item.f12,
          name: item.f14,
          changePct: Number(item.f3),
          mainNetInflow: Number(item.f62),
          leadingStrength: Number(item.f184),
        })
      }
    }

    return [...merged.values()].sort((left, right) => right.changePct - left.changePct)
  })
}

export async function fetchStockSuggestions(query) {
  const normalizedQuery = String(query || '').trim()

  if (normalizedQuery.length < 2) {
    return []
  }

  return withCache(`search:${normalizedQuery}`, 30_000, async () => {
    const response = await EASTMONEY.get('https://searchapi.eastmoney.com/api/suggest/get', {
      params: {
        input: normalizedQuery,
        type: 14,
        token: SEARCH_TOKEN,
      },
    })

    const data = response.data?.QuotationCodeTable?.Data || []

    return data
      .map(normalizeSuggestion)
      .filter((item) => /^\d{5,6}$/.test(item.code))
      .slice(0, 8)
  })
}