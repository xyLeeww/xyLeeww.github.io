---
title: "学习路线"
order: 2
description: "从内核模块到 PCI、中断、DMA 和调试的八课学习路线"
kind: original
---

驱动开发的知识点很多,但核心路径是清楚的:先学会把代码放进内核运行(模块),再学会和用户程序交互(字符设备),然后接触真实的硬件(PCI、MMIO、中断、DMA),最后学会在出问题时定位(调试)。

## 课程总览

| 课 | 主题 | 学会什么 | 状态 |
|---|---|---|---|
| 1 | [内核模块基础](/linux-docs/01-lessons/01-kernel-module/) | 模块加载与卸载、`printk`/`dmesg`、模块参数、kbuild 编译 | ✅ |
| 2 | 字符设备 | `file_operations`、`/dev/xxx` 的 read/write/ioctl、`copy_to_user` | 待更新 |
| 3 | 内存与并发 | `kmalloc`、mutex/spinlock、`devm_*` 托管资源 | 待更新 |
| 4 | 设备模型与 PCI | bus/device/driver 匹配、probe/remove、BAR 与 MMIO | 待更新 |
| 5 | 中断 | `request_irq`、MSI、中断上下文的限制、上下半部 | 待更新 |
| 6 | DMA | `dma_alloc_coherent`、edu 设备的 DMA 引擎 | 待更新 |
| 7 | 调试 | 读 Oops、gdb + QEMU、dynamic debug、KASAN | 待更新 |
| 8 | 通往 GPU | DRM 框架和 amdgpu 的代码结构 | 待更新 |

## 为什么用 QEMU edu 设备

学驱动最大的障碍是“没有硬件”。QEMU 自带一个教学用的虚拟 PCI 设备 **edu**(`-device edu`),它有:

- 一个 MMIO BAR,里面有身份寄存器、“活性检查”寄存器、阶乘计算寄存器;
- 中断(支持传统 INTx 和 MSI);
- 一个简单的 DMA 引擎。

这正好覆盖了第 4~6 课需要的全部硬件特性。设备的寄存器说明见 [QEMU edu 文档](https://www.qemu.org/docs/master/specs/edu.html),完整的示例驱动见笔记 [edu PCI 驱动导读](/linux-docs/02-notes/02-edu-pci-driver/)。

## 和 Windows 驱动的对应关系

做过 Windows 驱动的话,可以先建立一个粗略的对照(只是帮助记忆,两边的模型并不完全等价):

| Linux | Windows(WDM/KMDF) |
|---|---|
| `module_init` / `module_exit` | `DriverEntry` / `DriverUnload` |
| `pci_driver.probe` / `.remove` | `AddDevice` + `IRP_MN_START_DEVICE` / `EvtDevicePrepareHardware` |
| `pci_device_id` 表 | INF 文件里的硬件 ID |
| `ioread32` / `iowrite32` | `READ_REGISTER_ULONG` / `WRITE_REGISTER_ULONG` |
| `request_irq` 的中断处理函数 | ISR(`EvtInterruptIsr`) |
| tasklet / workqueue / 线程化中断 | DPC / 工作项 |
| `dmesg` | DbgView / WinDbg 的 `DbgPrint` 输出 |
| Oops / panic | 蓝屏(bugcheck) |
