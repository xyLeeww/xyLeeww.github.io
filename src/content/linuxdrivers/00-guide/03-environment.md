---
title: "开发环境搭建(WSL2 + QEMU/KVM)"
order: 3
description: "在一台 Windows 电脑上搭建 Linux 驱动开发环境:WSL2 Ubuntu 做开发机,QEMU 运行自己编译的内核"
kind: original
---

## 方案选择

在 Windows 上学 Linux 驱动,常见的方案有三种:

| 方案 | 优点 | 缺点 |
|---|---|---|
| 只用 WSL2 | 装得最快 | 跑的是微软定制内核,加载自己的模块要先编译内核头文件;模块写崩了整个 WSL 都会挂 |
| Ubuntu 完整虚拟机(Hyper-V / VirtualBox) | 装完就能编译、加载模块,有快照 | 每次换内核都要重启整台虚拟机,迭代慢 |
| **WSL2 + QEMU 自编内核**(本站采用) | 换内核几秒就能启动;能用 gdb 单步调内核;有 edu 教学 PCI 设备 | 前期要编内核、做最小根文件系统 |

本站采用第三种。

## 三层结构

```text
Windows(宿主机)
 └─ WSL2 Ubuntu 24.04(开发机)    写代码、编译内核和模块
     └─ QEMU/KVM(测试机)          运行自己编译的内核,加载驱动
```

- **开发机**跑的是微软的 WSL 内核,我们**不在这里加载驱动**,只用它编译。
- **测试机**是一台迷你 Linux:自己编译的内核 + busybox 根文件系统 + 一块虚拟的 edu PCI 设备。驱动在这里 `insmod`,写崩了只是这台小虚拟机挂掉。
- 两者通过 9p 共享目录传文件:开发机的 `~/kdev/share` 就是测试机里的 `/mnt/share`。

更详细的解释(包括 KVM 是什么、为什么能嵌套虚拟化)见笔记[开发环境的三层结构与 KVM](/linux-docs/02-notes/01-three-layers/)。

## 第 1 步:安装 WSL2 Ubuntu

在 PowerShell 里(WSL 本身已启用的前提下,不需要管理员权限):

```powershell
wsl --install -d Ubuntu-24.04 --location D:\WSL\Ubuntu-24.04
```

`--location` 可以把发行版装到空间更大的盘。装好后进入 Ubuntu:

```bash
wsl -d Ubuntu-24.04
```

确认 `/dev/kvm` 存在,说明 WSL2 里可以用 KVM 硬件加速(Windows 11 默认支持嵌套虚拟化):

```bash
ls -l /dev/kvm
sudo usermod -aG kvm $USER   # 重新进入 WSL 后生效
```

## 第 2 步:安装工具链

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential flex bison bc libelf-dev libssl-dev libncurses-dev dwarves \
  qemu-system-x86 gdb cpio busybox-static git rsync kmod xz-utils curl
```

| 包 | 用途 |
|---|---|
| `build-essential flex bison bc libelf-dev libssl-dev dwarves` | 编译内核 |
| `libncurses-dev` | `make menuconfig` |
| `qemu-system-x86` | 测试机 |
| `gdb` | 调试内核 |
| `busybox-static cpio` | 制作最小根文件系统 |

## 第 3 步:编译内核

所有文件放在 WSL 自己的文件系统(`~/kdev`)里,**不要放在 `/mnt/c` 或 `/mnt/d` 下**,跨文件系统访问会让编译慢很多。

`~/kdev/scripts/build-kernel.sh`:

```bash
#!/bin/bash
# Download and build a debug-friendly kernel for QEMU.
set -e
KVER=${KVER:-6.18.63}
KDEV=$HOME/kdev
mkdir -p "$KDEV"/{share,scripts,modules}
cd "$KDEV"

if [ ! -d linux-$KVER ]; then
  curl -sSfL -o linux-$KVER.tar.xz https://cdn.kernel.org/pub/linux/kernel/v${KVER%%.*}.x/linux-$KVER.tar.xz
  tar xf linux-$KVER.tar.xz
  rm linux-$KVER.tar.xz
fi
ln -sfn linux-$KVER linux
cd linux

if [ ! -f .config ]; then
  make -s x86_64_defconfig
  make -s kvm_guest.config
  ./scripts/config \
    -e DEBUG_KERNEL -e DEBUG_INFO -e DEBUG_INFO_DWARF5 -d DEBUG_INFO_REDUCED \
    -e GDB_SCRIPTS -e FRAME_POINTER -e KALLSYMS_ALL -e MAGIC_SYSRQ \
    -d RANDOMIZE_BASE \
    -e MODULES -e MODULE_UNLOAD -e MODULE_FORCE_UNLOAD \
    -e NET_9P -e NET_9P_VIRTIO -e 9P_FS -e 9P_FS_POSIX_ACL \
    -e DEVTMPFS -e DEVTMPFS_MOUNT -e BLK_DEV_INITRD \
    -e PCI -e VIRTIO_PCI -e DYNAMIC_DEBUG
  make -s olddefconfig
fi

time make -s -j"$(nproc)" bzImage modules
make -s scripts_gdb
ls -lh arch/x86/boot/bzImage vmlinux
```

几个配置的作用:

- `x86_64_defconfig` + `kvm_guest.config`:x86_64 默认配置,再加上作为 KVM 客户机需要的 virtio 等驱动。
- `DEBUG_INFO_DWARF5`、`GDB_SCRIPTS`:生成调试符号和 gdb 辅助脚本(`lx-dmesg`、`lx-lsmod` 等命令)。
- `-d RANDOMIZE_BASE`:关闭内核地址随机化(KASLR),gdb 里的符号地址才对得上。启动参数里的 `nokaslr` 也是同样的作用。
- `9P_FS`、`NET_9P_VIRTIO`:让测试机能挂载开发机的共享目录。

选择 6.18 是因为它是当时的长期支持(longterm)版本,最新版本号可以在 [kernel.org](https://www.kernel.org/) 查到。在 16 线程的 CPU 上,带调试信息的完整编译大约 3 分钟。

## 第 4 步:制作最小根文件系统

`~/kdev/scripts/mk-initramfs.sh` 用静态链接的 busybox 做一个 initramfs,启动后自动挂载 `/proc`、`/sys`、`/dev` 和 9p 共享目录:

```bash
#!/bin/bash
# Build a tiny busybox initramfs. Guest mounts ~/kdev/share at /mnt/share via 9p.
set -e
KDEV=$HOME/kdev
R=$KDEV/rootfs
rm -rf "$R"
mkdir -p "$R"/{bin,sbin,etc,proc,sys,dev,tmp,root,mnt/share,usr/bin,usr/sbin}
cp /bin/busybox "$R/bin/busybox"
for a in $("$R/bin/busybox" --list); do
  [ "$a" = busybox ] || ln -sf busybox "$R/bin/$a"
done

cat > "$R/init" <<'EOF'
#!/bin/sh
mount -t proc none /proc
mount -t sysfs none /sys
mount -t devtmpfs none /dev 2>/dev/null
mount -t debugfs none /sys/kernel/debug 2>/dev/null
mount -t 9p -o trans=virtio,version=9p2000.L hostshare /mnt/share || echo "9p mount failed"
echo 8 > /proc/sys/kernel/printk
hostname qemu
echo
echo "== kernel $(uname -r) ready; host ~/kdev/share is at /mnt/share =="
if grep -q autotest /proc/cmdline && [ -x /mnt/share/autotest.sh ]; then
  /mnt/share/autotest.sh
  poweroff -f
fi
cd /mnt/share
exec setsid cttyhack /bin/sh
EOF
chmod +x "$R/init"

(cd "$R" && find . -print0 | cpio --null -o -H newc --quiet | gzip -9) > "$KDEV/initramfs.cpio.gz"
ls -lh "$KDEV/initramfs.cpio.gz"
```

`echo 8 > /proc/sys/kernel/printk` 让所有级别的内核日志都直接打印到控制台,`insmod` 之后不用 `dmesg` 也能马上看到输出。

## 第 5 步:启动测试机

`~/kdev/scripts/run-qemu.sh`:

```bash
#!/bin/bash
# Boot the custom kernel in QEMU/KVM.
#   run-qemu.sh            interactive shell (exit: Ctrl-A then X)
#   GDB=1 run-qemu.sh      wait for gdb on :1234 (run gdb-kernel.sh in another terminal)
#   AUTOTEST=1 run-qemu.sh run ~/kdev/share/autotest.sh then power off
KDEV=$HOME/kdev
APPEND="console=ttyS0 nokaslr panic=-1"
EXTRA=()
[ -n "$GDB" ] && EXTRA+=(-s -S)
[ -n "$AUTOTEST" ] && APPEND="$APPEND autotest"

exec qemu-system-x86_64 \
  -enable-kvm -cpu host -smp 4 -m 2G \
  -kernel "$KDEV/linux/arch/x86/boot/bzImage" \
  -initrd "$KDEV/initramfs.cpio.gz" \
  -append "$APPEND" \
  -virtfs local,path="$KDEV/share",mount_tag=hostshare,security_model=none,id=hostshare \
  -device edu \
  -nographic -no-reboot \
  "${EXTRA[@]}"
```

| 参数 | 作用 |
|---|---|
| `-enable-kvm -cpu host` | 用 KVM 硬件加速,测试机启动只要 1~2 秒 |
| `-kernel` / `-initrd` | 直接启动我们编译的内核,不需要磁盘镜像和引导程序 |
| `console=ttyS0` + `-nographic` | 内核控制台走串口,直接显示在当前终端 |
| `panic=-1` + `-no-reboot` | 内核 panic 后立刻退出 QEMU,而不是卡住 |
| `-virtfs ...` | 9p 共享目录 |
| `-device edu` | 教学用 PCI 设备 |
| `-s -S` | 在 1234 端口开 gdb 服务,并在第一条指令前暂停 |

退出 QEMU:按 `Ctrl-A`,松开后再按 `X`。

## 第 6 步:用 gdb 调试内核

`~/kdev/scripts/gdb-kernel.sh`:

```bash
#!/bin/bash
# Attach gdb to a guest started with: GDB=1 run-qemu.sh
KDEV=$HOME/kdev
cd "$KDEV/linux"
exec gdb -q \
  -iex "add-auto-load-safe-path $KDEV/linux" \
  -ex "target remote :1234" \
  "$@" vmlinux
```

使用方法:

```bash
# 终端 A
GDB=1 ~/kdev/scripts/run-qemu.sh
# 终端 B
~/kdev/scripts/gdb-kernel.sh
(gdb) hbreak start_kernel
(gdb) c
(gdb) lx-version
(gdb) lx-dmesg
```

`add-auto-load-safe-path` 让 gdb 自动加载内核源码树里的 `vmlinux-gdb.py`,`lx-*` 系列命令就来自它。断点用 `hbreak`(硬件断点):gdb 连上时 CPU 还停在第一条指令,分页还没开启,软件断点需要往内核的虚拟地址写 `int3` 指令,这时写不进去;硬件断点用的是 CPU 调试寄存器,不受影响。

## 日常工作流

改驱动(不需要重启测试机):

```bash
# 终端 A:启动测试机
~/kdev/scripts/run-qemu.sh

# 终端 B:编译,并把 .ko 复制到共享目录
cd ~/kdev/modules/edu && make install

# 回到终端 A(测试机)
insmod edu.ko
dmesg | tail
rmmod edu
```

改内核:修改 `~/kdev/linux` 下的源码,重新运行 `build-kernel.sh`,再重启测试机。

模块的 Makefile 模板(`make install` 会把 `.ko` 复制到共享目录):

```makefile
obj-m := edu.o
KDIR ?= $(HOME)/kdev/linux
SHARE ?= $(HOME)/kdev/share

all:
	$(MAKE) -C $(KDIR) M=$(CURDIR) modules

install: all
	cp *.ko $(SHARE)/

clean:
	$(MAKE) -C $(KDIR) M=$(CURDIR) clean
```

## 对 Windows 内核调试有没有影响

WSL2 依赖 Hyper-V 虚拟化平台。如果这台电脑只是**运行 WinDbg 的调试机**,没有任何影响。如果它本身是**被调试的目标机**,需要注意:

- WSL2 会通过 GPU 半虚拟化使用宿主机的显卡驱动,调 GPU 驱动前最好先 `wsl --shutdown`,避免多出来的上下文干扰分析。
- 如果某些场景必须完全关闭 Hypervisor,可以复制一个启动项,在新启动项上设置 `hypervisorlaunchtype off`,开机时选择它。
