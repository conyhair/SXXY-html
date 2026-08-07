export const OUTPUT_SIZE = 24;
export const MAX_COLORS = 16;

export interface CropState {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface PixelationOptions {
  size: 24;
  maxColors: 16;
  backgroundColor: string;
}

export interface PixelationResult {
  width: 24;
  height: 24;
  imageData: ImageData;
  palette: string[];
}

interface LabColor { l: number; a: number; b: number }
interface QuantizedPixels { data: Uint8ClampedArray; palette: string[] }

export function initialCrop(width: number, height: number): CropState {
  return { centerX: width / 2, centerY: height / 2, zoom: 1 };
}

export function cropSize(width: number, height: number, zoom: number): number {
  return Math.min(width, height) / Math.max(1, Math.min(4, zoom));
}

export function clampCrop(width: number, height: number, crop: CropState): CropState {
  const zoom = Math.max(1, Math.min(4, crop.zoom));
  const size = cropSize(width, height, zoom);
  const half = size / 2;
  return {
    zoom,
    centerX: Math.max(half, Math.min(width - half, crop.centerX)),
    centerY: Math.max(half, Math.min(height - half, crop.centerY)),
  };
}

export function sourceRect(
  width: number,
  height: number,
  crop: CropState,
): { x: number; y: number; size: number } {
  const safe = clampCrop(width, height, crop);
  const size = cropSize(width, height, safe.zoom);
  return { x: safe.centerX - size / 2, y: safe.centerY - size / 2, size };
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  const normalized = clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(normalized * 255);
}

function rgbToLab(r: number, g: number, b: number): LabColor {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (value: number) => value > 0.008856
    ? Math.cbrt(value)
    : 7.787 * value + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labToRgb(color: LabColor): [number, number, number] {
  const fy = (color.l + 16) / 116;
  const fx = color.a / 500 + fy;
  const fz = fy - color.b / 200;
  const inverse = (value: number) => {
    const cube = value ** 3;
    return cube > 0.008856 ? cube : (value - 16 / 116) / 7.787;
  };
  const x = 0.95047 * inverse(fx);
  const y = inverse(fy);
  const z = 1.08883 * inverse(fz);
  return [
    linearToSrgb(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    linearToSrgb(x * -0.969266 + y * 1.8760108 + z * 0.041556),
    linearToSrgb(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  ];
}

function labDistance(left: LabColor, right: LabColor): number {
  const dl = left.l - right.l;
  const da = left.a - right.a;
  const db = left.b - right.b;
  return dl * dl + da * da + db * db;
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function quantizePixels(
  rgba: Uint8ClampedArray,
  maxColors = MAX_COLORS,
): QuantizedPixels {
  if (rgba.length % 4 !== 0) throw new Error("RGBA 数据长度无效");

  const pixels: [number, number, number][] = [];
  const unique = new Map<string, { color: [number, number, number]; count: number }>();
  for (let index = 0; index < rgba.length; index += 4) {
    const color: [number, number, number] = [rgba[index], rgba[index + 1], rgba[index + 2]];
    pixels.push(color);
    const key = color.join(",");
    const entry = unique.get(key);
    if (entry) entry.count += 1;
    else unique.set(key, { color, count: 1 });
  }

  if (unique.size <= maxColors) {
    const ordered = [...unique.values()].sort(
      (left, right) => right.count - left.count || hex(left.color).localeCompare(hex(right.color)),
    );
    return {
      data: new Uint8ClampedArray(rgba),
      palette: ordered.map(({ color }) => hex(color)),
    };
  }

  const labs = pixels.map(([r, g, b]) => rgbToLab(r, g, b));
  const frequency = [...unique.values()].sort((left, right) => right.count - left.count);
  const centroids: LabColor[] = [rgbToLab(...frequency[0].color)];

  while (centroids.length < maxColors) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < labs.length; index += 1) {
      const distance = Math.min(
        ...centroids.map((centroid) => labDistance(labs[index], centroid)),
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    centroids.push({ ...labs[bestIndex] });
  }

  const assignments = new Int16Array(labs.length).fill(-1);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    let changed = false;
    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, count: 0 }));
    for (let index = 0; index < labs.length; index += 1) {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
        const distance = labDistance(labs[index], centroids[centroidIndex]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = centroidIndex;
        }
      }
      if (assignments[index] !== nearest) changed = true;
      assignments[index] = nearest;
      const sum = sums[nearest];
      sum.l += labs[index].l;
      sum.a += labs[index].a;
      sum.b += labs[index].b;
      sum.count += 1;
    }
    sums.forEach((sum, index) => {
      if (sum.count > 0) {
        centroids[index] = {
          l: sum.l / sum.count,
          a: sum.a / sum.count,
          b: sum.b / sum.count,
        };
      }
    });
    if (!changed) break;
  }

  const rgbCentroids = centroids.map(labToRgb);
  const counts = new Array(rgbCentroids.length).fill(0);
  const output = new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < pixels.length; index += 1) {
    const centroid = assignments[index];
    const [r, g, b] = rgbCentroids[centroid];
    const offset = index * 4;
    output[offset] = r;
    output[offset + 1] = g;
    output[offset + 2] = b;
    output[offset + 3] = 255;
    counts[centroid] += 1;
  }

  const palette = rgbCentroids
    .map((color, index) => ({ color, count: counts[index] }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count)
    .map(({ color }) => hex(color))
    .filter((color, index, all) => all.indexOf(color) === index);
  return { data: output, palette };
}

function createCanvas(size: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = size;
  element.height = size;
  return element;
}

export function renderPixelation(
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  crop: CropState,
  options: PixelationOptions,
): PixelationResult {
  const rect = sourceRect(imageWidth, imageHeight, crop);
  const large = createCanvas(96);
  const largeContext = large.getContext("2d", { willReadFrequently: true });
  if (!largeContext) throw new Error("浏览器无法创建画布");
  largeContext.fillStyle = options.backgroundColor;
  largeContext.fillRect(0, 0, 96, 96);
  largeContext.imageSmoothingEnabled = true;
  largeContext.imageSmoothingQuality = "high";
  largeContext.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, 96, 96);

  const middle = createCanvas(48);
  const middleContext = middle.getContext("2d");
  if (!middleContext) throw new Error("浏览器无法创建画布");
  middleContext.imageSmoothingEnabled = true;
  middleContext.imageSmoothingQuality = "high";
  middleContext.drawImage(large, 0, 0, 48, 48);

  const output = createCanvas(options.size);
  const outputContext = output.getContext("2d", { willReadFrequently: true });
  if (!outputContext) throw new Error("浏览器无法创建画布");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(middle, 0, 0, options.size, options.size);
  const raw = outputContext.getImageData(0, 0, options.size, options.size);
  const quantized = quantizePixels(raw.data, options.maxColors);
  const imageDataArray = new Uint8ClampedArray(new ArrayBuffer(quantized.data.byteLength));
  imageDataArray.set(quantized.data);
  return {
    width: OUTPUT_SIZE,
    height: OUTPUT_SIZE,
    imageData: new ImageData(imageDataArray, options.size, options.size),
    palette: quantized.palette,
  };
}
