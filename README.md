# Remotion 镜头 × OpenFilm Studio

**剪辑和最终导出只走 OpenFilm。** Remotion 保留为可选的镜头制作工具，而不是另一套成片时间轴。项目锁定 OpenFilm 0.4.1 和 Remotion 4.0.541，原母版 `D:\vscode\Remotion模板` 未修改。

## 先试两种路线

安装 Node.js 24（含 npm）后，双击本目录的 `启动Studio.cmd` 即可启动 Studio 并打开浏览器。也可以在终端运行 `npm start`，然后打开终端打印的地址。两种方式都会检查项目依赖和 Chromium，首次需要下载时请保持联网。同版本 Chromium 可以在本机的多个副本之间共用。

| 我想做什么 | 命令 | 看到什么 |
|---|---|---|
| 继续用已有 Remotion 模板 | `npm start` | 五个可单独裁剪和编辑的 Remotion 镜头 |
| 试试纯 OpenFilm | `npm start -- --project OpenFilm-Native` | 两个原生页面镜头，跳过 Remotion 构建 |
| 看 3D 能否接进来 | `npm start -- --project ThreeDemo` | 一个 Remotion / React Three Fiber 镜头及 DOM 叠层 |

打开终端打印的本机 Studio 地址（含访问凭据，请勿分享）。默认使用 4849/4850；若并行开副本，可以在其终端先设置 `$env:REMOTION_STUDIO_PORT=4855`。Ctrl+C 停止服务。

## 从完整模板新建项目

在模板目录执行下面的命令，目标目录可以用新片的名字。目标目录必须不存在或为空，并位于模板目录外。

```powershell
npm run new -- D:\vscode\MyOpenFilm
```

新副本包含 Remotion 镜头模板、OpenFilm Studio、原生示例、3D 示例、IBM Plex Sans SC、公司水印和动效库。在新目录双击 `启动Studio.cmd` 或运行 `npm start`，会自动完成初始化并启动 Studio。也可以在新建命令末尾加 `--with-node-modules`，复制已安装的依赖。

副本保留 `film.html`、源镜头、项目内素材、画布/帧率设置、标记及旧版字幕样式；不复制本机凭据、项目身份、历史、缓存、渲染产物目录、参考仓库或生成的 Remotion `scenes/page.js`。库外链接素材应重新链接，或先放进项目目录。副本里的 `film.html` 是当前剪辑状态，不是无条件重置的初始版。

## 两边各做什么

| 能力 | 建议的工具 | 原因 |
|---|---|---|
| 已有 TSX 动效、数据驱动画面、复用设计组件、批量变体、已有 R3F 场景 | Remotion | 帧驱动的 React 组件适合可复用的代码资产，不必为迁移重写已跑通的模板。 |
| 新片的标题卡、简单动效，或本来就是网页的镜头 | OpenFilm 原生 | 直接编辑 HTML / CSS / JS，无构建步骤；用稳定 `id` 暴露编辑对象，也可按秒连续采样。 |
| 排镜头、裁切、调位置/颜色/文字、加音轨和字幕、导成片 | OpenFilm Studio | Studio 导出读取时间轴和人工覆盖。原 Remotion 导出不读取这些修改。 |

**完整副本中可以直接从原生镜头开始。** 用 `npm start -- --project OpenFilm-Native` 打开原生示例，需要 React 图表或 3D 镜头时再使用随模板提供的 Remotion 源码。

### 同一条时间轴混用两种镜头

以混合版副本为例，可将 `projects/OpenFilm-Native/scenes/` 整个目录复制到 `projects/Remotion-Template/native-scenes/`（连同 CSS 和 JS），然后在 Studio 的素材面板将 `native-scenes/intro.html` 加到时间轴。原生镜头和 Remotion 镜头都是 `film.html` 中的页面片段，用同一个 Export 按钮输出。也可以在未打开 Studio 时手动加 `<iframe id="native-intro" src="native-scenes/intro.html#t=0,3" at="15"></iframe>` 到对应轨道。

- `projects/<项目>/film.html`：唯一成片时间轴，包含轨道、裁切、镜头位置和人工覆盖。
- `template/src/`：Remotion 镜头源码；`template/src/timeline.ts` 定义的是源镜头帧区间和初始剪辑，不会在后续构建中重铺 Studio 时间轴。
- `adapter/`：把 OpenFilm 的镜头秒数映射到 Remotion Player 的帧，等待 React 提交、图片和字体；每次 seek 在提交后还会等两帧合成，不会截到未绘制的画面。2D 与 ThreeDemo 分开打包，普通镜头不加载 3D 依赖。
- `projects/OpenFilm-Native/scenes/`：原生镜头源码；直接改文件再刷新，无需构建。
- `.studio/`、`exports/`：本机服务状态、凭据和导出的视频。

改 Remotion 源码后运行 `npm run build` 再刷新 Studio。构建只在 `film.html` 缺失时创建初始剪辑。如果源镜头时长变化，需要检查 Studio 上已有片段的入点和出点。不要删除有人工编辑的 `film.html` 来同步源码。

## 品牌素材与动效选型

项目已接入 **IBM Plex Sans SC** 和公司的官方水印原图；字体随项目携带，两套示例都把水印放在独立的 Studio 顶层轨道，可单独替换图样和时长。新片的色调、布局、节奏和转场按内容决定。原生、混合项目都可以在素材面板选用 [三种镜头级动效](projects/OpenFilm-Native/motion-kit/README.md)：编辑型揭幕、数据描线、产品局部聚焦。这三种页面按项目需要加入时间轴。水印在 [品牌资产说明](projects/OpenFilm-Native/public/brand/README.md) 中有完整选法和对齐规则。

## OpenFilm 0.4 新增能力

从 0.3.2 升到 0.4.1 后，下面这些能力直接在 Studio 里可用，不需要改现有时间轴。

| 能力 | 怎么用 | 落在哪里 |
|---|---|---|
| 入点 / 出点 | `I` 设入点、`O` 设出点（0.3.2 起就有，非新增） | 时间区域高亮，状态栏显示 `00:00:00 – 00:07:00` |
| 区间相关 | `X` 清除、`Shift+X` 以选中片段设区间、`Shift+Space` 播放区间、`Shift+I` / `Shift+O` 跳到入 / 出点 | 播放器 |
| 关键帧 | 选中片段后在属性面板给位置、缩放、旋转、透明度打点；`F9` 缓动 | `overrides` |
| 遮罩 | 属性面板 → 遮罩，矩形 / 椭圆等形状，可反选 | `overrides` |
| 文字动画 | 逐字 / 逐词 / 逐行的分段动画 | `overrides` 的 `split` |
| 3D 与可动画特效 | `--fx-z` / `--fx-rx` / `--fx-ry` 做 3D；`--fx-blur`、`--fx-glow`、`--fx-brightness`、`--fx-contrast`、`--fx-saturate`、`--fx-grayscale`、`--fx-invert`、`--fx-hue` 做特效，都能打关键帧 | 片段 `style` |
| 调色与 LUT | Color 面板；或用 `--of-lut: url(looks/x.cube)` 指定 `.cube` / `.ctf` / `.clf` | 片段 `style` |
| 抠像 / 美颜 | `--of-cutout: 1` 去背景、`--of-beauty-*` 美颜，本地模型，不上传画面 | 片段 `style` |
| 响度与导出 | 导出可指定码率或目标文件大小，声音默认对齐 -14 LUFS | 导出面板 |

新增的四个编辑器是插件：剪辑（Edit）、画板（Canvas）、审片（Screening）、调色（Color）。快捷键方案可以在设置里换成 Premiere 或 Final Cut 的。

**注意**：`overrides` 只对原生页面镜头生效，不会反写到 Remotion 的 TSX。要在 Remotion 镜头上做这些效果，仍然要改 TSX 源码后重新 `npm run build`。

`adapter/` 目前没有声明 `frameReadsOverrides`。原生镜头如果需要在 `frame(t)` 里读取被覆盖的 CSS 变量（例如自己画 `--fx-*` 特效），在 `window.film` 上加上 `frameReadsOverrides: true`，宿主会在调用 `frame` 前先应用覆盖。不改也能正常剪辑，只是页面代码读不到那些值。

## 当前边界

- 五镜头版没有复制原 `Main` 的跨镜头淡化、全局页脚和 LowerThird。`scenes/main.html` 保留完整构图，但作为单个片段时不能逐镜头裁剪；需要逐镜编辑和完整效果时，应在 Studio 补跨镜过渡与独立叠层。
- 人工文字、位移、样式改动保存在片段的 `overrides`，不会反写 TSX。现有 DOM 路径 ID 保持兼容，但重构结构可能使覆盖失效；新镜头的重要文字、卡片和图形请写语义 `id`。
- Remotion 页按源 30fps 取帧；把成片导成 60fps 不会为这些镜头补出新的动画中间帧。需要连续子帧采样的新动效可优先用原生页面。异步 GLB、网页视频、远程字体和 `delayRender` 不在现有适配保证内，需要逐镜补就绪处理并验证。
- Studio 不能像 DOM 一样拖动 Canvas 内的网格、材质和灯光。要改 3D 对象，请改镜头源码；DOM 叠层和整个镜头仍可编排。音频请加到 Studio 音轨，页面内音频不会自动迁移。人工样式覆盖也不会跑 Remotion 模板的对比度检查。
- 宿主在片段开始时才挂载页面，所以 Remotion 片段首次挂载要 0.2–0.4 秒。每个生成的页面在 `<head>` 里先铺自己的底色，这段时间是纸色呼吸而不是黑底闪烁；要完全消掉，可以在剪辑时给前一镜尾巴多留 0.3 秒，或等 OpenFilm 提供片段预挂载。
- OpenFilm 的 MIT 许可不改变 Remotion 等其他依赖的许可。

## 验证

推荐先跑 `npm run test:workflows`。它用临时项目启动 Studio，检查构建不改时间轴、原生副本不依赖 Remotion、原生小数时间采样和反向 seek，以及混合时间轴的覆盖保存、重载、WebGL 预览和 H.264 导出，不会编辑当前项目的 `film.html`。它还会从空目录新建一个纯 OpenFilm 副本并真跑一次 `npm ci`：0.4.1 升级后曾出现锁文件仍停在 0.3.2、全新安装直接 EUSAGE 的问题，这条检查就是那次回归的守卫。需要上述 Chromium 和可用的 FFmpeg。

旧的单项验证仍可在另一个终端启动默认混合项目后执行。它们会生成测试状态，不要与正在进行的人工剪辑同时运行。

```powershell
npm test                      # Remotion 元素覆盖、重开、短段导出
node scripts/verify-ui.mjs    # 实际鼠标拖拽编辑和时间轴移动
node scripts/verify-three.mjs # 验证 WebGL、往返 seek 和短段导出
node scripts/verify-full.mjs  # 默认主片全长导出
```
