# OpenFilm 原生视频项目

这个副本使用 Node.js 24 和 npm。双击本目录的 `启动Studio.cmd`，或在终端运行 `npm start`。启动时会自动检查并安装缺少的项目依赖和 Chromium。

从 Studio 打开时间轴，移动或裁切镜头、改文字、添加音轨与字幕，最后用 Studio 的 Export 导出。若 4849/4850 被其他实例占用，可先设置 `$env:REMOTION_STUDIO_PORT=4855`。

- `projects/OpenFilm-Native/film.html` 是成片时间轴与人工覆盖数据。不要用源码生成器覆盖它。
- `projects/OpenFilm-Native/scenes/` 是可直接编辑的镜头源码。改好后刷新 Studio，不需要重新编译。
- 新镜头通过 `<iframe src="scenes/your-shot.html#t=0,3">` 进入时间轴（建议用 Studio 的素材面板添加）。页面用 `window.film.frame(t)` 接收镜头本地时间，重要元素用稳定的 `id`，避免源码重排后覆盖失效。音频放 Studio 的音轨，不依赖页面播放。
- `exports/` 保存成片，`.studio/` 是本机运行状态与访问凭据，请勿分享。

## 品牌与动效

- 默认使用随项目打包的 IBM Plex Sans SC；[品牌资产说明](projects/OpenFilm-Native/public/brand/README.md) 中有公司水印的选法。水印不烘进镜头，作为独立顶层轨道使用。
- [动效选型与源文件](projects/OpenFilm-Native/motion-kit/README.md)：可以按需拖入编辑型揭幕、数据描线或产品聚焦，不要把它们当固定片头或默认转场。
