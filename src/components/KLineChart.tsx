import { useEffect, useRef } from 'react'

import type { Candle } from '../lib/types'

interface KLineChartProps {
  candles: Candle[]
}

function formatPrice(value: number) {
  return value.toFixed(2)
}

export function KLineChart({ candles }: KLineChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let chart: import('echarts').EChartsType | undefined
    let resizeObserver: ResizeObserver | undefined
    let active = true

    async function mountChart() {
      if (!chartRef.current || !candles.length) {
        return
      }

      const echarts = await import('echarts')

      if (!active || !chartRef.current) {
        return
      }

      chart = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
      })

      const option = {
        animation: false,
        grid: {
          left: 52,
          right: 16,
          top: 18,
          bottom: 34,
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
          },
          backgroundColor: 'rgba(9, 16, 28, 0.92)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          textStyle: {
            color: '#f1f5f9',
            fontFamily: '"Noto Sans SC", sans-serif',
          },
          formatter: (params: Array<{ dataIndex: number }>) => {
            const candle = candles[params[0].dataIndex]
            return [
              candle.date,
              `开盘 ${formatPrice(candle.open)}`,
              `收盘 ${formatPrice(candle.close)}`,
              `最高 ${formatPrice(candle.high)}`,
              `最低 ${formatPrice(candle.low)}`,
              `成交量 ${candle.volume.toLocaleString()}`,
            ].join('<br/>')
          },
        },
        xAxis: {
          type: 'category',
          data: candles.map((candle) => candle.date.slice(5)),
          boundaryGap: true,
          axisLine: {
            lineStyle: { color: '#7c8ca3' },
          },
          axisLabel: {
            color: '#5d6b83',
            fontSize: 11,
          },
        },
        yAxis: {
          scale: true,
          axisLine: {
            show: false,
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(61, 84, 112, 0.14)',
            },
          },
          axisLabel: {
            color: '#5d6b83',
            formatter: (value: number) => value.toFixed(0),
          },
        },
        series: [
          {
            type: 'candlestick',
            data: candles.map((candle) => [
              candle.open,
              candle.close,
              candle.low,
              candle.high,
            ]),
            itemStyle: {
              color: '#c45347',
              color0: '#0c8e74',
              borderColor: '#c45347',
              borderColor0: '#0c8e74',
            },
          },
          {
            type: 'line',
            data: candles.map((candle) => candle.close),
            smooth: 0.2,
            symbol: 'none',
            lineStyle: {
              width: 1,
              color: '#294f7a',
            },
          },
        ],
      }

      chart.setOption(option)

      resizeObserver = new ResizeObserver(() => {
        chart?.resize()
      })

      resizeObserver.observe(chartRef.current)
    }

    void mountChart()

    return () => {
      active = false
      resizeObserver?.disconnect()
      chart?.dispose()
    }
  }, [candles])

  return <div ref={chartRef} className="kline-chart" />
}
