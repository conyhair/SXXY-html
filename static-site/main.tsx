import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PixelStudio } from "../app/PixelStudio";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("找不到页面根节点");

createRoot(root).render(
  <StrictMode>
    <PixelStudio />
  </StrictMode>,
);
