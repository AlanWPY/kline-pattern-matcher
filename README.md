# K线形态匹配工具

一个面向金融课程展示的前端项目：用户在网页中手绘一条走势曲线，系统会在股票池里扫描最相似的 K 线窗口，并按相似度从高到低返回结果。

## 核心功能

- 手绘归一化曲线，支持预设形态快速起笔
- 对股票池做滑动窗口扫描，输出相似度、相关系数、形态贴合度、方向一致性
- 用专业 K 线图展示匹配结果，包含横纵坐标与鼠标悬浮信息
- 默认内置真实 A 股样本库，公开静态部署后可直接演示
- 预留 Tushare Token、代理 URL、股票代码与日期区间配置
- 结果区支持滚动展示，适合一次返回多条匹配结果

## 技术架构

- 前端：React 19 + TypeScript + Vite
- 图表：ECharts，按需在结果卡片中延迟加载
- 匹配逻辑：浏览器端执行，无需传统后端服务器
- 样本数据：构建期写入 `public/sample-market-snapshot.json`
- 可选实时数据：通过 Tushare API 获取；若公开部署在纯静态站点上，需要额外代理来规避浏览器跨域限制

## 为什么这样设计

Tushare 官方接口并不适合 GitHub Pages 这类纯静态网页直接在浏览器中调用，因此项目采用了双通道方案：

1. 演示通道：直接使用仓库内置的真实样本数据，站点上传后就能运行。
2. 扩展通道：保留 Tushare 配置入口；如果后续部署到支持无服务器函数的平台，或者自行提供代理 URL，就可以同步自定义股票池。

这意味着项目不需要自建传统后端服务器，但仍然兼顾了公开展示与后续扩展能力。

## 本地运行

```bash
npm install
npm run dev
```

构建生产版本：

```bash
npm run build
```

## 样本数据更新

项目提供了一个脚本从公开行情源生成演示用样本库：

```bash
python scripts/build_sample_market.py
```

输出文件：

- `public/sample-market-snapshot.json`

## GitHub 发布

仓库已经适配 GitHub Pages 自动部署。将整个项目上传到 GitHub 后：

1. 在仓库设置中进入 `Settings -> Pages`
2. 将 `Source` 设为 `GitHub Actions`
3. 推送代码到默认分支
4. 等待 Actions 中的 `Deploy static site to GitHub Pages` 工作流执行完成
5. GitHub 会自动生成公开访问地址

## 需要实时 Tushare 时

- 纯静态 GitHub Pages 适合演示样本模式
- 如果要让用户在公网环境下稳定使用自己的 Tushare Token，建议把同一套前端部署到 Vercel / Netlify，并额外提供一个无服务器代理接口

## Agent Skill 安装与使用

本仓库现在同时包含一个可安装的 Codex Skill：

- Skill 路径：`skills/kline-pattern-matcher`
- 功能：通过手绘曲线或指定股票日期区间，匹配相似 K 线走势，并生成包含股票代码、企业名称、K线图和成交量柱状图的 PNG 图片。
- 默认数据：`skills/kline-pattern-matcher/assets/sample-market-snapshot.json`，离线可运行，不依赖 Tushare Token。

安装方式：

```bash
git clone https://github.com/AlanWPY/kline-pattern-matcher.git
```

然后将 `skills/kline-pattern-matcher` 复制到 Codex 或兼容 Agent 的 skills 目录中，或者使用支持 GitHub skill 路径的 installer 直接安装该目录。

常用命令：

```bash
# 打开本地绘图页面，提交后生成 outputs/query_curve.json
python skills/kline-pattern-matcher/scripts/kline_match.py draw --top-n 5

# 使用手绘曲线匹配相似 K 线
python skills/kline-pattern-matcher/scripts/kline_match.py match-curve --curve-json skills/kline-pattern-matcher/outputs/query_curve.json --top-n 5

# 使用指定股票在指定日期范围内的走势匹配其他股票
python skills/kline-pattern-matcher/scripts/kline_match.py match-reference --code 600519 --start-date 2025-10-01 --end-date 2025-12-31 --top-n 5
```

输出文件位于 `skills/kline-pattern-matcher/outputs/`，其中 `match_summary.json` 保存匹配摘要，`match_*.png` 是 Agent 可直接返回给用户的结果图。

## 目录说明

- `src/App.tsx`：主界面与交互流程
- `src/components/PatternPad.tsx`：手绘曲线画板
- `src/components/KLineChart.tsx`：K 线结果图表
- `src/lib/matching.ts`：相似度匹配算法
- `src/lib/tushare.ts`：Tushare 数据接入封装
- `scripts/build_sample_market.py`：演示样本生成脚本
- `.github/workflows/deploy.yml`：GitHub Pages 自动部署工作流
