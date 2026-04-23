export interface CurvePoint {
  x: number
  value: number
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value))

export function normalizeSeries(values: number[]) {
  if (!values.length) {
    return []
  }

  const min = Math.min(...values)
  const max = Math.max(...values)

  if (Math.abs(max - min) < 1e-9) {
    return values.map(() => 0.5)
  }

  return values.map((value) => (value - min) / (max - min))
}

export function sampleCurve(points: CurvePoint[], targetLength: number) {
  if (!points.length) {
    return []
  }

  const sorted = [...points].sort((left, right) => left.x - right.x)
  const result: number[] = []

  for (let index = 0; index < targetLength; index += 1) {
    const x = targetLength === 1 ? 0 : index / (targetLength - 1)
    let segmentIndex = 0

    while (
      segmentIndex < sorted.length - 2 &&
      x > sorted[segmentIndex + 1].x
    ) {
      segmentIndex += 1
    }

    const left = sorted[segmentIndex]
    const right = sorted[Math.min(segmentIndex + 1, sorted.length - 1)]

    if (right.x === left.x) {
      result.push(clamp(left.value))
      continue
    }

    const ratio = (x - left.x) / (right.x - left.x)
    result.push(clamp(left.value + (right.value - left.value) * ratio))
  }

  return result
}

export function curveToPoints(values: number[]) {
  if (!values.length) {
    return []
  }

  return values.map((value, index) => ({
    x: values.length === 1 ? 0 : index / (values.length - 1),
    value: clamp(value),
  }))
}

export function pointsToSvgPath(
  points: CurvePoint[],
  width: number,
  height: number,
) {
  if (!points.length) {
    return ''
  }

  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      const x = (point.x * width).toFixed(2)
      const y = ((1 - point.value) * height).toFixed(2)
      return `${command} ${x} ${y}`
    })
    .join(' ')
}
