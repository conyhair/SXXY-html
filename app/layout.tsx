import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "巡展像素小工具｜24×24 像素画生成器",
  description: "在浏览器中裁剪图片并生成干净的 24×24、8 至 32 色像素画。图片不会上传。",
  icons: { icon: "/tour-pixel-logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
