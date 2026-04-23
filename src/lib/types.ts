export interface Candle {
  date: string
  open: number
  close: number
  low: number
  high: number
  volume: number
  amount: number
}

export interface StockSeries {
  code: string
  name: string
  market: string
  source: 'sample' | 'tushare'
  candles: Candle[]
}

export interface MarketSnapshot {
  generatedAt: string
  source: string
  symbols: StockSeries[]
}

export interface MatchResult {
  code: string
  name: string
  market: string
  score: number
  correlation: number
  shapeScore: number
  directionScore: number
  startIndex: number
  endIndex: number
  candles: Candle[]
  normalizedClose: number[]
}

export interface TushareConfig {
  token: string
  proxyUrl: string
  symbols: string
  startDate: string
  endDate: string
}
