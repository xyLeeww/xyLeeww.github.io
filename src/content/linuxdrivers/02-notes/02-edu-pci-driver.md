---
title: "edu PCI 驱动导读"
order: 2
description: "为 QEMU edu 教学设备写一个完整的 PCI 驱动:匹配、BAR 映射、MSI 中断、sysfs 接口"
kind: original
source: "https://www.qemu.org/docs/master/specs/edu.html"
sourceTitle: "QEMU edu device specification"
---

这篇笔记给出一个完整的、可运行的 PCI 驱动,驱动 QEMU 自带的教学设备 edu。它涵盖了真实 PCI 驱动的骨架:设备匹配、启用设备、映射 BAR、读写寄存器、申请 MSI 中断、等待硬件完成、向用户态暴露 sysfs 接口。第 4、5 课会拆开详细讲,这里先通读一遍。

## edu 设备

用 `-device edu` 启动 QEMU 后,测试机里会多出一个 PCI 设备,厂商 ID `0x1234`,设备 ID `0x11e8`。它的 BAR0 是一段 MMIO 寄存器(节选,完整定义见 [QEMU 文档](https://www.qemu.org/docs/master/specs/edu.html)):

| 偏移 | 读写 | 含义 |
|---|---|---|
| `0x00` | 只读 | 身份寄存器,格式 `0xRRrr00ed`,`RR` 是主版本号,`rr` 是次版本号 |
| `0x04` | 读写 | 活性检查:读回的是写入值按位取反,用来确认设备真的在响应 |
| `0x08` | 读写 | 阶乘计算:写入 n,设备计算 n!,完成后从这里读回结果 |
| `0x20` | 读写 | 状态寄存器:`0x01` 表示正在计算(只读);`0x80` 表示阶乘算完后发中断 |
| `0x24` | 只读 | 中断状态:哪些事件触发了中断(阶乘完成是 `0x01`,DMA 完成是 `0x100`) |
| `0x60` | 只写 | 手动触发中断,写入的值会合并到中断状态 |
| `0x64` | 只写 | 中断应答:写入的位会从中断状态里清除,中断处理函数必须写它,否则中断会一直触发 |
| `0x80`~`0x98` | 读写 | DMA 源地址、目的地址、长度、命令(第 6 课用) |

## 完整代码

`~/kdev/modules/edu/edu.c`:

```c
// SPDX-License-Identifier: GPL-2.0
/*
 * Driver for QEMU's "edu" teaching PCI device (-device edu, 1234:11e8).
 * Register layout: qemu/docs/specs/edu.rst
 *
 *   echo 10 > /sys/bus/pci/devices/<BDF>/factorial
 *   cat /sys/bus/pci/devices/<BDF>/factorial
 */
#include <linux/module.h>
#include <linux/pci.h>
#include <linux/interrupt.h>
#include <linux/completion.h>
#include <linux/mutex.h>

#define EDU_VENDOR_ID		0x1234
#define EDU_DEVICE_ID		0x11e8

#define EDU_REG_ID		0x00
#define EDU_REG_LIVENESS	0x04
#define EDU_REG_FACTORIAL	0x08
#define EDU_REG_STATUS		0x20
#define EDU_REG_IRQ_STATUS	0x24
#define EDU_REG_IRQ_RAISE	0x60
#define EDU_REG_IRQ_ACK		0x64

#define EDU_STATUS_IRQ_FACT	0x80
#define EDU_IRQ_FACT_DONE	0x01

struct edu_dev {
	struct pci_dev *pdev;
	void __iomem *bar;
	struct completion done;
	struct mutex lock;
	u32 result;
};

static irqreturn_t edu_irq(int irq, void *data)
{
	struct edu_dev *edu = data;
	u32 status = ioread32(edu->bar + EDU_REG_IRQ_STATUS);

	if (!status)
		return IRQ_NONE;

	iowrite32(status, edu->bar + EDU_REG_IRQ_ACK);
	if (status & EDU_IRQ_FACT_DONE)
		complete(&edu->done);
	return IRQ_HANDLED;
}

static int edu_factorial(struct edu_dev *edu, u32 n, u32 *out)
{
	int ret = 0;

	mutex_lock(&edu->lock);
	reinit_completion(&edu->done);
	iowrite32(EDU_STATUS_IRQ_FACT, edu->bar + EDU_REG_STATUS);
	iowrite32(n, edu->bar + EDU_REG_FACTORIAL);
	if (!wait_for_completion_timeout(&edu->done, msecs_to_jiffies(1000)))
		ret = -ETIMEDOUT;
	else
		*out = ioread32(edu->bar + EDU_REG_FACTORIAL);
	mutex_unlock(&edu->lock);
	return ret;
}

static ssize_t factorial_show(struct device *dev, struct device_attribute *attr,
			      char *buf)
{
	struct edu_dev *edu = pci_get_drvdata(to_pci_dev(dev));

	return sysfs_emit(buf, "%u\n", edu->result);
}

static ssize_t factorial_store(struct device *dev, struct device_attribute *attr,
			       const char *buf, size_t count)
{
	struct edu_dev *edu = pci_get_drvdata(to_pci_dev(dev));
	u32 n, res;
	int ret;

	ret = kstrtou32(buf, 0, &n);
	if (ret)
		return ret;
	ret = edu_factorial(edu, n, &res);
	if (ret)
		return ret;
	edu->result = res;
	return count;
}
static DEVICE_ATTR_RW(factorial);

static struct attribute *edu_attrs[] = {
	&dev_attr_factorial.attr,
	NULL,
};
ATTRIBUTE_GROUPS(edu);

static int edu_probe(struct pci_dev *pdev, const struct pci_device_id *id)
{
	struct edu_dev *edu;
	u32 devid, live, res;
	int ret;

	edu = devm_kzalloc(&pdev->dev, sizeof(*edu), GFP_KERNEL);
	if (!edu)
		return -ENOMEM;
	edu->pdev = pdev;
	init_completion(&edu->done);
	mutex_init(&edu->lock);
	pci_set_drvdata(pdev, edu);

	ret = pcim_enable_device(pdev);
	if (ret)
		return ret;

	edu->bar = pcim_iomap_region(pdev, 0, "edu");
	if (IS_ERR(edu->bar))
		return PTR_ERR(edu->bar);

	pci_set_master(pdev);

	ret = pci_alloc_irq_vectors(pdev, 1, 1, PCI_IRQ_ALL_TYPES);
	if (ret < 0)
		return ret;

	ret = devm_request_irq(&pdev->dev, pci_irq_vector(pdev, 0), edu_irq,
			       IRQF_SHARED, "edu", edu);
	if (ret)
		return ret;

	devid = ioread32(edu->bar + EDU_REG_ID);
	iowrite32(0x12345678, edu->bar + EDU_REG_LIVENESS);
	live = ioread32(edu->bar + EDU_REG_LIVENESS);
	dev_info(&pdev->dev, "id=%#010x (v%u.%u) liveness=%s irq=%d (%s)\n",
		 devid, devid >> 24, (devid >> 16) & 0xff,
		 live == ~0x12345678u ? "ok" : "BAD",
		 pci_irq_vector(pdev, 0), pdev->msi_enabled ? "MSI" : "INTx");

	ret = edu_factorial(edu, 5, &res);
	if (ret)
		return ret;
	edu->result = res;
	dev_info(&pdev->dev, "self-test: 5! = %u\n", res);
	return 0;
}

static void edu_remove(struct pci_dev *pdev)
{
	dev_info(&pdev->dev, "removed\n");
}

static const struct pci_device_id edu_ids[] = {
	{ PCI_DEVICE(EDU_VENDOR_ID, EDU_DEVICE_ID) },
	{ }
};
MODULE_DEVICE_TABLE(pci, edu_ids);

static struct pci_driver edu_driver = {
	.name		= "edu",
	.id_table	= edu_ids,
	.probe		= edu_probe,
	.remove		= edu_remove,
	.dev_groups	= edu_groups,
};
module_pci_driver(edu_driver);

MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Driver for the QEMU edu PCI device");
```

## 读代码的顺序

建议从下往上读,也就是按内核调用的顺序读。

### 1. 注册与匹配

- `edu_ids` 列出驱动支持的设备(厂商 ID + 设备 ID)。`MODULE_DEVICE_TABLE` 把这张表导出到模块信息里,供 udev 等工具自动加载驱动。
- `module_pci_driver(edu_driver)` 是个宏,展开后就是在 `module_init` 里调用 `pci_register_driver`,在 `module_exit` 里调用 `pci_unregister_driver`。
- 注册后,PCI 总线会用 `id_table` 和现有的设备逐个比对,匹配上就调用 `edu_probe`。

### 2. probe:初始化设备

`edu_probe` 按顺序做了这些事:

1. `devm_kzalloc` 分配驱动私有数据,`pci_set_drvdata` 把它挂到设备上,之后在任何回调里都能用 `pci_get_drvdata` 取回来。
2. `pcim_enable_device` 启用设备(打开配置空间里的内存解码等)。
3. `pcim_iomap_region(pdev, 0, "edu")` 申请并映射 BAR0,返回可以用 `ioread32`/`iowrite32` 访问的地址。
4. `pci_set_master` 允许设备发起总线访问。MSI 本质上是设备往特定地址写数据,所以也需要它;DMA 更需要。
5. `pci_alloc_irq_vectors(..., PCI_IRQ_ALL_TYPES)` 申请 1 个中断向量,优先 MSI-X,其次 MSI,最后退回 INTx。
6. `devm_request_irq` 注册中断处理函数 `edu_irq`。
7. 读身份寄存器、做活性检查、算一次 5! 作为自检。

所有资源都是 `pcim_*` / `devm_*` 托管的:**probe 中途任何一步失败直接 `return` 错误码即可**,已经申请的资源会按相反顺序自动释放;`remove` 里也就不需要手写释放代码。这是现代内核驱动的标准写法。

### 3. 和硬件交互:阶乘计算

`edu_factorial` 是一个典型的“发命令 → 等中断 → 读结果”流程:

```text
CPU                                     edu 设备
 │ iowrite32(0x80, STATUS)  ──────────▶  “算完后发中断”
 │ iowrite32(n, FACTORIAL)  ──────────▶  开始计算 n!
 │ wait_for_completion_timeout() 睡眠
 │                            ◀────────  计算完成,发 MSI 中断
 │ edu_irq(): 读 IRQ_STATUS,写 IRQ_ACK,complete()
 │ 被唤醒,ioread32(FACTORIAL) 读结果
```

- `completion` 是“一个线程等另一个上下文通知”的同步原语。等待方睡眠,中断处理函数调用 `complete` 唤醒它。
- `mutex` 保证同一时间只有一个请求在使用设备,否则两个线程同时写 `FACTORIAL` 寄存器会互相覆盖。
- 中断处理函数运行在中断上下文,**不能睡眠**:不能拿 mutex、不能用 `GFP_KERNEL` 分配内存。所以它只做最少的事情:确认中断、应答、通知等待方。
- 申请中断时用了 `IRQF_SHARED`,所以处理函数先读中断状态,不是自己的中断就返回 `IRQ_NONE`,让内核去问共享这根中断线的其他设备。

### 4. 向用户态暴露接口:sysfs

`DEVICE_ATTR_RW(factorial)` 声明了一个可读写的属性,对应 `factorial_show` 和 `factorial_store` 两个函数。属性组放在 `pci_driver.dev_groups` 里,驱动和设备绑定时,内核自动在设备的 sysfs 目录下创建 `factorial` 文件。

**注意**:属性组必须放在 `pci_driver.dev_groups`,不能放在 `pci_driver.driver.dev_groups`,否则会被覆盖,详见[踩坑记录](/linux-docs/02-notes/03-pitfalls/)。

## 运行结果

```bash
# 开发机
cd ~/kdev/modules/edu && make install

# 测试机
insmod edu.ko
echo 10 > /sys/bus/pci/devices/0000:00:05.0/factorial
cat /sys/bus/pci/devices/0000:00:05.0/factorial
grep edu /proc/interrupts
rmmod edu
```

实际输出:

```text
[    1.458580] edu 0000:00:05.0: id=0x010000ed (v1.0) liveness=ok irq=26 (MSI)
[    1.460071] edu 0000:00:05.0: self-test: 5! = 120
3628800
 26:          0          0          2          0 PCI-MSI-0000:00:05.0   0-edge      edu
[    1.471898] edu 0000:00:05.0: removed
```

- 身份寄存器读出 `0x010000ed`,即 1.0 版。
- 中断类型是 MSI,`/proc/interrupts` 里 edu 的中断计数是 2:一次来自 probe 里的 5! 自检,一次来自 `echo 10`。
- 10! = 3628800,结果正确。

## 动手改一改

1. 写一个 `irq_raise` 属性:写入一个值时写到 `0x60` 寄存器手动触发中断,在 `edu_irq` 里用 `dev_info` 打印收到的中断状态。
2. 把 `PCI_IRQ_ALL_TYPES` 改成 `PCI_IRQ_INTX`,看看 `/proc/interrupts` 里的中断类型有什么变化。
3. 去掉 `iowrite32(status, ... EDU_REG_IRQ_ACK)` 这一行,分别在 MSI 和 INTx 下观察会发生什么。提示:INTx 是电平触发,设备在被应答之前会一直拉着中断线;MSI 则是每个事件只发一次消息。
