---
title: "1. 简介(Introduction)"
order: 1
description: "Vulkan 光线追踪教程(v2)总览:两种实现方式、教程理念、前置条件、目录、准备工作与学习目标"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Introduction"
license: "Apache-2.0"
---

> **代码仓库**:[github.com/nvpro-samples/vk_raytracing_tutorial_KHR](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR)  
> **作者**:Martin-Karl Lefrançois,NVIDIA

## 从光栅化逐步转换到光线追踪

| 转换前 | 转换后 |
| ------ | ----- |
| ![转换前:光栅化渲染的场景](/raytracing/nvidia/01.png) | ![转换后:光线追踪渲染的场景](/raytracing/nvidia/02.png) |

## 简介

这份完整的教程演示了如何把一个现代的 Vulkan 1.4 光栅化(rasterization)应用程序逐步改造成使用光线追踪(ray tracing)。我们会把 `01_foundation` 示例(使用传统的顶点/片元着色器)通过 **8 个循序渐进的阶段** 转换成 `02_basic`(使用光线追踪管线),每个阶段结束时程序都可以编译、可以测试。

### 两种实现方式

本系列教程为同一套光线追踪概念提供了 **两种不同的实现**:

- [**`02_basic`**](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/tree/v2/raytrace_tutorial/02_basic) —— 出于教学目的,**直接调用 Vulkan API**,在不借助辅助库的情况下展示完整的光线追踪实现
- [**`02_basic_nvvk`**](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/tree/v2/raytrace_tutorial/02_basic_nvvk) —— 使用 **nvpro-core2 辅助库**(`nvvk::AccelerationStructureHelper` 和 `nvvk::SBTGenerator`)来简化开发

**这份渐进式教程聚焦于直接调用 Vulkan 的方式**(`02_basic`),以便讲清楚基础原理。系列中后续的所有教程都使用辅助库版本(`02_basic_nvvk`),以获得更好的性能和可维护性。

### 教程理念

本教程的设计核心是 **渐进式编译**:

- 每个阶段结束时,应用程序都能编译通过
- 读者在每一步都能看到逐步的进展
- 清晰的检查点(checkpoint)便于测试和验证
- 可视化的反馈能直观显示与上一阶段相比发生了什么变化

### 前置条件

- 支持光线追踪扩展的 Vulkan 1.4+
- 支持 `VK_KHR_ray_tracing_pipeline` 的显卡
- nvpro-core2 框架
- CMake 构建系统
- 对 Vulkan 的基本概念有一定了解

## 目录

1. **设置说明(Setup Instructions)**(见本页下文)—— 创建工作副本并验证能否构建
2. **[理解加速结构:BLAS 与 TLAS](/rt-docs/03-nvidia-tutorial/03-blas-tlas/)** —— 学习光线追踪所用数据结构的基础知识
3. **[理解着色器绑定表(SBT)](/rt-docs/03-nvidia-tutorial/04-sbt-overview/)** —— 了解光线追踪着色器是如何组织和执行的
4. **[渲染相关缩写与概念](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/concepts/rendering.md)** —— 用浅白的语言讲解 BRDF、BSDF、PDF、NEE、MIS 等概念
5. **[阶段 1:基础设置](/rt-docs/03-nvidia-tutorial/05-phase1-foundation/)** —— 添加光线追踪头文件并启用扩展
6. **[阶段 2:加速结构基础设施](/rt-docs/03-nvidia-tutorial/06-phase2-as-infrastructure/)** —— 搭建创建 BLAS/TLAS 的辅助函数
7. **[阶段 3:基本加速结构](/rt-docs/03-nvidia-tutorial/07-phase3-basic-as/)** —— 创建并构建加速结构
8. **[阶段 4:光线追踪管线设置](/rt-docs/03-nvidia-tutorial/08-phase4-rt-pipeline/)** —— 创建管线和 SBT 基础设施
9. **[阶段 5:基本的光线追踪着色器](/rt-docs/03-nvidia-tutorial/09-phase5-shaders/)** —— 实现最简单的光线追踪着色器
10. **[阶段 6:集成与渲染](/rt-docs/03-nvidia-tutorial/10-phase6-integration/)** —— 用光线追踪替换光栅化
11. **[阶段 7:材质着色](/rt-docs/03-nvidia-tutorial/11-phase7-material/)** —— 加入正确的 PBR 材质着色
12. **[阶段 8:光照与阴影](/rt-docs/03-nvidia-tutorial/12-phase8-lighting/)** —— 加入真实感光照和阴影投射
13. **[教程完成总结](/rt-docs/03-nvidia-tutorial/13-summary-helpers/)** —— 回顾你完成了什么,以及下一步做什么

> **译注**:原文是单个长文档,本站将其拆分成多个页面。原文目录中没有单独列出的“概述:从光栅化到光线追踪”一节,在本站是 [第 2 页](/rt-docs/03-nvidia-tutorial/02-raster-to-rt/)。

## 设置说明

开始之前,请务必先完成[准备工作(setup)](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/getting-started/setup.md)。

### 教程工作流程

**逐阶段推进的做法:**

1. **从工作副本开始**:始终在 `01_foundation_copy/` 中工作
2. **按阶段进行**:按照教程中的说明进行修改
3. **每个阶段之后都要测试**:编译并运行,确认进展
4. **必要时进行对比**:需要时参考 `01_foundation/` 或 `02_basic/`

**需要修改的文件:**

- **`01_foundation.cpp`**:主源文件,包含对类的修改
- **`shaders/rtbasic.slang`**:新的光线追踪着色器文件(在阶段 5 中创建)
- **`CMakeLists.txt`**:可能需要为新的着色器做少量更新

### 教程导航

出于以下几个原因,本教程被设计成 **一份完整的单一文档**:

- **渐进式学习**:从头到尾看到完整的转换过程
- **跨阶段引用**:每个阶段都自然地建立在之前的阶段之上
- **上下文完整**:所有信息集中在一处,便于查阅
- **便于搜索**:用 Ctrl+F 就能在所有阶段中查找特定概念
- **导航更方便**:带锚点链接的目录用起来很顺手

**导航提示:**

- 使用上面的目录跳转到特定阶段
- 每个阶段都有清晰的“下一步(What's Next)”小节
- 代码修改都清楚地标明了文件路径
- 每个阶段之后都提供了编译检查点

> **译注**:本站把原文拆成了多页,使用上面的目录或页面导航在各阶段之间跳转即可;如需全文搜索,可以查看[英文原文](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md)。

### 你将学到什么

完成本教程后,你将理解:

- 如何在 Vulkan 中启用光线追踪扩展
- 加速结构(acceleration structure)的创建与管理
- 光线追踪管线(ray tracing pipeline)的设置以及着色器绑定表(shader binding table)
- 如何从光栅化转换到基于光线的渲染
- 开发复杂功能时的渐进式开发方法
