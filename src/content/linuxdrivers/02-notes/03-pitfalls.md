---
title: "踩坑记录"
order: 3
description: "搭环境和写驱动时遇到的问题、原因和解决方法"
kind: original
---

每条都按“现象 → 原因 → 解决”记录。

## sysfs 属性文件没有生成

**现象**:edu 驱动 probe 成功了,但 `/sys/bus/pci/devices/0000:00:05.0/factorial` 不存在,`echo` 时报 `Permission denied`(sysfs 目录里不允许新建文件)。

驱动里是这样写的:

```c
static struct pci_driver edu_driver = {
	.name		= "edu",
	.id_table	= edu_ids,
	.probe		= edu_probe,
	.remove		= edu_remove,
	.driver		= {
		.dev_groups = edu_groups,   /* 错误:会被覆盖 */
	},
};
```

**原因**:`struct pci_driver` 自己有一个 `dev_groups` 字段。注册驱动时,`__pci_register_driver`(`drivers/pci/pci-driver.c`)会用它覆盖内嵌的通用驱动结构:

```c
int __pci_register_driver(struct pci_driver *drv, struct module *owner,
			  const char *mod_name)
{
	/* initialize common driver fields */
	drv->driver.name = drv->name;
	drv->driver.bus = &pci_bus_type;
	drv->driver.owner = owner;
	drv->driver.mod_name = mod_name;
	drv->driver.groups = drv->groups;
	drv->driver.dev_groups = drv->dev_groups;
	...
```

`drv->dev_groups` 没设置,是 `NULL`,于是我们设在 `driver.dev_groups` 上的值被清空了。

**解决**:设在 `pci_driver` 这一层:

```c
	.dev_groups	= edu_groups,
```

**教训**:总线专用的驱动结构(`pci_driver`、`platform_driver`、`usb_driver`……)会在注册时初始化内嵌的 `struct device_driver`。遇到“设置了却不生效”的字段,先去看对应总线的 `register_driver` 函数。

## 在 Git Bash 里找不到 `~/kdev`

**现象**:在 Git Bash 里运行 `~/kdev/scripts/run-qemu.sh`,提示文件不存在。

**原因**:Git Bash 里的 `~` 是 Windows 的 `C:\Users\<用户名>`,而 `~/kdev` 在 WSL Ubuntu 的文件系统里。

**解决**:先 `wsl -d Ubuntu-24.04` 进入 Ubuntu 再运行,或者:

```bash
wsl -d Ubuntu-24.04 -- bash -c '~/kdev/scripts/run-qemu.sh'
```

## 从 Windows 复制过去的脚本报奇怪的错

**现象**:在 Windows 上编辑的 shell 脚本,在 WSL 里运行时报 `$'\r': command not found`,或者命令参数后面多了看不见的字符。

**原因**:Windows 的换行符是 CRLF(`\r\n`),bash 把 `\r` 当成了命令的一部分。

**解决**:复制时去掉 `\r`,或者编辑器里把换行符设成 LF:

```bash
sed -i 's/\r$//' script.sh
```

## PowerShell 显示命令失败,其实成功了

**现象**:在 PowerShell 里用 `wsl.exe` 运行编译脚本,最后报 `NativeCommandError`,退出码非 0,但内核其实已经编译好了。

**原因**:脚本里的 `time` 把计时结果写到 stderr,而在 Windows PowerShell 5.1 里,用 `2>&1` 重定向原生命令的 stderr 时,每一行 stderr 都会被包装成错误记录。

**解决**:以输出内容和产物为准(检查 `bzImage` 是否生成),或者在 WSL 里直接运行脚本,不要经过 PowerShell。

## gdb 在 `start_kernel` 停下后调用栈是乱的

**现象**:`hbreak start_kernel` 命中后,`bt` 打印出一长串 `?? ()`。

**原因**:前几帧其实是对的,问题出在回溯的终点:

```text
#0  start_kernel () at init/main.c:871
#1  x86_64_start_reservations (...) at arch/x86/kernel/head64.c:310
#2  x86_64_start_kernel (...) at arch/x86/kernel/head64.c:291
#3  secondary_startup_64 () at arch/x86/kernel/head_64.S:418
#4  0x1f0f2e6600000000 in ?? ()
```

`secondary_startup_64` 是内核最早的汇编入口,它没有调用者,但也没有告诉 gdb“到此为止”,于是 gdb 继续把栈上的随机数据当成返回地址往上解析。这不是符号没加载的问题。

**解决**:不用处理,看前几帧即可;也可以用 `bt 4` 限制帧数。

## `pcim_iomap_regions` 已废弃

**现象**:很多教程和老代码用 `pcim_iomap_regions(pdev, BIT(0), name)` 加 `pcim_iomap_table(pdev)[0]` 映射 BAR。

**原因**:6.x 内核里 `pcim_iomap_regions` 的注释已经写明 “Use pcim_iomap_region() instead.”(`drivers/pci/devres.c`)。

**解决**:用新接口,一步完成申请和映射,出错时返回 `ERR_PTR`:

```c
edu->bar = pcim_iomap_region(pdev, 0, "edu");
if (IS_ERR(edu->bar))
	return PTR_ERR(edu->bar);
```
