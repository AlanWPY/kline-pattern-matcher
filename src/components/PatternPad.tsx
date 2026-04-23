import { useEffect, useRef, useState } from 'react'

import {
  curveToPoints,
  pointsToSvgPath,
  sampleCurve,
  type CurvePoint,
} from '../lib/curve'

const PAD_WIDTH = 720
const PAD_HEIGHT = 280

interface PatternPadProps {
  curve: number[]
  sampleSize: number
  onCurveChange: (curve: number[]) => void
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function shouldAppendPoint(previous: CurvePoint | undefined, next: CurvePoint) {
  if (!previous) {
    return true
  }

  return (
    Math.abs(previous.x - next.x) > 0.01 ||
    Math.abs(previous.value - next.value) > 0.01
  )
}

export function PatternPad({
  curve,
  sampleSize,
  onCurveChange,
}: PatternPadProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const skipExternalSyncRef = useRef(false)
  const [points, setPoints] = useState<CurvePoint[]>(() => curveToPoints(curve))
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false
      return
    }

    setPoints(curveToPoints(curve))
  }, [curve])

  useEffect(() => {
    if (!points.length) {
      return
    }

    skipExternalSyncRef.current = true
    onCurveChange(sampleCurve(points, sampleSize))
  }, [onCurveChange, points, sampleSize])

  const gridLines = Array.from({ length: 7 }, (_, index) => ({
    x1: (PAD_WIDTH / 6) * index,
    y1: 0,
    x2: (PAD_WIDTH / 6) * index,
    y2: PAD_HEIGHT,
  }))

  const horizontalLines = Array.from({ length: 5 }, (_, index) => ({
    x1: 0,
    y1: (PAD_HEIGHT / 4) * index,
    x2: PAD_WIDTH,
    y2: (PAD_HEIGHT / 4) * index,
  }))

  const path = pointsToSvgPath(points, PAD_WIDTH, PAD_HEIGHT)

  const locatePoint = (clientX: number, clientY: number) => {
    const rect = frameRef.current?.getBoundingClientRect()

    if (!rect) {
      return null
    }

    return {
      x: clamp((clientX - rect.left) / rect.width),
      value: clamp(1 - (clientY - rect.top) / rect.height),
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const nextPoint = locatePoint(event.clientX, event.clientY)

    if (!nextPoint) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDrawing(true)
    setPoints([nextPoint])
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing) {
      return
    }

    const nextPoint = locatePoint(event.clientX, event.clientY)

    if (!nextPoint) {
      return
    }

    setPoints((currentPoints) => {
      const nextPoints = [...currentPoints]
      const previousPoint = nextPoints[nextPoints.length - 1]

      if (!shouldAppendPoint(previousPoint, nextPoint)) {
        return currentPoints
      }

      nextPoints.push(nextPoint)
      nextPoints.sort((left, right) => left.x - right.x)
      return nextPoints
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setIsDrawing(false)
  }

  return (
    <div className="pattern-pad">
      <div
        ref={frameRef}
        className={`pattern-pad__frame${isDrawing ? ' is-drawing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        role="presentation"
      >
        <svg
          viewBox={`0 0 ${PAD_WIDTH} ${PAD_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g className="pattern-pad__grid">
            {gridLines.map((line) => (
              <line key={`${line.x1}-${line.y1}`} {...line} />
            ))}
            {horizontalLines.map((line) => (
              <line key={`${line.x1}-${line.y1}`} {...line} />
            ))}
          </g>
          {path ? <path className="pattern-pad__path" d={path} /> : null}
        </svg>
        {!path ? (
          <div className="pattern-pad__hint">
            按住鼠标拖拽，绘制你想匹配的价格形态
          </div>
        ) : null}
      </div>
      <div className="pattern-pad__legend">
        <span>左侧低位</span>
        <span>右侧高位</span>
      </div>
    </div>
  )
}
