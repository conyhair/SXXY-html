import assert from "node:assert/strict";
import test from "node:test";
import {
  OFFICIAL_PALETTE,
  clampCrop,
  initialCrop,
  matchingPixelIndexes,
  officialPalettePosition,
  quantizePixels,
  quantizeToFixedPalette,
  sourceRect,
} from "../app/pixelate.ts";

test("centers a square crop inside wide and tall images", () => {
  assert.deepEqual(sourceRect(1200, 800, initialCrop(1200, 800)), { x: 200, y: 0, size: 800 });
  assert.deepEqual(sourceRect(800, 1200, initialCrop(800, 1200)), { x: 0, y: 200, size: 800 });
});

test("clamps zoom and center so the crop never reveals empty pixels", () => {
  const clamped = clampCrop(1000, 600, { centerX: -500, centerY: 900, zoom: 20 });
  assert.deepEqual(clamped, { centerX: 75, centerY: 525, zoom: 4 });
});

test("keeps a solid color unchanged", () => {
  const pixels = new Uint8ClampedArray(24 * 24 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels.set([240, 80, 40, 255], index);
  }
  const result = quantizePixels(pixels, 16);
  assert.deepEqual(result.palette, ["#f05028"]);
  assert.deepEqual(result.data, pixels);
});

test("quantizes a gradient deterministically to each selectable palette size", () => {
  const pixels = new Uint8ClampedArray(24 * 24 * 4);
  for (let index = 0; index < 24 * 24; index += 1) {
    const offset = index * 4;
    pixels[offset] = (index * 17) % 256;
    pixels[offset + 1] = (index * 31) % 256;
    pixels[offset + 2] = (index * 47) % 256;
    pixels[offset + 3] = 255;
  }
  for (const size of [8, 16, 24, 32]) {
    const first = quantizePixels(pixels, size);
    const second = quantizePixels(pixels, size);
    assert.ok(first.palette.length <= size);
    assert.deepEqual(first.palette, second.palette);
    assert.deepEqual(first.data, second.data);
    const colors = new Set<string>();
    for (let index = 0; index < first.data.length; index += 4) {
      colors.add(`${first.data[index]},${first.data[index + 1]},${first.data[index + 2]}`);
      assert.equal(first.data[index + 3], 255);
    }
    assert.ok(colors.size <= size);
  }
});

test("maps every pixel exclusively to the official palette", () => {
  const pixels = new Uint8ClampedArray([
    20, 22, 24, 120,
    250, 151, 113, 255,
    78, 173, 163, 255,
    40, 55, 98, 255,
  ]);
  const first = quantizeToFixedPalette(pixels, OFFICIAL_PALETTE);
  const second = quantizeToFixedPalette(pixels, OFFICIAL_PALETTE);
  const allowed = new Set(OFFICIAL_PALETTE.map((color) => color.toUpperCase()));
  assert.deepEqual(first, second);
  assert.ok(first.palette.every((color) => allowed.has(color.toUpperCase())));
  for (let index = 0; index < first.data.length; index += 4) {
    const color = `#${[first.data[index], first.data[index + 1], first.data[index + 2]]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`.toUpperCase();
    assert.ok(allowed.has(color));
    assert.equal(first.data[index + 3], 255);
  }
});

test("numbers the official palette as ten rows by four columns", () => {
  assert.deepEqual(officialPalettePosition(OFFICIAL_PALETTE[0]), { row: 1, column: 1 });
  assert.deepEqual(officialPalettePosition(OFFICIAL_PALETTE[23]), { row: 6, column: 4 });
  assert.deepEqual(officialPalettePosition(OFFICIAL_PALETTE[24]), { row: 7, column: 1 });
  assert.deepEqual(officialPalettePosition(OFFICIAL_PALETTE[39]), { row: 10, column: 4 });
  assert.equal(officialPalettePosition("#000000"), null);
});

test("finds every pixel with the selected color", () => {
  const imageData = {
    width: 3,
    height: 2,
    data: new Uint8ClampedArray([
      34, 34, 34, 255,
      255, 255, 255, 255,
      34, 34, 34, 255,
      211, 47, 54, 255,
      34, 34, 34, 255,
      255, 255, 255, 255,
    ]),
  };
  assert.deepEqual(matchingPixelIndexes(imageData, 0, 0), [0, 2, 4]);
  assert.deepEqual(matchingPixelIndexes(imageData, 2, 1), [1, 5]);
  assert.deepEqual(matchingPixelIndexes(imageData, 3, 0), []);
});
