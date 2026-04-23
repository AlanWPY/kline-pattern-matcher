import type { Candle, MarketSnapshot, StockSeries, TushareConfig } from './types'

interface TushareSuccessResponse {
  code: number
  msg?: string
  data?: {
    fields: string[]
    items: Array<Array<number | string | null>>
  }
}

function compactDate(value: string) {
  if (value.length !== 8) {
    return value
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function parseSymbols(symbols: string) {
  return symbols
    .split(/[\s,，;；]+/)
    .map((symbol) => symbol.trim())
    .filter(Boolean)
}

async function requestRows(
  config: TushareConfig,
  apiName: string,
  params: Record<string, string>,
  fields: string,
) {
  const endpoint = config.proxyUrl.trim() || 'https://api.waditu.com'

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_name: apiName,
      token: config.token.trim(),
      params,
      fields,
    }),
  })

  if (!response.ok) {
    throw new Error(`请求失败：${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as TushareSuccessResponse

  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.msg || 'Tushare 返回了空数据')
  }

  return payload.data.items.map((row) =>
    Object.fromEntries(
      payload.data!.fields.map((field, index) => [field, row[index]]),
    ),
  )
}

function toCandle(row: Record<string, string | number | null>): Candle {
  return {
    date: compactDate(String(row.trade_date ?? '')),
    open: Number(row.open ?? 0),
    close: Number(row.close ?? 0),
    low: Number(row.low ?? 0),
    high: Number(row.high ?? 0),
    volume: Number(row.vol ?? 0),
    amount: Number(row.amount ?? 0),
  }
}

export async function buildTushareSnapshot(config: TushareConfig) {
  const symbols = parseSymbols(config.symbols)

  if (!config.token.trim()) {
    throw new Error('请先填写 Tushare Token')
  }

  if (!symbols.length) {
    throw new Error('请至少填写一个股票代码，例如 600519.SH')
  }

  const seriesList: StockSeries[] = []

  for (const symbol of symbols) {
    const rows = await requestRows(
      config,
      'daily',
      {
        ts_code: symbol,
        start_date: config.startDate,
        end_date: config.endDate,
      },
      'ts_code,trade_date,open,high,low,close,vol,amount',
    )

    const candles = rows
      .map(toCandle)
      .filter(
        (candle) =>
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.close) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.high),
      )
      .sort((left, right) => left.date.localeCompare(right.date))

    if (candles.length) {
      seriesList.push({
        code: symbol,
        name: symbol,
        market: symbol.endsWith('.SH') ? 'SH' : 'SZ',
        source: 'tushare',
        candles,
      })
    }
  }

  const snapshot: MarketSnapshot = {
    generatedAt: new Date().toISOString(),
    source: 'tushare',
    symbols: seriesList,
  }

  return snapshot
}
