---
title: "1. 概述(Overview)"
order: 1
description: "本书的目标、代码风格约定、预备知识以及获取帮助的途径"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#overview"
sourceTitle: "Ray Tracing in One Weekend · Overview"
license: "CC0 1.0"
---

**Ray Tracing in One Weekend**(《一周末学会光线追踪》),作者:[Peter Shirley](https://github.com/petershirley)、[Trevor David Black](https://github.com/trevordblack)、[Steve Hollasch](https://github.com/hollasch)。版本 4.0.2,2025-04-25。Copyright 2018-2024 Peter Shirley. All rights reserved.

> **译注**:和原书一样,代码清单中**绿色背景、行首带 `+`** 的行是本次新增或修改的代码,**红色背景、行首带 `-`** 的行是需要删掉的代码,其余是为了定位而保留的上下文。
这些年来我教过很多图形学课程。我经常用光线追踪(ray tracing)来教,因为这样你不得不亲手写出所有代码,但即使不借助任何 API,依然能得到很酷的图像。我决定把自己的课程讲义改编成一份教程,让你尽快写出一个很酷的程序。它不会是一个功能完备的光线追踪器,但它确实具备间接光照——正是这一点让光线追踪成为电影制作的主力技术。按照这些步骤去做,如果你兴致高涨、想继续深入,你写出的光线追踪器的架构也很适合扩展成一个更完整的光线追踪器。

当有人说“光线追踪”时,它可能指很多不同的东西。我要介绍的东西在技术上属于路径追踪(path tracing),而且是相当通用的一种。虽然代码会非常简单(让计算机去干活吧!),但我想你会对自己能做出的图像非常满意。

我会按照我自己的顺序带你一步步写出一个光线追踪器,并附上一些调试技巧。到最后,你将拥有一个能生成精美图像的光线追踪器。你应该能在一个周末内完成。如果花的时间更长,也不必担心。我使用 C++ 作为主要语言,但你不一定非用它不可。不过我建议你用,因为它速度快、可移植,而且大多数电影和电子游戏的产品级渲染器都是用 C++ 写的。注意,我避开了 C++ 的大部分“现代特性”,但继承和运算符重载对光线追踪器来说实在太有用了,不能放弃。

> 我不在网上提供代码,但这些代码是真实可用的,而且除了 `vec3` 类中几个简单直接的运算符之外,我会展示全部代码。我非常相信通过亲手敲代码来学习,但当有现成代码可用时我也会直接用,所以只有在没有现成代码时,我才真正做到言行一致。所以别找我要代码!

我把上面最后这段保留了下来,因为我后来来了个 180 度大转弯,想想挺好笑的。有好几位读者遇到了一些隐蔽的错误,在我们对比代码之后才得以解决。所以请务必亲手敲代码,不过你也可以在 [GitHub 上的 RayTracing 项目](https://github.com/RayTracing/raytracing.github.io/)中找到每本书最终完成的源代码。

关于这几本书中实现代码的一点说明——我们对书中代码的理念优先考虑以下目标:

- 代码应当实现书中讲到的概念。

- 我们使用 C++,但尽可能简单。我们的编程风格非常接近 C,但在能让代码更易用或更易懂的地方,也会利用现代特性。

- 为了保持连贯,我们的编码风格尽可能沿用最初几本书所确立的风格。

- 每行长度控制在 96 个字符以内,以保持代码库与书中代码清单之间的行一致。

因此,这些代码提供的是一个基础实现,还有大量改进空间留给读者去享受。优化和现代化这些代码的方法无穷无尽;我们优先选择简单的方案。

我们假设你对向量有一点了解(比如点积和向量加法)。如果你不了解,请稍微复习一下。如果你需要复习,或者是第一次学习这些内容,可以看看 Morgan McGuire 的在线教程 [_Graphics Codex_](https://graphicscodex.com/)、Steve Marschner 和 Peter Shirley 的 _Fundamentals of Computer Graphics_,或者 J.D. Foley 和 Andy Van Dam 的 _Computer Graphics: Principles and Practice_。

关于本项目、GitHub 仓库、目录结构、构建与运行,以及如何提交或引用勘误和贡献,请参阅[项目 README](https://github.com/RayTracing/raytracing.github.io#readme) 文件。

更多与项目相关的资源,请参阅[我们的 Further Reading wiki 页面](https://github.com/RayTracing/raytracing.github.io/wiki/Further-Readings)。

这几本书经过排版,可以直接从浏览器中很好地打印出来。我们也在[每次发布](https://github.com/RayTracing/raytracing.github.io/releases/)的“Assets”部分附上了每本书的 PDF。

如果你想和我们交流,欢迎发邮件给我们:

- Peter Shirley, ptrshrl@gmail.com
- Steve Hollasch, steve@hollasch.net
- Trevor David Black, trevordblack@trevord.black

最后,如果你在实现过程中遇到问题、有一般性的疑问,或者想分享自己的想法或作品,请访问 GitHub 项目上的 [GitHub Discussions 论坛](https://github.com/RayTracing/raytracing.github.io/discussions/)。

感谢所有为本项目伸出援手的人。你可以在本书末尾的致谢部分找到他们。

我们开始吧!
