# 24×24 像素工坊

一个只在浏览器本地运行的 24×24 像素画生成器。上传 PNG、JPEG 或 WebP，完成正方形裁剪后，页面会使用确定性 CIELAB K-means 量化为可选的 8、16、24 或 32 色，并导出真实 24×24 的不透明 PNG。

图片不会上传到服务器，项目没有账号、数据库或后端图片处理。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

## 验证

```bash
npm run build
npm test
```
