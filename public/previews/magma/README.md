# 岩浆动画视觉样片

运行项目后访问 `/previews/magma/index.html`。这是独立预览，不修改课程路由或现有演示。

- `index.html`：WebGL 局部流动、热光与 Canvas 火星动画；支持暂停、重新播放、0.25–2 倍速度、标注开关。
- 底图复用 `/textures/geology/volcano-cutaway.jpg`（与课程 Demo 同源，避免重复打包）。
- `preview.png`：浏览器内验证后的截图。

本样片演示视觉效果，未求解流体物理。运动速度、地质尺度为教学观察做了示意化处理；底图里的冷却外观是静态绘制，尚无随时间固结的过程模拟。

已在浏览器中验证 WebGL 画面显示、暂停/继续、重新播放、速度调节与标注开关。

## 底图生成提示词

Use case: scientific-educational. Create an exquisitely detailed cinematic geological cutaway landscape for a live magma animation. Landscape 1536x1024 or similar 3:2. NO TEXT NO LABELS NO ARROWS NO SYMBOLS. An educational physically coherent volcano cross-section. Wide side view, entire landscape visible. Cool deep navy twilight sky occupies top 28%. Volcano summit at normalized x=0.43,y=0.31. A dark rocky volcanic cone with glowing red orange lava overflowing its summit, flowing down the right slope until x=.70,y=.52. A few small glowing sparks at the crater. Surface countryside and a blue river to far right, atmospheric mountains behind. The bottom 48% shows a precise vertical cutaway of the ground, with realistic pale brown/gray horizontal sedimentary rock strata; a large irregular underground MAGMA CHAMBER full of brilliant golden orange molten magma centered at x=.43,y=.80, approximately width .30 height .20. The chamber clearly connects upward by a continuous narrow red-orange volcanic conduit at x=.43, from y=.75 to the summit y=.31. Show a few thinner lateral magma intrusions in the rock. Dark solid rock surrounding the conduit and chamber. Strong material contrast between cool solid rock and luminous hot fluid. The exposed molten liquid is highly detailed, with marbled golden hot convection cells, orange moving-looking fluid, dark cooling crust plates, a convincing heat glow. Chamber stays INSIDE underground rock; the section's ground line and volcano are physically coherent. Volcano and magma chamber must be visually central, readable, dramatic, but scientifically instructional, like premium natural history museum illustration combined with realistic 3D cutaway. No text anywhere. Avoid floating rocks, diagrams, panels, UI, frames, cartoon styling, people, buildings, huge explosive eruption, ocean of lava.
