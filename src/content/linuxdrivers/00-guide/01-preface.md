---
title: "前言"
order: 1
description: "为什么学 Linux 驱动开发,这个空间收录了什么,怎么读"
kind: original
---

我平时做的是 Windows 上的 GPU 驱动。Linux 驱动的思路和 Windows 驱动有很多相通的地方(设备枚举、MMIO、中断、DMA),但内核接口、开发流程和调试手段完全不同。这个空间记录我从零开始学 Linux 驱动开发的过程:怎么搭环境、每一课写了什么代码、踩了哪些坑。

## 收录了什么

| 部分 | 内容 |
|---|---|
| 导读 | 学习路线、[开发环境搭建](/linux-docs/00-guide/03-environment/)、[参考资料](/linux-docs/00-guide/04-resources/)、[术语表](/linux-docs/00-guide/05-glossary/) |
| 动手课程 | 每一课一个主题,都附可以直接在 QEMU 里运行的代码和练习 |
| 学习笔记 | 课程之外的专题:开发环境的结构、示例驱动导读、踩坑记录 |

## 学习方式

- **一切都在虚拟机里跑**。驱动代码运行在内核态,一个空指针就会让整个系统崩溃。所以本站的所有实验都在 QEMU 虚拟机里进行:写崩了只需要几秒重启一台小虚拟机,不影响 Windows 和开发机。
- **先跑起来,再读原理**。每一课先给出能运行的代码和操作步骤,然后再解释每一行为什么这么写。
- **以官方文档和内核源码为准**。内核 API 变化很快,很多书和博客的代码在新内核上已经编译不过了。本站代码基于 Linux 6.18 LTS 实际编译、运行过。遇到疑问时,以 [docs.kernel.org](https://docs.kernel.org/) 和内核源码为准。

## 怎么读

按左侧目录顺序读即可:先看[学习路线](/linux-docs/00-guide/02-roadmap/)了解全貌,再按[环境搭建](/linux-docs/00-guide/03-environment/)把实验环境搭好,然后从[第 1 课](/linux-docs/01-lessons/01-kernel-module/)开始动手。
