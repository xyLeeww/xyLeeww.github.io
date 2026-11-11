---
title: "第 1 课:内核模块基础"
order: 1
description: "写一个 hello 模块:加载与卸载、内核日志、模块参数和 kbuild 编译"
kind: original
source: "https://sysprog21.github.io/lkmpg/"
sourceTitle: "The Linux Kernel Module Programming Guide"
---

这一课写一个最小的内核模块,把“写代码 → 编译 → 加载 → 看日志 → 卸载”的循环走通。开始之前请先按[环境搭建](/linux-docs/00-guide/03-environment/)准备好环境。

## 核心概念

- **内核模块(`.ko`)** 是运行时加载进内核的代码。它没有 `main` 函数,也不能用 libc(没有 `printf`、`malloc`)。模块和内核共享同一个地址空间,权限最高:一个空指针就能让整个系统崩溃。这就是我们要在 QEMU 里练习的原因。
- **`module_init` / `module_exit`** 指定模块加载、卸载时调用的函数。`__init` 标记的函数在初始化完成后会被释放内存,`__exit` 标记的函数在模块被编进内核(而不是作为模块)时直接丢弃。
- **`pr_info`** 是 `printk(KERN_INFO ...)` 的简写,输出到内核日志环形缓冲区,用 `dmesg` 查看,**不会**打印到你运行 `insmod` 的终端。
- **`module_param`** 定义模块参数,加载时传入,运行时可以在 `/sys/module/<模块名>/parameters/` 下看到。
- **`MODULE_LICENSE("GPL")`** 不是可有可无的:没有 GPL 兼容的许可证,模块就不能使用内核导出的 GPL-only 符号,并且会污染(taint)内核。
- **必须针对目标内核编译**。模块里记录了编译它的内核版本(vermagic),和运行中的内核对不上就加载不了。

## 代码

`~/kdev/modules/hello/hello.c`:

```c
// SPDX-License-Identifier: GPL-2.0
#include <linux/module.h>
#include <linux/init.h>

static char *who = "world";
module_param(who, charp, 0444);
MODULE_PARM_DESC(who, "Name to greet");

static int __init hello_init(void)
{
	pr_info("hello: hello, %s!\n", who);
	return 0;
}

static void __exit hello_exit(void)
{
	pr_info("hello: goodbye, %s\n", who);
}

module_init(hello_init);
module_exit(hello_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Minimal hello world module");
```

逐行看:

| 代码 | 含义 |
|---|---|
| `module_param(who, charp, 0444)` | 把变量 `who` 声明成字符串参数,sysfs 里的权限是只读(`0444`)。 |
| `static int __init hello_init(void)` | 返回 0 表示加载成功;返回负的错误码(如 `-ENODEV`)表示失败,模块不会留在内核里。 |
| `pr_info("hello: ...\n", ...)` | 日志前加模块名是惯例,方便在 `dmesg` 里过滤。末尾的 `\n` 很重要,没有它这一行可能和下一条日志粘在一起。 |
| `static void __exit hello_exit(void)` | 卸载时调用,没有返回值:卸载不允许失败。 |

`Makefile`:

```makefile
obj-m := hello.o
KDIR ?= $(HOME)/kdev/linux
SHARE ?= $(HOME)/kdev/share

all:
	$(MAKE) -C $(KDIR) M=$(CURDIR) modules

install: all
	cp *.ko $(SHARE)/

clean:
	$(MAKE) -C $(KDIR) M=$(CURDIR) clean
```

`obj-m := hello.o` 告诉 kbuild:把 `hello.c` 编译成模块 `hello.ko`。`make -C $(KDIR) M=$(CURDIR)` 的意思是“进入内核源码目录,用它的构建系统编译 `M` 指向的外部模块”。

## 动手

终端 B 是开发机(WSL Ubuntu),终端 A 是测试机(QEMU)。

```bash
# 终端 B:编译
cd ~/kdev/modules/hello
make install
modinfo hello.ko            # 看 vermagic、参数、许可证

# 终端 A:先运行 ~/kdev/scripts/run-qemu.sh,进入测试机
insmod hello.ko who=xinyi
dmesg | tail -3
lsmod
cat /sys/module/hello/parameters/who
rmmod hello
dmesg | tail -1
```

实际输出(节选):

```text
/mnt/share # insmod hello.ko who=xinyi
[    1.426275] hello: loading out-of-tree module taints kernel.
[    1.428699] hello: hello, xinyi!
/mnt/share # lsmod
Module                  Size  Used by    Tainted: G
hello                  12288  0
/mnt/share # rmmod hello
[    1.434773] hello: goodbye, xinyi
```

`loading out-of-tree module taints kernel` 说明加载了不在内核源码树里的模块,内核给自己打上了 `O`(out-of-tree)污染标记。这对学习没有影响。`lsmod` 头部的 `Tainted: G` 只是污染字符串的第一位,表示没有加载非 GPL 模块;完整的污染状态可以用 `cat /proc/sys/kernel/tainted` 查看。

## 思考题

在开发机(WSL Ubuntu)里直接 `sudo insmod hello.ko`,会发生什么?为什么?

提示:用 `modinfo hello.ko` 看 vermagic,再用 `uname -r` 看开发机正在运行的内核。

## 练习

1. 加一个 `int` 参数 `count`,让 `hello_init` 打印 `count` 次问候。加载时用 `insmod hello.ko count=3` 试试。
2. 让 `hello_init` 返回 `-ENODEV`。看 `insmod` 报什么错,`lsmod` 里还有没有这个模块,`hello_exit` 有没有被调用。
3. 在 `hello_init` 里故意写 `*(int *)0 = 1;`,触发一次空指针访问,观察内核打印的 Oops 信息:出错的指令地址、调用栈、寄存器。这类信息怎么读,会在第 7 课详细讲。

## 小结

- 模块的生命周期:`insmod` → `module_init` 函数 → (运行)→ `rmmod` → `module_exit` 函数。
- 内核里打印用 `pr_info` 等函数,看日志用 `dmesg`。
- 模块必须用目标内核的源码树编译。
