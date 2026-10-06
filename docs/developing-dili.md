# 如何开发 dili（地理过程教学 App）

本文是 **dili** 的开发指导：技术栈、开源资源目录、架构约定，以及「新增一课 / 一层 / 一种贴图」的步骤。  
Agent 与贡献者引入**新依赖、新数据、新贴图、新外部 API** 时，**必须同步更新本文「技术栈」与「开源资源」两节**（见文末清单；规则见 `.cursor/rules/docs-sync.mdc`）。

---

## 1. 产品定位

- **不是**通用 GIS / 不是排课工具；是高中地理**过程动画**与课堂示意。
- 教材导航：湘教版（2019），目录 `content/curriculum/xiangjiao.json`。
- 两条主线：
  - **GeoLab（地球）**：可插拔图层讲全球尺度过程与专题。
  - **DemoLab（演示课）**：按课步的剖面 / 微场景 / 地图 / 图表示意。

国界与政区仅为课堂示意，带 `disclaimer`，不作主权或划界依据。

---

## 2. 技术栈

### 应用壳

| 用途 | 选型 | 备注 |
|------|------|------|
| UI | Vue 3 + Vue Router + Pinia | Composition API |
| 构建 | Vite 6 + TypeScript + `vue-tsc` | 路径别名 `@` → `src`，`@content` → `content` |
| 组件库 | Element Plus + `@element-plus/icons-vue` | 壳层控件 |
| 桌面 | Tauri 2（`@tauri-apps/api` / CLI） | `npm run tauri dev` / `build` |

### 图形与可视化（按场景选用，勿混用）

| 场景 | 选型 |
|------|------|
| 3D 地球、气压带、洋流、直射点等 | Three.js + `three-globe`（`GlobeHost` + 可插拔图层） |
| 过程时间线 / 锋面剖面 / 火山成岩等微场景 | Three.js 自建场景（可 OrbitControls） |
| 循环图式、类型卡片、地带谱等 2D 示意 | D3 / 手写 SVG |
| 区域填色、线路、一带一路、产业转移 | MapLibre GL |
| 温湿柱、产业结构、时间序列 | Apache ECharts |
| 三角剖分（国界等） | earcut |

### 数据与构建辅助

| 用途 | 选型 |
|------|------|
| TopoJSON → 教学国界包 | `topojson-client` + `world-atlas` 衍生数据 |
| ISO → 中文国名 | `i18n-iso-countries` |
| 气象图标（线稿 SVG） | `@meteocons/svg` |

运行：Node.js 18+；桌面端另需 Rust（rustup）。

```bash
npm install
npm run dev            # http://localhost:1430
npm run build:countries  # 重建 public/geo/countries-teach.json
npm run tauri dev
```

---

## 3. 开源资源与外部服务（须登记）

凡可离线打包的资源放 `public/`，并尽量附 `disclaimer.json` 或字段 `disclaimer` / `source` / `license`。

### 3.1 本地贴图 `public/textures/`

| 文件 | 用途 | 许可 / 来源说明 |
|------|------|----------------|
| `earth-blue-marble.jpg` | 地球日景底图 | 教学用卫星真彩底图（NASA Blue Marble 系公开影像常见衍生）；课堂示意 |
| `earth-night.jpg` | 夜光 / 昼夜对照 | 教学用夜光示意贴图 |
| `earth-topology.png` | 地形 bump | 教学用起伏示意 |
| `sun-hmi.jpg` | 太阳表面 | NASA SDO **HMI Continuum**，公有领域 |
| `sun-disclaimer.json` | 太阳贴图声明 | 非观测预报 |
| `rocks/lava-color.jpg` | 熔岩观感 | ambientCG **Lava001**，**CC0** |
| `rocks/igneous-color.jpg` | 岩浆岩 | ambientCG **Rock023**，**CC0** |
| `rocks/sedimentary-color.jpg` | 沉积岩（类型卡） | ambientCG **Rock035**，**CC0** |
| `rocks/metamorphic-color.jpg` | 变质岩 | ambientCG **Rock048**，**CC0** |
| `rocks/grass-color.jpg` / `grass-normal.jpg` | 切面草地 | ambientCG **Grass001**，**CC0** |
| `rocks/sand-color.jpg` | 切面浅色沉积层 | ambientCG **Ground033**，**CC0** |
| `rocks/strata-color.jpg` / `strata-normal.jpg` | 切面层理沉积岩 | ambientCG **Rock029**，**CC0** |
| `rocks/gneiss-color.jpg` | 切面变质岩 | ambientCG **Rock051**，**CC0** |
| `rocks/disclaimer.json` | 岩石贴图声明 | 标明 CC0 与「非岩性鉴定」 |
| `weather/ground-color.jpg` | 锋面/气旋地面 | ambientCG **Ground037**，**CC0** |
| `weather/cloud-soft.png` | 锋面云层 | 教学用软云（程序生成） |
| `weather/disclaimer.json` | 天气贴图声明 | 非预报依据 |

| `landcover/aerial-grass.jpg` | 俯视草地 | Poly Haven **aerial_grass_rock**，**CC0** |
| `landcover/aerial-rocks.jpg` | 俯视山地 | Poly Haven **aerial_rocks_02**，**CC0** |
| `landcover/soil-color.jpg` | 河岸 / 含水层示意 | ambientCG **Ground003**，**CC0** |
| `landcover/snow-color.jpg` | 积雪 | ambientCG **Snow006**，**CC0** |
| `landcover/ice-color.jpg` | 冰川 | ambientCG **Ice002**，**CC0** |
| `landcover/water-color.jpg` | 河湖水面示意 | Ice002 色相偏移，**CC0** |
| `landcover/disclaimer.json` | 陆地水体贴图声明 | 标明 CC0 与「非实测水文」 |

岩石贴图下载站：[ambientCG](https://ambientcg.com/)（优先 1K Color，体积可控）。Poly Haven 俯视地表：[polyhaven.com/textures](https://polyhaven.com/textures)（**CC0**）。

### 3.2 本地地理数据 `public/geo/`

| 文件 | 用途 | 来源要点 |
|------|------|----------|
| `countries-110m-topo.json` | 构建输入 | world-atlas / Natural Earth 衍生 |
| `countries-teach.json` | 教学国界（台湾并入 CN 等） | `npm run build:countries`；含 `disclaimer` |
| `cities-teach.json` | 城市注记 | 自维护教学点位 |
| `rivers-teach.json` | 河流示意 | 自维护 |
| `plates-teach.json` | 板块示意 | 自维护 |
| `ocean-currents-teach.json` | 洋流路径示意 | 自维护 + `disclaimer` |

### 3.3 联网服务（可选层，失败须可降级）

| 服务 | 用途 | 入口 |
|------|------|------|
| [NASA GIBS](https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs) WMS | SST / 叶绿素 / 积雪海冰 / 降水 / **CERES 入射太阳辐射** 等专题 | `src/engine/globe/gibs.ts` |
| [Open-Meteo](https://open-meteo.com/) | 城市天气、稀疏格点风场 | `geoScene` / `windfield` 图层 |
| NASA GHRSST（经 GIBS） | 海表温度说明文案 | GeoLab UI |

### 3.4 内容与课表

| 路径 | 用途 |
|------|------|
| `content/curriculum/xiangjiao.json` | 湘教版目录 |
| `content/atmosphere/` 等 | 单课课步、探究题、用语 |
| `src/curriculum/demoRegistry.ts` | DemoLab 登记 |
| `src/curriculum/layerBindings.ts` | 教程 ↔ 地球图层绑定 |

### 3.5 推荐外部资源库（引入前先评估许可）

| 类型 | 推荐 | 注意 |
|------|------|------|
| PBR / 岩石 / 地面贴图 | ambientCG（CC0） | 1K 够用；登记 `disclaimer.json` |
| 矢量国界基底 | Natural Earth / world-atlas | 必须再加工成 `*-teach.json` |
| 卫星底图 | NASA Visible Earth / Blue Marble 公开影像 | 注明教学示意；体积控制 |
| 图标 | `@meteocons/svg` 或自绘 | 勿抓未授权网图 |
| 禁止默认 | 无授权商用贴图、未标注版权的网图爬取 | — |

**原则：能用自绘 / 粒子 / 滤镜讲清的，不必堆贴图；需要真实质感时，优先 CC0 / 公有领域，并离线打包。**

---

## 4. 架构速览

```
content/                 教材与课步 JSON
src/curriculum/          目录查询、demoRegistry、layerBindings
src/engine/globe/        GlobeHost + layers/*（可插拔）
src/demos/<id>/          DemoLab 各课画布
src/demos/theme.ts       DemoHex / Demo3 统一色板
src/views/Course|GeoLab|DemoLab|layout/
src/stores/              场景状态
public/geo|textures/     教学数据与贴图
src-tauri/               桌面壳
```

- 地球能力 → **图层**，禁止往 `GlobeHost` 堆业务几何（见 `globe-layers.mdc`）。
- 课与图层 → **绑定表**，禁止页面里硬编码一长串 `layers.xxx = true`。
- Demo 主题 → `theme.ts` + CSS `--demo-*`，禁止示意层散落硬编码色。

---

## 5. 新增 DemoLab 一课

1. `xiangjiao.json` 中教程 `status` 可配合上线节奏。
2. `src/curriculum/demoRegistry.ts` 登记：`tutorialId`、`engine`、`steps`、`status`、`load`。
3. `status: 'ready'` → 实现 `src/demos/<id>/index.vue`。
4. `status: 'deferred'` → 走 `DemoPlaceholder`。
5. 路由：`/demo/:tutorialId`。

### 引擎选择

| `engine` | 何时用 |
|----------|--------|
| `three` | 纯 3D / 地球内嵌 |
| `d3` | 纯 2D 示意 |
| `maplibre` | 区域地图叙事 |
| `echarts` | 统计图 |
| `mixed` | 多课步混用（如岩石：过程 Three + 类型/循环 D3） |

细则（箭头、字号、动画）：`.cursor/rules/demo-lab.mdc`。

### 过程类课（推荐范式：岩石圈物质循环）

适合「火山喷发 → 成岩 → 风化 → 变质 → 重熔」这类**有时间顺序的地理过程**：

1. **课步拆分**：过程（Three 时间线） / 类型（D3 + 贴图） / 循环（D3 带箭头巡游）。
2. **过程步**：自建 Three 微场景 + `progress ∈ [0,1]` 时间轴；`smoothstep` 控制可见度与缩放；粒子/熔岩光服务语义，可 scrub、可暂停。
3. **运动方向**：线 / 转化边必须有**可见实心箭头** + 缓慢循环动画。
4. **贴图**：需要质感时用 ambientCG 等 CC0，放 `public/textures/...`，写 `disclaimer.json`；UI 角标注明「示意 · 非鉴定」。
5. **勿**用干巴静态框图或仅虚线滚动冒充过程。

样板代码：`src/demos/rock-cycle/index.vue`（成岩过程）、`src/demos/landform-change/index.vue`（褶皱/断层内力）、`src/demos/weather-systems/index.vue`（锋面）。

---

## 6. 新增地球图层

按 `.cursor/rules/globe-layers.mdc` 顺序：

1. `types.ts` → `LayerId`
2. `catalog.ts` → 文案与默认开关
3. `layers/<id>.ts` → 实现 `GlobeLayer`
4. `host.ts` → `factories` 注册（`EarthLayer` 最先）
5. 需要时：`layerConflicts.ts` 互斥组；`layerBindings.ts` 绑课

本地教学 GeoJSON 优先 `public/geo/*-teach.json`。

---

## 7. 主题与观感

- 数据源：`src/demos/theme.ts`（`DemoHex` 字符串 / `Demo3` 整数）。
- CSS：`src/styles/global.css` 的 `--demo-*`、壳层「墨蓝观测台」主色。
- 画布字号宜小（角标约 10px，要素名 10～12px）。

---

## 8. 引入新内容时的同步清单（强制）

新增或更换下列任一内容时，**同一变更内**更新本文对应表格，并视情况改规则：

- [ ] npm 依赖 / 图形库 → §2 技术栈
- [ ] 贴图、音频、模型 → §3.1，并补 `disclaimer` / 许可
- [ ] `public/geo` 或构建脚本数据源 → §3.2
- [ ] 新外部 API / WMS → §3.3（注明降级策略）
- [ ] 新推荐资源站 → §3.5
- [ ] 新开发范式（如「过程时间线」） → §5 或独立小节 + `demo-lab.mdc`

不擅自 `git commit` / `push`（除非用户明确要求）。

---

## 9. 相关规则索引

| 文件 | 内容 |
|------|------|
| `.cursor/rules/dili-core.mdc` | 中文、争议底图、总原则 |
| `.cursor/rules/demo-lab.mdc` | DemoLab 栈、箭头、动画、贴图 |
| `.cursor/rules/globe-layers.mdc` | 可插拔图层 |
| `.cursor/rules/curriculum-bindings.mdc` | 课 ↔ 图层绑定 |
| `.cursor/rules/docs-sync.mdc` | 本教程与资源表同步义务 |
