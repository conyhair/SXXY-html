import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const output = join(process.cwd(), "pages-dist");

test("builds a self-contained GitHub Pages app under the repository base path", () => {
  const htmlPath = join(output, "index.html");
  assert.ok(existsSync(htmlPath));
  const html = readFileSync(htmlPath, "utf8");
  assert.match(html, /<title>巡展像素小工具｜免登录版<\/title>/);
  assert.match(html, /\/SXXY-html\/assets\//);
  assert.ok(existsSync(join(output, "tour-pixel-logo.png")));
  assert.ok(existsSync(join(output, "angelina", "camera.gif")));
  assert.ok(existsSync(join(output, "angelina", "paper-plane.png")));
  assert.doesNotMatch(html, /signin-with-chatgpt|oai-authenticated-user/i);
});
