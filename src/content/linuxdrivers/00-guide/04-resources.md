---
title: "参考资料"
order: 4
description: "Linux 驱动开发的教程、官方文档、书籍和工具,按阅读顺序排列"
kind: original
---

按推荐的阅读顺序排列。内核 API 变化很快,**优先看持续更新的资料**,老书用来理解概念。

## 入门

| 资料 | 说明 |
|---|---|
| [The Linux Kernel Module Programming Guide](https://sysprog21.github.io/lkmpg/)(LKMPG) | 免费,持续更新到 6.x 内核。从 hello 模块、参数、字符设备、`/proc`、`sysfs` 讲到中断,正好对应本站前几课。**最推荐的第一本**。 |
| [Linux Kernel Labs](https://linux-kernel-labs.github.io/) | 大学课程配套实验,同样基于 QEMU 环境,每章有练习题。 |

## 驱动核心

| 资料 | 说明 |
|---|---|
| [How To Write Linux PCI Drivers](https://docs.kernel.org/PCI/pci.html) | 官方 PCI 驱动指南,对照 [edu 驱动导读](/linux-docs/02-notes/02-edu-pci-driver/)阅读。 |
| [Driver implementer's API guide](https://docs.kernel.org/driver-api/) | 官方驱动 API 文档:设备模型、devres、中断、DMA 等。 |
| [Bootlin 内核与驱动培训](https://bootlin.com/training/kernel/) | 免费的讲义和实验,质量很高,偏嵌入式。 |
| [Linux Device Drivers, 3rd Edition](https://lwn.net/Kernel/LDD3/)(LDD3) | 经典教材,免费在线阅读。基于 2.6.10 内核,API 已经很旧,适合理解概念。 |

## 工具与参考

| 资料 | 说明 |
|---|---|
| [Elixir Cross Referencer](https://elixir.bootlin.com/linux/v6.18.63/source) | 在线浏览内核源码,点击符号就能跳转到定义和所有引用。 |
| [QEMU edu 设备说明](https://www.qemu.org/docs/master/specs/edu.html) | edu 教学设备的寄存器定义。 |
| [Debugging kernel and modules via gdb](https://docs.kernel.org/dev-tools/gdb-kernel-debugging.html) | 官方 gdb 调试内核指南,`lx-*` 命令的说明。 |
| [LWN.net](https://lwn.net/Kernel/) | 内核开发新闻和深度文章,很多 API 的设计动机只在这里有解释。 |
| [kernel.org](https://www.kernel.org/) | 内核源码下载和版本信息。 |

## 进阶:GPU 驱动

| 资料 | 说明 |
|---|---|
| [Linux GPU Driver Developer's Guide](https://docs.kernel.org/gpu/) | DRM 框架文档:KMS、GEM、调度器等。 |
| [drm/amdgpu AMDgpu driver](https://docs.kernel.org/gpu/amdgpu/) | amdgpu 驱动文档:IP 块、显示核心、调试接口。 |
