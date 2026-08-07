import assert from "node:assert/strict";
import test from "node:test";
import { clampCrop, initialCrop, quantizePixels, sourceRect } from "../app/pixelate.ts";

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
