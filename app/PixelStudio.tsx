"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type CropState,
  type PaletteSize,
  type PixelationResult,
  DEFAULT_MAX_COLORS,
  OUTPUT_SIZE,
  PALETTE_SIZES,
  clampCrop,
  cropSize,
  initialCrop,
  renderPixelation,
  sourceRect,
} from "./pixelate";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const EDITOR_SIZE = 640;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface SourceImage {
  element: HTMLImageElement;
  width: number;
  height: number;
  name: string;
  url: string;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  crop: CropState;
}

interface PinchState { distance: number; zoom: number }

function safeName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();
  return (withoutExtension || "pixel-art").replace(/[\\/:*?"<>|]+/g, "-");
}

export function PixelStudio() {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [crop, setCrop] = useState<CropState>({ centerX: 0, centerY: 0, zoom: 1 });
  const [background, setBackground] = useState("#ffffff");
  const [colorCount, setColorCount] = useState<PaletteSize>(DEFAULT_MAX_COLORS);
  const [result, setResult] = useState<PixelationResult | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("等待图片");
  const [draggingOver, setDraggingOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const currentUrlRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<PinchState | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("pixel-studio-background");
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) setBackground(saved);
    return () => {
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setError("");
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("请选择 PNG、JPEG 或 WebP 图片。GIF 和 SVG 暂不支持。");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("图片超过 20 MB，请压缩后再试。");
      return;
    }

    setStatus("正在读取图片…");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      await image.decode();
      if (image.naturalWidth > MAX_DIMENSION || image.naturalHeight > MAX_DIMENSION) {
        throw new Error("图片最长边不能超过 4096 像素。");
      }
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = url;
      const nextSource = {
        element: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: file.name,
        url,
      };
      setSource(nextSource);
      setCrop(initialCrop(nextSource.width, nextSource.height));
      setStatus("正在生成…");
    } catch (reason) {
      URL.revokeObjectURL(url);
      setError(reason instanceof Error ? reason.message : "图片解码失败，请更换文件后重试。");
      setStatus("读取失败");
    }
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((item) =>
        ACCEPTED_TYPES.has(item.type),
      );
      if (file) void loadFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  useEffect(() => {
    if (!source) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      try {
        const nextResult = renderPixelation(source.element, source.width, source.height, crop, {
          size: OUTPUT_SIZE,
          maxColors: colorCount,
          backgroundColor: background,
        });
        setResult(nextResult);
        setStatus("已生成 24×24 像素画");
      } catch {
        setError("生成失败，请重新选择图片。");
        setStatus("生成失败");
      }
    });
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [background, colorCount, crop, source]);

  useEffect(() => {
    const canvas = editorRef.current;
    if (!canvas || !source) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = sourceRect(source.width, source.height, crop);
    context.fillStyle = background;
    context.fillRect(0, 0, EDITOR_SIZE, EDITOR_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source.element,
      rect.x,
      rect.y,
      rect.size,
      rect.size,
      0,
      0,
      EDITOR_SIZE,
      EDITOR_SIZE,
    );
  }, [background, crop, source]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !result) return;
    const context = canvas.getContext("2d");
    context?.putImageData(result.imageData, 0, 0);
  }, [result]);

  const updateZoom = (zoom: number) => {
    if (!source) return;
    setCrop((current) => clampCrop(source.width, source.height, { ...current, zoom }));
  };

  const pointerDistance = () => {
    const points = [...pointersRef.current.values()];
    return points.length < 2 ? 0 : Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y,
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!source) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop };
    } else if (pointersRef.current.size === 2) {
      dragRef.current = null;
      pinchRef.current = { distance: pointerDistance(), zoom: crop.zoom };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!source || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const distance = pointerDistance();
      updateZoom(pinchRef.current.zoom * (distance / Math.max(1, pinchRef.current.distance)));
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const viewport = Math.max(1, event.currentTarget.getBoundingClientRect().width);
    const size = cropSize(source.width, source.height, drag.crop.zoom);
    setCrop(clampCrop(source.width, source.height, {
      ...drag.crop,
      centerX: drag.crop.centerX - ((event.clientX - drag.x) / viewport) * size,
      centerY: drag.crop.centerY - ((event.clientY - drag.y) / viewport) * size,
    }));
  };

  const endPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    dragRef.current = null;
    pinchRef.current = null;
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (!source) return;
    event.preventDefault();
    updateZoom(crop.zoom * Math.exp(-event.deltaY * 0.0015));
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!source) return;
    const size = cropSize(source.width, source.height, crop.zoom);
    const step = size * (event.shiftKey ? 0.08 : 0.025);
    let next = crop;
    if (event.key === "ArrowLeft") next = { ...crop, centerX: crop.centerX - step };
    else if (event.key === "ArrowRight") next = { ...crop, centerX: crop.centerX + step };
    else if (event.key === "ArrowUp") next = { ...crop, centerY: crop.centerY - step };
    else if (event.key === "ArrowDown") next = { ...crop, centerY: crop.centerY + step };
    else if (event.key === "+" || event.key === "=") next = { ...crop, zoom: crop.zoom + 0.1 };
    else if (event.key === "-") next = { ...crop, zoom: crop.zoom - 0.1 };
    else if (event.key === "0") next = initialCrop(source.width, source.height);
    else return;
    event.preventDefault();
    setCrop(clampCrop(source.width, source.height, next));
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const download = () => {
    if (!result || !source) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.putImageData(result.imageData, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeName(source.name)}-24x24.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }, "image/png");
  };

  const chooseFile = () => inputRef.current?.click();

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="像素工坊首页">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>像素工坊</span>
        </a>
        <div className="privacy-pill"><span aria-hidden="true">●</span> 图片只在你的浏览器中处理</div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">PIXEL ART MAKER · 24 × 24</p>
          <h1>把一张照片，<br />压进 <em>576</em> 个像素。</h1>
        </div>
        <div className="hero-side">
          <div className="mascot-card">
            <img className="mascot-stars" src="/angelina/stars.png" alt="" aria-hidden="true" />
            <picture>
              <source media="(prefers-reduced-motion: reduce)" srcSet="/angelina/camera.png" />
              <img className="mascot" src="/angelina/camera.gif" alt="Angelina 拿着相机记录灵感" />
            </picture>
            <span>把灵感拍成像素 ✦</span>
          </div>
          <p className="hero-copy">裁好构图，挑一个底色和颜色数量。我们会从你的图片中提取最多 {colorCount} 种代表色，生成干净、可下载的 24×24 像素画。</p>
        </div>
      </section>

      <section className="studio" aria-label="像素画生成工作台">
        <article className="panel editor-panel">
          <div className="panel-heading">
            <div><span className="step">01</span><h2>选择与裁剪</h2></div>
            {source && <button className="text-button" type="button" onClick={chooseFile}>更换图片</button>}
          </div>

          <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={onInput} />

          {!source ? (
            <div
              className={`dropzone ${draggingOver ? "is-dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDraggingOver(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={onDrop}
            >
              <img className="dropzone-stars" src="/angelina/stars.png" alt="" aria-hidden="true" />
              <div className="upload-art" aria-hidden="true"><span>24</span><b>×</b><span>24</span></div>
              <h3>从一张图片开始</h3>
              <p>拖放、粘贴，或者从设备中选择图片</p>
              <button className="primary-button" type="button" onClick={chooseFile}>选择图片</button>
              <small>PNG · JPEG · WEBP　最大 20 MB</small>
            </div>
          ) : (
            <>
              <div className="crop-frame">
                <canvas
                  ref={editorRef}
                  width={EDITOR_SIZE}
                  height={EDITOR_SIZE}
                  tabIndex={0}
                  role="application"
                  aria-label="正方形裁剪区。拖动图片调整位置，滚轮或加减键缩放，方向键微调。"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  onWheel={onWheel}
                  onKeyDown={onEditorKeyDown}
                />
                <div className="crop-grid" aria-hidden="true" />
                <span className="corner corner-a" /><span className="corner corner-b" />
                <span className="corner corner-c" /><span className="corner corner-d" />
              </div>
              <div className="controls-row">
                <label className="zoom-control">
                  <span>缩放</span>
                  <input type="range" min="1" max="4" step="0.01" value={crop.zoom} onChange={(event) => updateZoom(Number(event.target.value))} />
                  <output>{crop.zoom.toFixed(2)}×</output>
                </label>
                <label className="color-control">
                  <span>背景色</span>
                  <span className="color-input-wrap" style={{ background }}>
                    <input
                      type="color"
                      value={background}
                      aria-label="选择输出背景色"
                      onChange={(event) => {
                        setBackground(event.target.value);
                        window.localStorage.setItem("pixel-studio-background", event.target.value);
                      }}
                    />
                  </span>
                  <code>{background.toUpperCase()}</code>
                </label>
                <label className="palette-control">
                  <span>颜色数</span>
                  <select
                    value={colorCount}
                    aria-label="选择像素画最大颜色数"
                    onChange={(event) => setColorCount(Number(event.target.value) as PaletteSize)}
                  >
                    {PALETTE_SIZES.map((size) => <option key={size} value={size}>{size} 色</option>)}
                  </select>
                </label>
              </div>
              <p className="editor-help">拖动调整构图 · 滚轮或双指缩放 · 方向键微调 · 按 0 复位</p>
            </>
          )}

          {error && <div className="error-message" role="alert">{error}</div>}
        </article>

        <article className="panel result-panel">
          <div className="panel-heading">
            <div><span className="step">02</span><h2>像素结果</h2></div>
            <span className={`status-dot ${result ? "ready" : ""}`}>{status}</span>
          </div>
          <div className={`result-stage ${result ? "has-result" : ""}`}>
            {result ? (
              <canvas ref={previewRef} width={OUTPUT_SIZE} height={OUTPUT_SIZE} aria-label="生成的 24×24 像素画预览" />
            ) : (
              <div className="empty-result" aria-hidden="true"><span /><span /><span /><span /><b>24</b></div>
            )}
          </div>
          <div className="result-meta">
            <div><span>画布</span><strong>24 × 24 px</strong></div>
            <div><span>色彩</span><strong>自适应 {colorCount} 色</strong></div>
            <div><span>格式</span><strong>PNG</strong></div>
          </div>
          <div className="palette-block">
            <div className="palette-title"><span>当前调色板</span><small>{result?.palette.length ?? 0} / {colorCount}</small></div>
            <div
              className="palette"
              aria-label="当前调色板颜色"
              style={{ gridTemplateColumns: `repeat(${Math.min(colorCount, 16)}, 1fr)` }}
            >
              {(result?.palette ?? Array.from({ length: colorCount }, () => "#e8e5df")).map((color, index) => (
                <span key={`${color}-${index}`} style={{ background: color }} title={result ? color.toUpperCase() : undefined} />
              ))}
            </div>
          </div>
          <button className="download-button" type="button" disabled={!result} onClick={download}>
            <span>下载 24×24 PNG</span><b aria-hidden="true">↓</b>
          </button>
          <p className="download-note">下载的是未经放大的真实 24×24 像素图</p>
        </article>
      </section>

      <footer>
        <div>
          <p>本地处理 · 不上传 · 不留存</p>
          <p>576 pixels, one tiny story.</p>
        </div>
        <img src="/angelina/paper-plane.png" alt="Angelina 乘纸飞机出发" />
      </footer>
    </main>
  );
}
