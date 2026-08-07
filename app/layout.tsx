import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "像素工坊｜24×24 像素画生成器",
  description: "在浏览器中裁剪图片并生成干净的 24×24、16 色像素画。图片不会上传。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
