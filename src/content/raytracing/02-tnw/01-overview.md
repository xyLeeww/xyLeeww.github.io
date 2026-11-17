---
title: "1. 概述(Overview)"
order: 1
description: "本书的目标与内容安排:在第一本书的基础上加入纹理、体积、矩形、实例、光源和 BVH,并说明优化原则与章节顺序"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#overview"
sourceTitle: "Ray Tracing: The Next Week · Overview"
license: "CC0 1.0"
---

**Ray Tracing: The Next Week**(《光线追踪:下一周》),作者:[Peter Shirley](https://github.com/petershirley)、[Trevor David Black](https://github.com/trevordblack)、[Steve Hollasch](https://github.com/hollasch)。版本 4.0.2,2025-04-25。Copyright 2018-2024 Peter Shirley. All rights reserved.

> **译注**:本书建立在《Ray Tracing in One Weekend》的代码之上(中文译文见[第 1 本书](/rt-docs/01-rtiow/01-overview/))。和原书一样,代码清单中**绿色背景、行首带 `+`** 的行是本次新增或修改的代码,**红色背景、行首带 `-`** 的行是需要删掉的代码,其余是为了定位而保留的上下文。

在《Ray Tracing in One Weekend》中,你构建了一个简单的暴力路径追踪器(path tracer)。在这一部中,我们将加入纹理、体积(比如雾)、矩形、实例、光源,并借助 BVH 支持大量物体。完成之后,你就会拥有一个“真正的”光线追踪器。

光线追踪领域有一条很多人(包括我)都认同的经验法则:大多数优化都会让代码变复杂,却带不来多少加速。在这本小书里,我在做每一个设计决策时都会选择最简单的方案。更多与项目相关的资源,请参阅[我们的 Further Reading wiki 页面](https://github.com/RayTracing/raytracing.github.io/wiki/Further-Readings)。不过,我强烈建议你不要过早优化;如果某段代码在运行时间剖析(profile)中并不靠前,那么在所有功能都支持之前,它就不需要优化!

本书最难的两部分是 BVH 和柏林(Perlin)纹理。这也是为什么书名建议你为此花上一周而不是一个周末。不过,如果你想把它当作一个周末项目,可以把这两部分留到最后。本书中各个概念的顺序并不太重要,即使没有 BVH 和柏林纹理,你仍然能得到一个康奈尔盒(Cornell Box)!

关于本项目、GitHub 仓库、目录结构、构建与运行,以及如何提交或引用勘误和贡献,请参阅[项目 README](https://github.com/RayTracing/raytracing.github.io#readme) 文件。

这几本书经过排版,可以直接从浏览器中很好地打印出来。我们也在[每次发布](https://github.com/RayTracing/raytracing.github.io/releases/)的“Assets”部分附上了每本书的 PDF。

感谢所有为本项目伸出援手的人。你可以在本书末尾的致谢部分找到他们。

> **译注**:本站没有翻译致谢部分,请参阅[原文的致谢](https://raytracing.github.io/books/RayTracingTheNextWeek.html#acknowledgments)。
