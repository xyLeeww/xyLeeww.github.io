---
title: "术语表"
order: 5
description: "本站用到的 Linux 驱动和虚拟化术语"
kind: original
---

| 术语 | 说明 |
|---|---|
| 内核模块(kernel module,`.ko`) | 运行时加载进内核的代码,和内核共享地址空间,拥有最高权限。 |
| kbuild | 内核的构建系统。外部模块用 `make -C <内核源码> M=$PWD` 借用它来编译。 |
| vermagic | 模块里记录的“编译它的内核版本和关键配置”。和运行中的内核不一致时,模块拒绝加载。 |
| taint(污染标记) | 内核记录“加载过非官方代码”等状态的标志。加载外部模块会设置 `O` 标记,出 bug 时提醒开发者问题可能来自外部代码。 |
| `printk` / `pr_info` | 内核的打印函数,输出到内核日志环形缓冲区,用 `dmesg` 查看。 |
| sysfs | 挂载在 `/sys` 的虚拟文件系统,把内核对象(设备、驱动、模块参数)以文件形式暴露给用户态。 |
| 设备模型(device model) | 内核用 bus、device、driver 三类对象描述硬件。总线负责把设备和驱动匹配起来,匹配成功后调用驱动的 `probe`。 |
| probe / remove | 驱动和设备绑定、解绑时调用的回调。驱动的初始化工作主要在 `probe` 里完成。 |
| BDF | PCI 设备地址 Bus:Device.Function,例如 `0000:00:05.0`(最前面是 domain)。 |
| BAR(Base Address Register) | PCI 配置空间里描述设备寄存器窗口的位置和大小的寄存器。 |
| MMIO | Memory-Mapped I/O:把设备寄存器映射到地址空间,用 `ioread32`/`iowrite32` 访问。 |
| INTx / MSI | PCI 的两种中断方式:INTx 是传统的电平中断线,可能被多个设备共享;MSI 是设备通过写一个特殊内存地址来发中断。 |
| devres(`devm_*`) | 托管资源:用 `devm_` 前缀的接口申请的资源,会在驱动解绑时自动按相反顺序释放。 |
| Oops | 内核检测到严重错误(如空指针访问)时打印的错误报告,包含寄存器、调用栈和出错指令。 |
| initramfs | 内核启动时解压到内存里的初始根文件系统。本站的测试机只用 initramfs,没有磁盘。 |
| busybox | 把上百个常用命令(`sh`、`ls`、`mount`、`insmod` 等)打包成一个可执行文件的工具集。 |
| QEMU | 开源的机器模拟器,负责模拟磁盘、网卡、PCI 设备等硬件。 |
| KVM | Linux 内核自带的虚拟化模块,让虚拟机的 CPU 指令直接在真实 CPU 上执行。QEMU + KVM 比纯 QEMU 模拟快几十倍。 |
| 嵌套虚拟化 | 在虚拟机里再运行虚拟机。本站中 Hyper-V 运行 WSL2,WSL2 里再用 KVM 运行 QEMU。 |
| 9p / virtio | 9p 是一种文件共享协议,virtio 是半虚拟化设备标准。`-virtfs` 用 virtio 传输 9p,实现开发机和测试机共享目录。 |
| KASLR | 内核地址空间随机化。调试时关掉(`nokaslr`),gdb 里的符号地址才对得上。 |
