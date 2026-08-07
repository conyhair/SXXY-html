# 巡展像素小工具

一个只在浏览器本地运行的 24×24 像素画生成器。上传 PNG、JPEG 或 WebP，完成正方形裁剪后，页面会使用确定性 CIELAB K-means 量化为可选的 8、16、24 或 32 色，并导出真实 24×24 的不透明 PNG。

图片不会上传到服务器，项目没有账号、数据库或后端图片处理。

## 在线版本

- GitHub Pages 免登录版：<https://conyhair.github.io/SXXY-html/>
- Sites 版：<https://pixel-studio-24x24-2026.conyhair2024.chatgpt.site/>

免登录版通过 `.github/workflows/pages.yml` 在 `main` 分支更新后自动构建发布，并与 Sites 版共用同一套界面和像素化代码。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

## 验证

```bash
npm run build
npm run build:pages
npm test
```
