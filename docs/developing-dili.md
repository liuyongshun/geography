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
| 3D 地球、气压带、洋流、ENSO/沃克环流、直射点等 | Three.js + `three-globe`（`GlobeHost` + 可插拔图层） |
| 过程时间线 / 锋面剖面 / 火山成岩等微场景 | Three.js 自建场景（可 OrbitControls） |
| 银河系棒旋示意点云 | `threejs-galaxy-shader`（MIT；嵌入现有 scene/composer，叠教学标注） |
| 循环图式、类型卡片、地带谱等 2D 示意 | D3 / 手写 SVG |
| 区域填色、线路、一带一路、产业转移 | MapLibre GL（按需再装 `maplibre-gl`；引擎标签已预留） |
| 温湿柱、产业结构、时间序列 | Apache ECharts |
| 三角剖分（国界等） | earcut |

### 数据与构建辅助

| 用途 | 选型 |
|------|------|
| TopoJSON → 教学国界包 | `topojson-client` + `world-atlas` 衍生数据 |
| ISO → 中文国名 | `i18n-iso-countries` |
| 气象图标（线稿 SVG） | `@meteocons/svg` |

运行：Node.js 18+；桌面端另需 Rust（rustup）与 MSVC C++ 构建工具。**默认启动桌面端**。

```bash
npm install
npm run tauri dev        # 默认：桌面窗口（自动起/复用 Vite :1430）
npm run build:portable   # Windows 便携版 zip（解压即用，不写注册表；需 MSVC 环境）
npm run tauri build      # 安装包（NSIS/MSI，可选）
npm run build:countries  # 重建 public/geo/countries-teach.json
npm run build:stars      # 重建 public/astro/bright-stars.json
npm run build:galaxy     # 重建 public/astro/milky-way-arms-teach.json
# 仅调试前端时才：npm run dev
```

便携包输出：`dist-portable/地理过程-<version>-windows-portable.zip`。目标机需已有 WebView2（Win10/11 多数自带）。

---

## 3. 开源资源与外部服务（须登记）

凡可离线打包的资源放 `public/`，并尽量附 `disclaimer.json` 或字段 `disclaimer` / `source` / `license`。

### 3.1 本地贴图 `public/textures/`

| 文件 | 用途 | 许可 / 来源说明 |
|------|------|----------------|
| `earth-blue-marble.jpg` | 地球日景底图 | 教学用卫星真彩底图（NASA Blue Marble 系公开影像常见衍生）；课堂示意 |
| `earth-night.jpg` | 夜光 / 昼夜对照 | 教学用夜光示意贴图 |
| `earth-topology.png` | 地形 bump | 教学用起伏示意 |
| `earth-period.jpg` | 恒星日/太阳日、地转偏向、时区、公转/五带示意球 | NASA Visible Earth **land_shallow_topo_2048**（陆地浅海地形真彩），公有领域；见 `earth-period-disclaimer.json` |
| `earth-period-disclaimer.json` | 上项声明 | 课堂示意 · 非测绘依据 |
| `sun-realistic.webp` | 太阳日面 billboard | 透明底写实日面；WebP 保留 alpha；见 `sun-disclaimer.json` |
| `sun-disclaimer.json` | 太阳贴图声明 | 非观测预报 |
| `space/milky-way.jpg` | 太阳系课全天银道光带 | NASA SVS **Deep Star Maps** equirectangular（课堂打包 **4K**，源为 8K），公有领域；叠 BSC5 亮星光晕与密星尘 |
| `geology/volcano-cutaway.jpg` / `landform-cutaway.jpg` / `wind-cutaway.png` | 岩浆、连续地貌与风蚀风积剖面课底图 | 项目内 image_gen 生成的教学插画；非特定真实地点，见 `geology/disclaimer.json` |
| `space/milky-way-disk.jpg` | （可选）银河系俯视参考图 | NASA/JPL **PIA10748** 公有领域（`npm run build:galaxy-disk`）；课堂主视觉已改用 `threejs-galaxy-shader`｜勿用银心红外特写 |
| `space/disclaimer.json` | 星空贴图声明 | 非导航依据；可选升级 [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851) |
| `astro/bright-stars.json` | 亮星星表（锐化+星名） | Yale **BSC5** 转换（`npm run build:stars`），公有领域目录数据 |
| `astro/milky-way-arms-teach.json` | 银河系旋臂教学迹线 | Reid et al. 2019 等简化（`npm run build:galaxy`），课堂示意 |
| `astro/disclaimer.json` | 星表 / 旋臂声明 | 课堂示意、非观测 |
| `textures/planets/*.jpg` | 八大行星表面 | Solar System Scope 等开源教学贴图（CC-BY）；地球用 Blue Marble |
| `textures/planets/saturn_ring.png` | 土星光环径向剖面 | 条带贴图经 `RingGeometry` UV 重映射（U=半径）完整显示；课堂示意 |
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
| `weather/cloud-realistic.webp` | 大气受热过程的云层 | 写实教学云，透明底 WebP；见 `weather/disclaimer.json` |
| `weather/disclaimer.json` | 天气贴图声明 | 非预报依据 |

| `landcover/aerial-grass.jpg` | 俯视草地 | Poly Haven **aerial_grass_rock**，**CC0** |
| `landcover/aerial-rocks.jpg` | 俯视山地 | Poly Haven **aerial_rocks_02**，**CC0** |
| `landcover/soil-color.jpg` | 河岸 / 含水层示意 | ambientCG **Ground003**，**CC0** |
| `landcover/snow-color.jpg` | 积雪 | ambientCG **Snow006**，**CC0** |
| `landcover/ice-color.jpg` | 冰川 | ambientCG **Ice002**，**CC0** |
| `landcover/water-color.jpg` | 河湖水面示意 | Ice002 色相偏移，**CC0** |
| `landcover/canopy-aerial.jpg` | 垂直带俯视林冠 | 本课生成的示意，非实拍 |
| `landcover/meadow-aerial.jpg` | 垂直带俯视草甸 | 本课生成的示意，非实拍 |
| `landcover/scree-aerial.jpg` | 垂直带俯视碎石 | 本课生成的示意，非实拍 |
| `landcover/snowfield-aerial.jpg` | 垂直带俯视雪坡 | 本课生成的示意，非实拍 |
| `landcover/vertical-alpine-{wide,near,valley}.jpg` | 垂直带三个摄影式视角 | 本课生成的同一虚构山系，非实拍、非正射 |
| `landcover/disclaimer.json` | 陆地水体贴图声明 | 标明 CC0、生成图与「非实测」 |

岩石贴图下载站：[ambientCG](https://ambientcg.com/)（优先 1K Color，体积可控）。Poly Haven 俯视地表：[polyhaven.com/textures](https://polyhaven.com/textures)（**CC0**）。

### 3.1.1 体积卫生（打包前）

| 目标 | 做法 |
|------|------|
| 本机磁盘 | `dist/`、`.cache/`、`src-tauri/target/`、`**/__pycache__/` 已在 `.gitignore`；可随时删除，下次 `tauri dev` / `vite build` 会重建 |
| `public/` 贴图 | 无透明通道优先 JPEG（q≈80–85）；需透明用 WebP；全景/正射课堂足够用 **4K**，勿默认打 8K |
| 依赖 | 未在 `src` 引用的包不要留在 `dependencies`（例如曾移除未使用的 `maplibre-gl`） |
| 草稿 | 根目录临时导出图、重复预览底图勿入库；预览页应复用课程同源贴图 |

### 3.2 本地地理数据 `public/geo/`

| 文件 | 用途 | 来源要点 |
|------|------|----------|
| `countries-110m-topo.json` | 构建输入 | world-atlas / Natural Earth 衍生 |
| `countries-teach.json` | 教学国界（台湾并入 CN 等） | `npm run build:countries`；含 `disclaimer` |
| `cities-teach.json` | 城市注记 | 自维护教学点位 |
| `rivers-teach.json` | 河流示意 | 自维护 |
| `plates-teach.json` | 板块示意 | 自维护 |
| `ocean-currents-teach.json` | 洋流路径示意 | 自维护 + `disclaimer` |

真实地形原型放在 `public/terrain/matterhorn/`：`height-u16.bin` 是 257×257
量化高程，`ortho.jpg` 是 4096×4096 正射影像，范围为 LV95
`[2615000, 1090000, 2620000, 1095000]`。来源为 swisstopo
**swissALTI3D 2 m** 与 **SWISSIMAGE**，许可和署名写在同目录
`metadata.json`。运行 `python3 scripts/build-matterhorn-terrain.py` 可重建；
脚本需要 Python 3 与 Pillow，原始瓦片只缓存到 `.cache/matterhorn-dem/`。

贡嘎山备选原型保存在 `public/terrain/gongga/`：513×513 量化高程覆盖
贡嘎山、海螺沟及东侧河谷约 40×39 km，DEM 来源为 AWS Open Data 上的
Mapzen Terrain Tiles（当地底层为 SRTM），4096×4096 地表影像使用
EOxCloudless 2016（CC BY 4.0，含经处理的 Copernicus Sentinel 数据）。
`metadata.json` 保存范围、国家公布峰顶高程 7508.9 m、许可及完整署名。
运行 `python3 scripts/build-gongga-terrain.py` 可重建；需要 Python 3、
NumPy 与 Pillow，下载缓存位于 `.cache/gongga-terrain/`。

垂直自然带正式场景使用 `public/terrain/kilimanjaro/`：1025×1025
量化高程覆盖乞力马扎罗山约 27.8×25.4 km，8192×8192 地表影像由四张
EOxCloudless 2016 WMS 图拼接，并附带 1025×1025 植被概率掩膜，供 GPU
实例树在近景中恢复森林轮廓。DEM 使用 Mapzen Terrain Tiles（当地底层为
SRTM）；影像为 CC BY 4.0。`metadata.json` 记录范围、5895 m 峰顶高程、
垂直夸张、编码、来源和许可。运行
`python3 scripts/build-kilimanjaro-terrain.py` 可重建；需要 Python 3、
NumPy 与 Pillow，缓存位于 `.cache/kilimanjaro-terrain/`。

垂直自然带使用本地静态教学图 `public/images/env-differentiation/alpine-2_5d-hero-4k.webp`，叠加可点选的海拔、自然带和要素说明；典型植被与动物卡片使用本地真实静态图片，来源与许可见 `public/images/biomes/SOURCES.md`、`public/images/animals/SOURCES.md`。不打包或播放视频素材。

### 3.3 联网服务（可选层，失败须可降级）

| 服务 | 用途 | 入口 |
|------|------|------|
| [NASA GIBS](https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs) WMS | SST / 叶绿素 / 积雪海冰 / 降水 / **CERES 入射太阳辐射** 等专题 | `src/engine/globe/gibs.ts` |
| [Open-Meteo](https://open-meteo.com/) | 城市天气、稀疏格点风场 | `geoScene` / `windfield` 图层 |
| NASA GHRSST（经 GIBS） | 海表温度说明文案 | GeoLab UI |
| [swisstopo](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices) STAC / WMS | 构建马特洪峰真实高程与正射影像；运行时使用已打包资源 | `scripts/build-matterhorn-terrain.py` |
| [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) / [EOxCloudless](https://cloudless.eox.at/) WMS | 构建贡嘎山、乞力马扎罗山 DEM 与 Sentinel-2 无云影像；运行时只使用已打包资源 | `scripts/build-gongga-terrain.py`、`scripts/build-kilimanjaro-terrain.py` |

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

**应用内索引：** 顶栏「开源资源」或 `#/resources`；数据文件 `content/resources/open-geo.json`。**国外资源必须带 `foreign: true`**，界面用金色「国外」角标。增删条目时同步改该 JSON 与下表精神一致。

**原则：能用自绘 / 粒子 / 滤镜讲清的，不必堆贴图；需要真实质感时，优先 CC0 / 公有领域，并离线打包。**

---

## 4. 架构速览

```
content/                 教材与课步 JSON
src/curriculum/          目录查询、demoRegistry、layerBindings
src/engine/globe/        GlobeHost + layers/*（可插拔）
src/demos/<id>/          DemoLab 各课画布
src/demos/theme.ts       DemoHex / Demo3 统一色板
src/views/Course|GeoLab|DemoLab|Resources|layout/
src/stores/              场景状态
public/geo|textures/     教学数据与贴图
src-tauri/               桌面壳
```

- 地球能力 → **图层**，禁止往 `GlobeHost` 堆业务几何（见 `globe-layers.mdc`）。
- 课与图层 → **绑定表**，禁止页面里硬编码一长串 `layers.xxx = true`。
- Demo 主题 → `theme.ts` + CSS `--demo-*`，禁止示意层散落硬编码色。
- 布局：**左侧 `SideNav` 课程目录常驻**，右侧 `RouterView` 换内容（资源 / 教程说明 / DemoLab / GeoLab）。演示课与地球预览必须挂在 `AppShell` 子路由，禁止独立全屏页把目录卸掉。
- **画布全屏预览**：宿主根节点标 `data-dili-canvas`，工具条/HUD 标 `data-dili-chrome`（或沿用 `.toolbar` / `.hud`）。`CanvasFullscreenButton` + `useCanvasFullscreen` 全屏该节点并隐藏 chrome，只留画布；`Esc` 退出。勿另开无侧栏路由。

---

## 5. 新增 DemoLab 一课

1. `xiangjiao.json` 中教程 `status` 可配合上线节奏。
2. `src/curriculum/demoRegistry.ts` 登记：`tutorialId`、`engine`、`steps`、`status`、`load`。
3. `status: 'ready'` → 实现 `src/demos/<id>/index.vue`。
4. `status: 'deferred'` → 走 `DemoPlaceholder`。
5. 路由：`#/demo/:tutorialId`（`AppShell` 子路由，左侧目录不卸）。

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

样板代码：`src/demos/rock-cycle/index.vue`（成岩过程）、`src/demos/landform-change/index.vue`（褶皱/断层内力）、`src/demos/weather-systems/index.vue`（锋面）、`src/demos/earth-rotation/index.vue`（自转：方向·周期·速度 / 昼夜晨昏 / 地转偏向 / 时区区时与日界线，对照选必1·1.1 PPT）、`src/demos/universe-earth/index.vue`（必修1·地球的宇宙环境：太阳系全天银道+BSC5；课步「银河系」为多层合成——NASA 俯视盘 + `galaxyNebula` 星云气体 + `threejs-galaxy-shader` 点云 + 盘面/晕星 + Bloom，标注来自 `milky-way-arms-teach.json`，`npm run build:stars` / `build:galaxy`）。必修第一册「地球的圈层结构」：课步「内部圈层」为 Three 斜视切角（右前上方挖掉互成直角的一角，同时看见切面与 Blue Marble 球面）。切面质感复用已打包的 ambientCG CC0：地壳 `strata-color`（土色沉积岩）、岩石圈 `igneous-color`（岩浆岩）、软流层为受热岩石、地幔 `lava-color`（熔岩）；外核与内核用铁镍熔融色，不跟岩浆同一套橙。壳与软流层厚度已夸张。「外部圈层」单独用 SVG。大气受热过程（`atmosphere-heating`）为临边三维场景：真实地表、厚度已放大的对流层/平流层气块，短波削弱、地面长波与大气逆辐射均用实心箭头。其余各课（太阳影响、演化、地貌、大气分层与热力环流、水、植被与土壤）为带动画箭头的 SVG 过程示意，共用 `src/demos/bx1/SceneFrame.vue`。凡画地球圆盘用 `EarthDisc` 裁切 `earth-blue-marble.jpg`，禁止纯色圆代替地表。「地域差异性」分为纬度地带性、干湿度地带性、垂直地域分异和地方性分异四个课步；垂直课步使用 `alpine-2_5d-hero-4k.webp` 虚构山系教学图，叠加可交互海拔、林线、雪线和自然带说明。地方性课步使用 `public/terrain/gongga/` 的贡嘎山—海螺沟真实高程与 EOxCloudless/Sentinel-2 影像生成 Three.js 地形，坡向、冷空气、岩层和汇流为教学叠加，不能标作实测机制数据。界面必须分别标明真实数据来源与教学示意边界。

---

## 6. 新增地球图层

按 `.cursor/rules/globe-layers.mdc` 顺序：

1. `types.ts` → `LayerId`
2. `catalog.ts` → 文案与默认开关
3. `layers/<id>.ts` → 实现 `GlobeLayer`
4. `host.ts` → `factories` 注册（`EarthLayer` 最先）
5. 需要时：`layerConflicts.ts` 互斥组；`layerBindings.ts` 绑课

本地教学 GeoJSON 优先 `public/geo/*-teach.json`。

样板：`layers/enso.ts`（赤道太平洋暖池 / 信风 / 沃克环流；`GlobeFrameState.ensoMode` 切换正常年·厄尔尼诺·拉尼娜；DemoLab `air-sea` 为地球主视 + 右侧斜温层剖面）。

---

## 7. 主题与观感

- 数据源：`src/demos/theme.ts`（`DemoHex` 字符串 / `Demo3` 整数）。
- CSS：`src/styles/global.css` 的 `--demo-*`、壳层「星空」夜空底（与地球场景 `#070b16` 同一套）。
- 画布字号宜小（角标约 10px，要素名 10～12px）。
- **地球示意线**：`DemoHex.earth*` / `EarthLineWidth` / `EarthLineStroke`（实线 vs 虚线）/ `EarthDashDeg`。口诀：**主框架实线，特殊纬线虚线**（回归线、极圈虚线；赤道/经纬网/晨昏实线）。Three 用 Tube/Torus；虚线分段 Tube。样板：`earth-rotation` 晨昏、`layers/latlon.ts`。
- **视觉完成度门槛**：详见 `.cursor/rules/demo-lab.mdc`。同一教程以完成度最高的相邻课步为最低基线；必须完成地理场景载体、知识—图形绑定、有效构图、交互反馈和桌面/窄屏截图横向验收，禁止用统一配色掩盖 PPT 基础图形或占位构图。

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

### 攀登榜数据与迁移

角色资料弹窗支持编辑性格、爱好，均为选填、各最多120字。两字段随班级数据自动保存，包含在完整 JSON 备份及 Excel 导入导出中；下载的 Excel 模板与导入预览同步提供这两列。旧缓存与旧 JSON 备份缺少字段仍可读取；Excel 更新已有角色时，没有相应列则保留原值，有列且为空则清空对应字段，不勾选覆盖则保留现有资料。

Windows 正式版使用 Rust `current_exe()` 确定路径，班级、积分、座右铭、线路段数、角色绑定、自定义素材保存为 exe 同级 `data/leaderboard.json`，与启动工作目录和U盘盘符无关。开发环境及其他平台使用应用本地数据目录下的 `data/leaderboard.json`；纯浏览器模式继续使用 localStorage / IndexedDB。

启动时先读取并校验文件，再挂载页面；存在文件时以文件为准，读取失败停止加载，避免以示例数据覆盖原数据。文件不存在时读取当前电脑旧版本 localStorage / IndexedDB，进入攀登榜后首次保存即迁移至文件。迁移必须在保存过数据的原电脑运行新版，其他电脑无法读取原电脑缓存。

写入经过串行队列，先写临时文件并同步，再保留 `leaderboard.json.bak` 并替换正式文件。失败在页面显示错误，不静默改存电脑缓存。攀登榜“数据备份”可导出完整 JSON，导入校验格式、班级、学生、角色及素材；确认覆盖前自动下载当前完整备份。Excel 导入导出仍用于名单交换。分发更新包时替换 exe，保留用户已有的 data 文件夹，禁止将用户数据打入公开分发包。

| 文件 | 内容 |
|------|------|
| `.cursor/rules/dili-core.mdc` | 中文、争议底图、总原则 |
| `.cursor/rules/demo-lab.mdc` | DemoLab 栈、箭头、动画、贴图 |
| `.cursor/rules/globe-layers.mdc` | 可插拔图层 |
| `.cursor/rules/curriculum-bindings.mdc` | 课 ↔ 图层绑定 |
| `.cursor/rules/docs-sync.mdc` | 本教程与资源表同步义务 |

### 动态地质知识图（岩石循环 / 地表形态变化）

两节通过 `src/demos/geology-shared/GeologyLesson.vue` 接入现有 DemoLab；入口为 `/demo/rock-cycle`、`/demo/landform-change`。原课步保留，第二节增加内外力综合总览。

技术路线评估：岩层与过程的空间关系是知识重点，但本次需求明确围绕已确认的写实图片动效；固定剖面已能呈现所需关系，旋转视角不会增加当前任务所需信息。采用写实插画 + 局部 WebGL 流动 + 有纹理的 SVG 变形与标注，避免改成视觉质量不一致的简化模型。渲染分辨率限制为 1.5 倍设备像素比；分类与循环课步用静态背景，后台停止推进时间，切换时释放 WebGL 资源，兼顾桌面与窄屏。

- 岩石形成：六阶段时间轴可播放、暂停、拖动；冷却、外力、固结、变质与重熔由 `RockFormation.vue` 显示对应过程，区分通常保持固态的变质与重熔。
- 岩石分类与循环：纹理标本为教学示意，非鉴定依据；四类转化作用可筛选路径，箭头指向目标节点。
- 地表形态：总览展示河流、海面与深部岩浆局部运动；褶皱/正断层用有纹理的剖面表达，参数手动调整后可衔接播放；流水、风力、冰川与海浪各有对应对象及方向箭头。
- 全屏复用 DemoLab 的 `data-dili-canvas`，控件使用 `data-dili-chrome`；保持插画原始比例。地理过程时间与空间尺度均为教学压缩，不做物理求解。
- 新增插画来源与提示词记录于 `public/textures/geology/disclaimer.json`，岩石纹理仍沿用既有 ambientCG 资源声明。
