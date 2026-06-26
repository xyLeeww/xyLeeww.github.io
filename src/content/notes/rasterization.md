---
title: "Rasterization Fundamentals"
date: 2026-06-18
description: "The full rasterization stage: from triangle traversal to fragment shading."
tags: ["Graphics", "Rasterization"]
---

## What Is Rasterization?

Rasterization is the process of converting continuous geometric primitives (typically triangles) into discrete pixel fragments. It is one of the most critical steps in the real-time rendering pipeline.

## Basic Pipeline

1. **Triangle Setup** — Compute edge equation coefficients
2. **Triangle Traversal** — Determine which pixels are covered by the triangle
3. **Fragment Shading** — Execute shading computations for each fragment
4. **Output Merger** — Depth test, stencil test, blending

## Edge Function Method

To determine whether a point $(x, y)$ lies inside a triangle, evaluate three edge equations:

```
E01(x, y) = (x - x0)(y1 - y0) - (y - y0)(x1 - x0)
E12(x, y) = (x - x1)(y2 - y1) - (y - y1)(x2 - x1)
E20(x, y) = (x - x2)(y0 - y2) - (y - y2)(x0 - x2)
```

When all three edge functions have the same sign, the point is inside the triangle.

## Barycentric Coordinate Interpolation

Fragment attributes (color, UV, normals, etc.) are interpolated using barycentric coordinates `(λ0, λ1, λ2)`:

```
attr = λ0 * attr0 + λ1 * attr1 + λ2 * attr2
```

Note: perspective-correct interpolation is needed—naïve linear interpolation in screen space causes texture distortion.

## Performance Optimizations

- **Tile-based Rasterization** — Divide the screen into tiles and process per-tile
- **Hierarchical Traversal** — Coarse-grained culling first, then fine-grained testing
- **Early-Z** — Perform depth test before fragment shading to skip occluded fragments
