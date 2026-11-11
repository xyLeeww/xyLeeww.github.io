---
title: "术语表"
order: 3
description: "全站统一使用的中英文术语对照"
kind: original
---

全站译文统一使用下表的译法。第一次出现时一般写成“中文(English)”,之后只写中文或常用缩写。

## 基础概念

| English | 中文 |
|---|---|
| ray | 光线 |
| ray tracing / ray tracer | 光线追踪 / 光线追踪器 |
| path tracing | 路径追踪 |
| rasterization | 光栅化 |
| camera / viewport | 相机 / 视口 |
| pixel / sample | 像素 / 采样(样本) |
| antialiasing | 抗锯齿 |
| field of view (FOV) | 视场角(FOV) |
| defocus blur / depth of field | 散焦模糊 / 景深 |
| hit, intersection | 命中、相交(交点) |
| hittable | 可命中物体(hittable) |
| surface normal | 表面法线 |
| front face / back face | 正面 / 背面 |
| gamma correction / linear space | 伽马校正 / 线性空间 |
| shadow ray / shadow acne | 阴影光线 / 阴影痤疮(shadow acne) |

## 材质与光照

| English | 中文 |
|---|---|
| material | 材质 |
| diffuse / Lambertian | 漫反射 / 朗伯(Lambertian) |
| metal / fuzz | 金属 / 模糊度(fuzz) |
| dielectric | 电介质 |
| reflection / refraction | 反射 / 折射 |
| refractive index | 折射率 |
| Snell's law | 斯涅尔定律 |
| total internal reflection | 全内反射 |
| Schlick approximation | Schlick 近似 |
| attenuation / albedo | 衰减 / 反照率(albedo) |
| Monte Carlo / importance sampling | 蒙特卡洛 / 重要性采样 |

## 加速结构

| English | 中文 |
|---|---|
| bounding volume | 包围体 |
| bounding volume hierarchy (BVH) | 包围体层次结构(BVH) |
| axis-aligned bounding box (AABB) | 轴对齐包围盒(AABB) |
| slab | 平板(slab) |
| interval | 区间 |
| surface area heuristic (SAH) | 表面积启发式(SAH) |
| traversal | 遍历 |
| acceleration structure (AS) | 加速结构 |
| bottom-level AS (BLAS) | 底层加速结构(BLAS) |
| top-level AS (TLAS) | 顶层加速结构(TLAS) |
| instance | 实例 |
| compaction | 压缩(compaction) |
| scratch buffer | 暂存缓冲区(scratch buffer) |

## Vulkan 光线追踪

| English | 中文 |
|---|---|
| ray tracing pipeline | 光线追踪管线 |
| ray query | 光线查询(Ray Query) |
| shader binding table (SBT) | 着色器绑定表(SBT) |
| shader group / shader group handle | 着色器组 / 着色器组句柄 |
| ray generation shader (raygen) | 光线生成着色器(raygen) |
| closest-hit shader | 最近命中着色器(closest-hit) |
| any-hit shader | 任意命中着色器(any-hit) |
| miss shader | 未命中着色器(miss) |
| intersection shader | 相交着色器(intersection) |
| callable shader | 可调用着色器(callable) |
| payload | 负载(payload) |
| hit group | 命中组(hit group) |
| descriptor set / push constant | 描述符集 / 推送常量 |
| command buffer / barrier | 命令缓冲区 / 屏障(barrier) |
| device address | 设备地址 |
