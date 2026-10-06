# 地理过程

高中地理过程动画：用 **3D 动画 + 扁平示意 + 前端交互** 讲清气压带风带等机制。不是地图/GIS，也不是排课工具。

教材导航：**湘教版（2019）**，按高一 / 高二 / 高三罗列必修与选择性必修目录；已上线第一课「气压带、风带的形成与移动」。

## 开发教程

完整技术栈、开源资源目录与开发步骤见 **[docs/developing-dili.md](docs/developing-dili.md)**。引入新依赖 / 贴图 / 地理数据 / 外部 API 时请同步更新该文档。

## 运行

需要 Node.js 18+。桌面端另需 Rust（[rustup](https://rustup.rs/)）。

```bash
npm install
npm run dev          # http://localhost:1430 → 首页即湘教版目录布局
                     # #/t/... 教程详情  #/lab/... 实验  #/demo/... 演示课
npm run tauri dev    # 桌面
npm run tauri build  # 安装包 dmg / nsis / msi
```

改课编辑 `content/atmosphere/lesson.json`；改目录编辑 `content/curriculum/xiangjiao.json`。界面标明教学示意，非实时天气。

## 结构

```
content/curriculum/   湘教版年级—册—章—节—教程目录
content/atmosphere/   气压带风带课步、探究题、用语词典
docs/                 开发教程与资源清单
src/curriculum/       目录、demoRegistry、图层绑定
src/demos/            DemoLab 各课画布
src/engine/           共享模型与 Globe 可插拔图层
src/stores/           场景状态（3D 与扁平同步）
src/views/            Course / GeoLab / DemoLab / layout
public/geo|textures/  教学矢量与贴图（含 CC0 岩石等）
src-tauri/            独立桌面壳
```
