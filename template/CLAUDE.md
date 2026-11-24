# CLAUDE.md

给 AI 编码助手的说明。项目是**程序化视频模板**：Remotion 4 + React Three Fiber，15–50 秒、1920×1080、30fps，每条片子从模板派生。渲染目标不是网页，是 mp4——所以「看起来差不多」不算对，逐帧一致才算对。

## 五条硬规则

1. **画面是 `frame` 的纯函数。** 禁止 `Math.random()`、`Date`、`useState` 驱动的动画、跨帧可变状态、`setInterval`。Remotion 会乱序 + 并行渲染，任何跨帧状态都会让同一帧渲出两张图。
2. **帧号只来自 `src/timeline.ts` 的 `SEG`。** 组件不写死帧号；要算进度的用 `lib/motion.ts` 的 `revealIn` / `beatProgress` / `stagger`。
3. **颜色/字号/间距/阴影只来自 `src/theme.ts` 的令牌。** 组件里不写 `#rrggbb` 或 `rgba()`。裸色值 = 绕过 `checkContrast`。需要状态色的浅底时用 `withAlpha(C.positive, 0.1)` 这类推导，不要写死 `rgba(...)`。
4. **内容改 `sequences/` + `timeline.ts` + `theme.ts`；`lib/`、`components/`、`three/` 是共享引擎。** 改引擎会影响所有未来项目，先问「真的每个项目都需要吗」。
5. **交付前 `npm run check` 必须全绿。** 它 = tsc + 时间轴契约 + 静态资源引用 + WCAG 对比度（26 对）。不要为了让它通过去放宽校验器。

## 禁止清单（高频错误）

- 不要用 `Math.random()` / `Date.now()` / `setTimeout` / `setInterval` / `requestAnimationFrame` 做动画。要时间就用 `frame`。
- 不要在组件里硬编码帧号；也不要在多个 beat 里复制同一个数字。
- 不要为了「通过检查」去改 `tools/*.ts` 的判定逻辑或放宽 `CONTRAST_PAIRS` 的 `min`。
- 不要用 `.sh` 脚本包装 npm 命令；不要用 shell 拼含中文的路径字符串。
- 不要提交 `out/`、`node_modules/`、大素材（`.gitignore` 已覆盖，别用 `-f` 绕）。
- 不要删 `compositions.ts` 里的两个 `// @new-composition*` 标记。
- 不要在 `timeline.ts` / `theme.ts` 里加 `import`（会让 `node tools/*.ts` 挂掉）。
- **不要在同一仓库里并存第二套 `SEG` 或第二套 `C`**。一个仓库 = 一条主线片 + 变体；不同节拍结构 / 画幅 / 品牌色 → 复制目录派生新项目（判据见[开发规范](docs/开发规范.md)）。深色版走 git 分支，不要新建配色变量。

改完随手验证：

```bash
npm run check                                          # 必过
node scripts/render.mjs Main --preset draft            # 整片冒烟
node scripts/render.mjs ThreeDemo --preset draft       # 3D 冒烟（非黑屏）
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Studio 预览（默认 3000） |
| `npm run compositions` | 列出合成；首次会下载 Chrome Headless Shell（约 131 MB） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | 四项校验串联 |
| `npm run doctor` | 环境自检（PASS/WARN/FAIL） |
| `npm run new -- <Name>` | 生成 `src/sequences/<Name>.tsx` 并注册到 `compositions.ts` |
| `npm run stills -- Main --frames 0,150,300` | 批量静帧 |
| `npm run render:draft` / `render:hq` / `render:master` | 三档渲染，输出 `out/<id>.mp4` |
| `npm run media -- <子命令>` | ffmpeg：`probe`/`from-video`/`retime`/`to-gif`/`mux-audio`/`contact-sheet` |

## 架构地图

```
timeline.ts  VIDEO + SEG（from 含 to 不含）+ TIMELINE_END  ← 时间唯一事实源
theme.ts     23 个语义令牌 + TYPE/LEADING/TRACK/SPACE/SAFE/RADIUS/MOTION
lib/format   clamp/lerp/缓动/progress/keyframe/格式化   lib/motion  beat 窗口 → 0–1
components/  Motion · Typography · Surfaces · Cards · Chart · Frame
sequences/   Main.tsx（5 个 beat，示例片）· ThreeDemo.tsx（3D 冒烟测试）
three/       Stage.tsx 灯光地面 · Spinner.tsx 帧驱动旋转（无 GLB、无 HDRI）
compositions.ts → Root.tsx → index.ts（registerRoot）→ remotion.config.ts
scripts/*.mjs 工具链    tools/*.ts 校验器    public/ staticFile 的根
```

## 不常见约定（容易踩）

- **没有 esbuild / ts-node。** `tools/*.ts` 靠 Node 原生类型剥离直接跑：`node tools/checkTimeline.ts`。因此只写**可擦除语法**——不要 `enum`、`namespace`、构造器参数属性。
- **`tools/` 引用 `src/` 时 import 必须带 `.ts` 后缀**（`import {SEG} from '../src/timeline.ts'`），由 `allowImportingTsExtensions` 支持。`src/` 内部互相引用走打包器，**不带**后缀。别混。
- **`"type": "module"`**：全是 ESM，脚本是 `.mjs`。没有 `require`。
- **路径含中文**（`Remotion模板`）：一律用 Node 的 `path` API，不拼 shell 字符串；不要用 `.sh` 包装 npm 命令（cmd.exe 会吃引号）；不要用 PowerShell `Get-Content`/`Set-Content` 读写含中文的源码（按 GBK 解码会乱码）。
- **`compositions.ts` 里两个 marker 不能删**：`// @new-composition-import`、`// @new-composition`，脚手架靠它们插入。
- **静态资源两套**：`public/` 用 `staticFile('media/x.png')`（不要写 `public/` 前缀，会抛错；不要手写 `/media/x.png`，会 404）；`src/assets/` 用 `import`，走 webpack。
- **`timeline.ts` / `theme.ts` 必须零 import**，否则 Node 无法直跑校验器。

## 已知坑

- **`master` 预设强制 PNG 中间帧**（`--image-format=png`）。原因：JPEG 中间帧会让输出变成 `yuvj420p`（full-range），覆盖 config 里的 `yuv420p`。只有 master 输出 limited-range `yuv420p`。
- **本机 `ffmpeg` 与 `ffprobe` 都在 PATH**（`C:\Users\CIBYD\bin`：ffmpeg 7.1 静态版 + ffprobe n7.1）。ffprobe 是从 `node_modules/@remotion/compositor-win32-x64-msvc/` 整份复制来的，**依赖同目录 14 个 DLL（约 27 MB），不能只挪 exe**；它是 Remotion 裁剪过的定制构建，本项目常用容器（mp4/mov/webm/png…）实测正常，探测 mxf 等特殊容器报错时再换官方 gyan 静态版或设 `FFPROBE_PATH`。两个脚本仍保留 `ffmpeg -i` 兜底，换到没有 ffprobe 的机器照样能跑；自查也可用 `ffmpeg -hide_banner -i <file>`（信息在 stderr，退出码 1 属正常）。
- **静帧很贵**：`stills.mjs` 每帧调一次 `remotion still`，每帧重新打包 ≈3.2 s。
- **GLB 异步加载**：必须在 loader 的 `onLoad` 里 `advance(performance.now())` 再 `continueRender()`，否则渲出空帧（不报错）。
- **三个 Remotion 包必须同版本**：`remotion` / `@remotion/cli` / `@remotion/three`（当前 4.0.541）。`doctor` 会查。
- `npm install` 的 `allow-scripts esbuild` 告警无害；esbuild 平台二进制来自 optionalDependencies。

## 改东西的顺序

改时间轴 → `node tools/checkTimeline.ts` → 改令牌 → `node tools/checkContrast.ts` → 改 `sequences/` → `npm run check` → `npm run stills` → `npm run render:draft` → `render:hq`（要母版用 `render:master`）。

详细用法见[制作指南](docs/制作指南.md)、[开发规范](docs/开发规范.md)、[素材与渲染](docs/素材与渲染.md)；项目状态填入 [HANDOFF.md](HANDOFF.md)。
