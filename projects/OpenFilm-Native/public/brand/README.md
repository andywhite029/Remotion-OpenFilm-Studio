# 固定识别资产

- 字体源：`D:\PPT\IBMPlexSansSC\IBMPlexSansSC`。OpenFilm 随项目携带 IBM 发布的同系列 WOFF2（`@ibm/plex-sans-sc@1.1.0`，Regular 400 与 Bold 700）和许可。提供的原始 OTF 在 Chromium 中字形解析失败，保留于原目录。OpenFilm 页面引入 `public/brand/brand.css`，正文与标题使用 `var(--brand-font)`。
- 水印源：`D:\PPT\logo_watermark`。32 张官方透明原图已放入 `assets/brand/watermarks/`（光轮中文 / Lightwheel 英文 × 全彩 / 反白 × 16:9 / 4:3 × 四角）。
- 启动混合版时，`npm run build` 会将这些品牌素材同步给 Remotion 镜头和 Studio 的素材面板；更换品牌资产时在 `OpenFilm-Native` 原件处改。旧 Remotion CLI 不加载这套 Studio 字体 CSS。

## 在 Studio 使用水印

1. 在素材面板选择 `assets/brand/watermarks/` 中对应的语言、底色和画幅。浅色背景用 `full-color`，深色用 `reversed`；`TL` / `TR` / `BL` / `BR` 对应左上、右上、左下、右下。
2. 放在最上方的独立轨道，画幅和画布对齐。例如 1920×1080 的项目用 `16x9`，图片盒对齐 `1920×1080`，左上坐标为 `0,0`。**源 PNG 已经是整画布透明底图，Logo 的位置和留边已经内置**；不裁、不拉伸、不重新手摆整个 PNG。竖版目前无官方原图，不把 16:9 变形当替代。
3. 调整时长后锁定轨道。浅、深底跨镜且同一张水印对比不足时，在同一轨道相接替换对应版本，不改图样。可按品牌投放要求仅在指定段显示。

例如 5 秒浅底横版（在 Studio 关闭时手动编辑，最上层写在 `body` 第一条轨道）：

```html
<section id="brand-watermark" title="官方水印" locked>
  <img id="company-logo" src="assets/brand/watermarks/guanglun_full-color/16x9/logo_16x9_BR.png#t=0,5">
</section>
```

两套横版示例都使用右下角的中文水印。原生示例为反白，混合示例为全彩。可按项目从素材面板替换。
