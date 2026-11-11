---
title: "两天学习计划"
order: 2
description: "每天 5–8 小时,两天建立光线追踪的完整认识"
kind: original
---

目标:两天结束时,能讲清楚光线追踪的原理、BVH 为什么快、软件光追和硬件光追的区别,并能读懂一个 Vulkan 硬件光追程序。

## 第 1 天:原理与软件实现(约 6–7 小时)

| 时长 | 内容 | 阅读 |
|---|---|---|
| 1.5h | 光线、相机、球体相交、法线 | [Ray Tracing in One Weekend](/rt-docs/01-rtiow/01-overview/) 第 1–6 章 |
| 1.5h | 抗锯齿、漫反射、金属、电介质、相机、景深 | 同书第 7–14 章(以理解为主,可以略读推导) |
| 1h | 光线与三角形相交(Möller–Trumbore)和 AABB 相交 | [三角形与 AABB 相交](/rt-docs/05-notes/01-ray-triangle-intersection/) |
| 1h | BVH 的构建与遍历 | [The Next Week:BVH](/rt-docs/02-tnw-bvh/01-bvh/) |
| 1–1.5h | SAH 和更快的 BVH | [BVH 与 SAH](/rt-docs/05-notes/02-bvh-sah/) |

**当天自测:**

- 不看资料,说出一个像素从“发出光线”到“写入颜色”的完整流程。
- 说出 BVH 为什么能把每条光线的相交测试从 $O(N)$ 降到约 $O(\log N)$。
- 说出阴影光线的起点为什么要沿法线偏移一点。

## 第 2 天:Vulkan 硬件光线追踪(约 6–7 小时)

| 时长 | 内容 | 阅读 |
|---|---|---|
| 1h | 硬件光追的整体图景、Ray Query 与光追管线 | [Ray Query 与光追管线对比](/rt-docs/05-notes/03-ray-query-vs-pipeline/) |
| 1h | 从光栅化到光线追踪、BLAS/TLAS、SBT 概览 | [NVIDIA 教程](/rt-docs/03-nvidia-tutorial/01-introduction/) 前 4 页 |
| 2h | 跟着教程一步步搭建:加速结构 → 管线 → 着色器 → 渲染 | NVIDIA 教程 Phase 1–8 |
| 1h | 深入加速结构和 SBT | [NVIDIA 概念详解](/rt-docs/04-nvidia-concepts/01-acceleration-structures/) |
| 1h | 读一份短小的完整代码 | [Sascha Willems 示例导读](/rt-docs/05-notes/04-sascha-samples-guide/) |

**当天自测:**

- 说出“软件 BVH 遍历”“Ray Query”“光追管线”三者分别由谁来遍历加速结构、由谁来决定命中后做什么。
- 说出 SBT 是什么,以及为什么 Ray Query 不需要它。
- 说出为什么需要 BLAS 和 TLAS 两层。

## 建议

- 第 1 天最好边看边写代码,哪怕只写到“画出一个球”,理解也会深很多。
- 数学推导卡住时,先记住结论往下读,第 2 天有空再回头补。
- 每天留 1 小时机动时间,用来回看没读懂的部分。
