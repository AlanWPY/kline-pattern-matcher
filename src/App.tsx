import { useEffect, useState, useTransition } from 'react'

import { KLineChart } from './components/KLineChart'
import { PatternPad } from './components/PatternPad'
import { sampleCurve } from './lib/curve'
import { findTopMatches } from './lib/matching'
import { buildTushareSnapshot } from './lib/tushare'
import type { MarketSnapshot, MatchResult, StockSeries, TushareConfig } from './lib/types'

const CURVE_SIZE = 48

const presetCurves = [
  {
    id: 'rebound',
    label: 'V 形反转',
    curve: sampleCurve(
      [
        { x: 0, value: 0.78 },
        { x: 0.18, value: 0.56 },
        { x: 0.34, value: 0.12 },
        { x: 0.58, value: 0.44 },
        { x: 1, value: 0.86 },
      ],
      CURVE_SIZE,
    ),
  },
  {
    id: 'breakout',
    label: '平台突破',
    curve: sampleCurve(
      [
        { x: 0, value: 0.4 },
        { x: 0.22, value: 0.54 },
        { x: 0.46, value: 0.49 },
        { x: 0.72, value: 0.52 },
        { x: 0.88, value: 0.84 },
        { x: 1, value: 0.92 },
      ],
      CURVE_SIZE,
    ),
  },
  {
    id: 'pullback',
    label: '回踩再起',
    curve: sampleCurve(
      [
        { x: 0, value: 0.28 },
        { x: 0.26, value: 0.76 },
        { x: 0.44, value: 0.58 },
        { x: 0.62, value: 0.43 },
        { x: 0.82, value: 0.72 },
        { x: 1, value: 0.9 },
      ],
      CURVE_SIZE,
    ),
  },
]

const defaultTushareConfig: TushareConfig = {
  token: '',
  proxyUrl: '',
  symbols: '600519.SH,300750.SZ,000858.SZ,601318.SH,000001.SZ',
  startDate: '20240101',
  endDate: '20260423',
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatDateSpan(result: MatchResult) {
  return `${result.candles[0].date} 至 ${result.candles.at(-1)?.date ?? ''}`
}

function App() {
  const [market, setMarket] = useState<StockSeries[]>([])
  const [curve, setCurve] = useState<number[]>(presetCurves[0].curve)
  const [results, setResults] = useState<MatchResult[]>([])
  const [windowSize, setWindowSize] = useState(48)
  const [resultCount, setResultCount] = useState(5)
  const [status, setStatus] = useState('正在加载内置样本市场...')
  const [dataMode, setDataMode] = useState<'sample' | 'tushare'>('sample')
  const [tushareConfig, setTushareConfig] = useState<TushareConfig>(() => {
    const saved = window.localStorage.getItem('kline-lab-tushare-config')

    if (!saved) {
      return defaultTushareConfig
    }

    try {
      return {
        ...defaultTushareConfig,
        ...JSON.parse(saved),
      }
    } catch {
      window.localStorage.removeItem('kline-lab-tushare-config')
      return defaultTushareConfig
    }
  })
  const [isPending, startTransition] = useTransition()
  const [snapshotMeta, setSnapshotMeta] = useState<MarketSnapshot | null>(null)

  useEffect(() => {
    window.localStorage.setItem(
      'kline-lab-tushare-config',
      JSON.stringify(tushareConfig),
    )
  }, [tushareConfig])

  async function loadSampleMarket() {
    setStatus('正在装载 A 股样本库...')

    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}sample-market-snapshot.json`,
      )

      if (!response.ok) {
        throw new Error(`样本读取失败：${response.status}`)
      }

      const snapshot = (await response.json()) as MarketSnapshot
      setMarket(snapshot.symbols)
      setSnapshotMeta(snapshot)
      setStatus(`样本市场已就绪，当前股票池 ${snapshot.symbols.length} 只。`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '样本市场加载失败')
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSampleMarket()
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [])

  const handlePresetClick = (presetCurve: number[]) => {
    setCurve(presetCurve)
  }

  const handleRunMatch = () => {
    if (!market.length) {
      setStatus('当前没有可匹配的股票池，请先加载样本或同步 Tushare。')
      return
    }

    setStatus('正在扫描形态相似窗口...')

    window.setTimeout(() => {
      const nextResults = findTopMatches(market, curve, windowSize, resultCount)

      startTransition(() => {
        setResults(nextResults)
        setStatus(
          nextResults.length
            ? `已完成匹配，共返回 ${nextResults.length} 条结果。`
            : '未找到足够相似的窗口，请更换曲线或扩大股票池。',
        )
      })
    }, 16)
  }

  const handleSyncTushare = async () => {
    setStatus('正在请求 Tushare 数据...')

    try {
      const snapshot = await buildTushareSnapshot(tushareConfig)

      if (!snapshot.symbols.length) {
        throw new Error('Tushare 返回为空，请检查股票代码或日期区间。')
      }

      setMarket(snapshot.symbols)
      setSnapshotMeta(snapshot)
      setDataMode('tushare')
      setStatus(`Tushare 股票池已刷新，共 ${snapshot.symbols.length} 只。`)
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message}。公开静态站点若出现跨域失败，请改为样本模式或配置代理 URL。`
          : 'Tushare 数据请求失败',
      )
    }
  }

  return (
    <div className="app-shell">
      <header className="hero-shell">
        <div className="hero-shell__copy">
          <p className="eyebrow">A-Share Pattern Atlas</p>
          <h1>手绘曲线匹配 A 股 K 线的静态化研究工具</h1>
          <p className="hero-shell__lead">
            先画走势，再扫描股票池，按相似度输出候选 K 线。站点默认内置真实样本，
            同时保留 Tushare Token 配置入口，适合课程演示、GitHub 展示和后续扩展。
          </p>
        </div>
        <div className="hero-shell__stats">
          <div className="stat-card">
            <span>股票池</span>
            <strong>{market.length}</strong>
          </div>
          <div className="stat-card">
            <span>采样窗口</span>
            <strong>{windowSize} 天</strong>
          </div>
          <div className="stat-card">
            <span>返回结果</span>
            <strong>{resultCount} 条</strong>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="control-panel">
          <section className="panel-card">
            <div className="panel-card__header">
              <h2>数据通道</h2>
              <span className="chip">{dataMode === 'sample' ? '样本库' : 'Tushare'}</span>
            </div>
            <p className="muted">
              默认内置真实 A 股样本，公开静态部署可以直接演示；若部署了代理，也可切到
              Tushare 同步自定义股票池。
            </p>
            <div className="action-row">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setDataMode('sample')
                  void loadSampleMarket()
                }}
              >
                载入样本市场
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleSyncTushare}
              >
                同步 Tushare
              </button>
            </div>
            <label className="field">
              <span>Tushare Token</span>
              <input
                type="password"
                value={tushareConfig.token}
                placeholder="输入你自己的 Tushare Token"
                onChange={(event) =>
                  setTushareConfig((current) => ({
                    ...current,
                    token: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>代理 URL</span>
              <input
                type="text"
                value={tushareConfig.proxyUrl}
                placeholder="可留空；静态站点若跨域，请填写 /api/tushare 或自建代理"
                onChange={(event) =>
                  setTushareConfig((current) => ({
                    ...current,
                    proxyUrl: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>股票代码</span>
              <textarea
                rows={3}
                value={tushareConfig.symbols}
                onChange={(event) =>
                  setTushareConfig((current) => ({
                    ...current,
                    symbols: event.target.value,
                  }))
                }
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>开始日期</span>
                <input
                  type="text"
                  value={tushareConfig.startDate}
                  onChange={(event) =>
                    setTushareConfig((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>结束日期</span>
                <input
                  type="text"
                  value={tushareConfig.endDate}
                  onChange={(event) =>
                    setTushareConfig((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>匹配参数</h2>
              <span className="chip">多因子评分</span>
            </div>
            <label className="field">
              <span>匹配窗口</span>
              <input
                type="range"
                min="20"
                max="60"
                step="4"
                value={windowSize}
                onChange={(event) => setWindowSize(Number(event.target.value))}
              />
              <small>{windowSize} 个交易日</small>
            </label>
            <label className="field">
              <span>返回条数</span>
              <input
                type="range"
                min="3"
                max="10"
                value={resultCount}
                onChange={(event) => setResultCount(Number(event.target.value))}
              />
              <small>{resultCount} 条，按相似度降序展示</small>
            </label>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={handleRunMatch}>
                开始匹配
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setCurve(presetCurves[0].curve)}
              >
                重置画板
              </button>
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>预设形态</h2>
              <span className="chip">快速起笔</span>
            </div>
            <div className="preset-grid">
              {presetCurves.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="preset-chip"
                  onClick={() => handlePresetClick(preset.curve)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>运行状态</h2>
              <span className="chip">{isPending ? '计算中' : '待命'}</span>
            </div>
            <p className="status-copy">{status}</p>
            {snapshotMeta ? (
              <dl className="meta-list">
                <div>
                  <dt>数据源</dt>
                  <dd>{snapshotMeta.source}</dd>
                </div>
                <div>
                  <dt>生成时间</dt>
                  <dd>{snapshotMeta.generatedAt.slice(0, 19).replace('T', ' ')}</dd>
                </div>
              </dl>
            ) : null}
          </section>
        </aside>

        <section className="canvas-panel">
          <div className="panel-card panel-card--large">
            <div className="panel-card__header">
              <h2>手绘走势</h2>
              <span className="chip">归一化曲线</span>
            </div>
            <PatternPad
              curve={curve}
              sampleSize={CURVE_SIZE}
              onCurveChange={setCurve}
            />
            <p className="muted">
              匹配器会对你绘制的曲线与股票收盘价窗口同时做归一化，然后综合相关系数、
              形态误差和方向一致性打分。
            </p>
          </div>

          <div className="panel-card panel-card--large">
            <div className="panel-card__header">
              <h2>结果面板</h2>
              <span className="chip">可滚动</span>
            </div>
            <div className="results-scroller">
              {results.length ? (
                results.map((result, index) => (
                  <article key={`${result.code}-${result.startIndex}`} className="result-card">
                    <div className="result-card__header">
                      <div>
                        <p className="result-card__rank">TOP {index + 1}</p>
                        <h3>
                          {result.name} <span>{result.code}</span>
                        </h3>
                        <p className="muted">{formatDateSpan(result)}</p>
                      </div>
                      <div className="score-badge">{formatPercent(result.score)}</div>
                    </div>
                    <div className="score-grid">
                      <div>
                        <span>相关系数</span>
                        <strong>{formatPercent(result.correlation)}</strong>
                      </div>
                      <div>
                        <span>形态贴合</span>
                        <strong>{formatPercent(result.shapeScore)}</strong>
                      </div>
                      <div>
                        <span>方向一致</span>
                        <strong>{formatPercent(result.directionScore)}</strong>
                      </div>
                    </div>
                    <KLineChart candles={result.candles} />
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  点击“开始匹配”后，这里会按相似度从高到低展示 K 线结果。
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
