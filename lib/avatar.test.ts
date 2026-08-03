import { describe, it, expect } from "vitest";
import { clampOffset, coverScale, cropRect } from "./avatar";

// A 1200x800 landscape photo shown in a 300px square. At zoom 1 the short side
// (800) fills the square, so 1 source px = 0.375 screen px.
const landscape = { width: 1200, height: 800 };
const V = 300;

describe("coverScale", () => {
  it("fits the short side to the viewport", () => {
    expect(coverScale(landscape, V)).toBeCloseTo(0.375);
    expect(coverScale({ width: 800, height: 1200 }, V)).toBeCloseTo(0.375);
  });
});

describe("clampOffset", () => {
  it("leaves a centred image alone", () => {
    // Centred: (300 - 1200*0.375) / 2 = -75
    const view = { offsetX: -75, offsetY: 0, zoom: 1 };
    expect(clampOffset(landscape, V, view)).toEqual({ offsetX: -75, offsetY: 0 });
  });

  it("refuses to drag past an edge", () => {
    expect(clampOffset(landscape, V, { offsetX: 40, offsetY: 20, zoom: 1 })).toEqual({
      offsetX: 0,
      offsetY: 0,
    });
    // Furthest left is 300 - 1200*0.375 = -150.
    expect(clampOffset(landscape, V, { offsetX: -900, offsetY: 0, zoom: 1 }).offsetX).toBe(-150);
  });
});

describe("cropRect", () => {
  it("takes the centre square of a landscape photo at zoom 1", () => {
    const r = cropRect(landscape, V, { offsetX: -75, offsetY: 0, zoom: 1 });
    expect(r.size).toBeCloseTo(800);
    expect(r.x).toBeCloseTo(200); // (1200 - 800) / 2
    expect(r.y).toBeCloseTo(0);
  });

  it("halves the crop when you zoom in twice", () => {
    const r = cropRect(landscape, V, { offsetX: -150, offsetY: -400, zoom: 2 });
    expect(r.size).toBeCloseTo(400);
    expect(r.x).toBeCloseTo(200);
    expect(r.y).toBeCloseTo(400);
  });

  it("never reads outside the source image", () => {
    const r = cropRect(landscape, V, { offsetX: 999, offsetY: 999, zoom: 1 });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0);
    expect(r.x + r.size).toBeLessThanOrEqual(landscape.width);
    expect(r.y + r.size).toBeLessThanOrEqual(landscape.height);
  });
});
