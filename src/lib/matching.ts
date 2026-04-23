import { normalizeSeries } from './curve'
import type { MatchResult, StockSeries } from './types'

function pearsonCorrelation(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) {
    return 0
  }

  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
  const rightMean =
    right.reduce((sum, value) => sum + value, 0) / right.length

  let numerator = 0
  let leftDenominator = 0
  let rightDenominator = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftDiff = left[index] - leftMean
    const rightDiff = right[index] - rightMean
    numerator += leftDiff * rightDiff
    leftDenominator += leftDiff * leftDiff
    rightDenominator += rightDiff * rightDiff
  }

  const denominator = Math.sqrt(leftDenominator * rightDenominator)

  if (denominator === 0) {
    return 0
  }

  return numerator / denominator
}

function meanAbsoluteError(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) {
    return 1
  }

  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index])
  }

  return total / left.length
}

function scoreWindow(queryCurve: number[], candidateCurve: number[]) {
  const correlation = (pearsonCorrelation(queryCurve, candidateCurve) + 1) / 2
  const shapeScore = Math.max(0, 1 - meanAbsoluteError(queryCurve, candidateCurve))
  const queryDirection = queryCurve.at(-1)! - queryCurve[0]
  const candidateDirection = candidateCurve.at(-1)! - candidateCurve[0]
  const directionScore = Math.max(
    0,
    1 - Math.abs(queryDirection - candidateDirection),
  )

  return {
    score: correlation * 0.55 + shapeScore * 0.35 + directionScore * 0.1,
    correlation,
    shapeScore,
    directionScore,
  }
}

function pushTopResult(results: MatchResult[], nextResult: MatchResult, limit: number) {
  results.push(nextResult)
  results.sort((left, right) => right.score - left.score)

  if (results.length > limit) {
    results.length = limit
  }
}

export function findTopMatches(
  market: StockSeries[],
  queryCurve: number[],
  windowSize: number,
  limit: number,
) {
  const results: MatchResult[] = []

  for (const series of market) {
    if (series.candles.length < windowSize) {
      continue
    }

    const closes = series.candles.map((candle) => candle.close)

    for (let startIndex = 0; startIndex <= closes.length - windowSize; startIndex += 1) {
      const windowCloses = closes.slice(startIndex, startIndex + windowSize)
      const normalizedClose = normalizeSeries(windowCloses)
      const metrics = scoreWindow(queryCurve, normalizedClose)

      const nextResult: MatchResult = {
        code: series.code,
        name: series.name,
        market: series.market,
        score: metrics.score,
        correlation: metrics.correlation,
        shapeScore: metrics.shapeScore,
        directionScore: metrics.directionScore,
        startIndex,
        endIndex: startIndex + windowSize - 1,
        candles: series.candles.slice(startIndex, startIndex + windowSize),
        normalizedClose,
      }

      if (
        results.length < limit ||
        nextResult.score > results[results.length - 1].score
      ) {
        pushTopResult(results, nextResult, limit)
      }
    }
  }

  return results
}
