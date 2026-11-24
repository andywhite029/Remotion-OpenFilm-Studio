# Remotion 程序化视频模板

用于制作 15–50 秒的产品与技术短片：Remotion 4 + React Three Fiber，默认 1920×1080、30fps。内容、时间轴与视觉令牌分开维护，输出可重复渲染的 MP4。

## 开始使用

推荐 **Node.js 24 LTS**。依赖声明支持 Node ≥22，但运行校验器还需要原生 TypeScript 类型剥离支持；先用自检确认环境。

```bash
npm install
npm run doctor
npm run dev
```

Studio 默认打开 `http://localhost:3000`。`doctor` 的 `FAIL` 要先修复；`WARN` 按提示判断影响。首次命令行渲染可能下载 Chrome Headless Shell，需要网络或预置缓存。

```bash
npm run check
npm run render:draft
```

默认合成 `Main` 是 15 秒示例片；`ThreeDemo` 是 5 秒的 3D 冒烟测试。渲染结果默认写入 `out/<合成Id>.mp4`。

## 修改入口

| 要做什么 | 从这里开始 |
| --- | --- |
| 改文案、版式、画面 | [Main.tsx](src/sequences/Main.tsx) |
| 改节拍与时长 | [timeline.ts](src/timeline.ts) 的 `SEG` / `VIDEO` |
| 改颜色、字号、间距、动效 | [theme.ts](src/theme.ts) |
| 加素材 | 放进 [public](public/)，使用 `staticFile('media/文件名')` |
| 改渲染配置 | [remotion.config.ts](remotion.config.ts) |
| 做一条新片子 | 按[制作指南](docs/制作指南.md)派生项目 |

一个仓库维护一条主线片及其变体；不同节拍结构、画幅或品牌应派生项目。编码时遵守[开发规范](docs/开发规范.md)，交付前必须通过 `npm run check`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | Studio 预览 |
| `npm run doctor` | 环境自检 |
| `npm run check` | 类型、时间轴、素材引用与对比度校验 |
| `npm run stills -- Main --frames 0,150,300` | 关键帧 PNG |
| `npm run render:draft` | 半分辨率审片 |
| `npm run render:hq` | 全分辨率常规交付 |
| `npm run render:master` | PNG 中间帧、较高质量 CPU 编码 |

局部渲染、GPU、素材处理及排错见[素材与渲染](docs/素材与渲染.md)。脚本参数以 `--help` 为准。

## 文档导航

| 文档 | 什么时候看 |
| --- | --- |
| [制作指南](docs/制作指南.md) | 派生项目 → 分镜 → 制作 → 验收；依赖升级与交接 |
| [开发规范](docs/开发规范.md) | 找代码入口、写组件、排时间轴、调整视觉 |
| [素材与渲染](docs/素材与渲染.md) | 图片、视频、音频与 3D；预设、GPU、本地素材复用、排错 |
| [HANDOFF.md](HANDOFF.md) | 记录当前项目状态、素材来源和复现命令 |
| [CLAUDE.md](CLAUDE.md) | AI 编码助手必须遵守的项目约束 |
