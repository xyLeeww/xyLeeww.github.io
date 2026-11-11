---
title: "2. 输出图像(Output an Image)"
order: 2
description: "用纯文本 PPM 格式输出第一张图像,并为渲染添加进度指示"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#outputanimage"
sourceTitle: "Ray Tracing in One Weekend · Output an Image"
license: "CC0 1.0"
---

## 2.1 PPM 图像格式

每当你开始写一个渲染器时,都需要一种查看图像的方法。最直接的方法就是把图像写入文件。麻烦在于,图像格式实在太多了,而且其中很多都很复杂。我总是从纯文本的 ppm 文件开始。下面是来自维基百科的一段很好的说明:

![图 1:PPM 示例](/raytracing/rtiow/fig-1.01-ppm.jpg)

我们来写一些 C++ 代码来输出这样的文件:

**代码清单 1**:`main.cc` 创建你的第一张图像

```cpp
#include <iostream>

int main() {

    // Image

    int image_width = 256;
    int image_height = 256;

    // Render

    std::cout << "P3\n" << image_width << ' ' << image_height << "\n255\n";

    for (int j = 0; j < image_height; j++) {
        for (int i = 0; i < image_width; i++) {
            auto r = double(i) / (image_width-1);
            auto g = double(j) / (image_height-1);
            auto b = 0.0;

            int ir = int(255.999 * r);
            int ig = int(255.999 * g);
            int ib = int(255.999 * b);

            std::cout << ir << ' ' << ig << ' ' << ib << '\n';
        }
    }
}
```

这段代码有几点需要注意:

1. 像素按行写出。

2. 每一行像素都从左到右写出。

3. 这些行从上到下写出。

4. 按照惯例,红/绿/蓝各分量在内部用取值范围为 0.0 到 1.0 的实数变量表示。在打印输出之前,必须把它们缩放为 0 到 255 之间的整数值。

5. 红色从左到右由完全关闭(黑色)变为完全打开(亮红色);绿色从顶部的完全关闭(黑色)变为底部的完全打开(亮绿色)。红光和绿光叠加会得到黄色,所以我们应该看到右下角是黄色的。

## 2.2 创建图像文件

因为文件是写到标准输出流的,所以你需要把它重定向到一个图像文件。通常的做法是在命令行中使用 `>` 重定向运算符。

在 Windows 上,运行下面的命令,即可用 CMake 得到调试(debug)构建:

```bash
cmake -B build
cmake --build build
```

然后像这样运行刚构建好的程序:

```bash
build\Debug\inOneWeekend.exe > image.ppm
```

之后,为了速度,最好运行经过优化的构建。这种情况下,你可以这样构建:

```bash
cmake --build build --config release
```

并像这样运行优化后的程序:

```bash
build\Release\inOneWeekend.exe > image.ppm
```

上面的例子假设你使用 CMake 构建,做法与随附源代码中的 `CMakeLists.txt` 文件相同。你可以使用任何自己最习惯的构建环境(和语言)。

在 Mac 或 Linux 上,对于 release 构建,你可以这样启动程序:

```bash
build/inOneWeekend > image.ppm
```

完整的构建和运行说明可以在[项目 README](https://github.com/RayTracing/raytracing.github.io#readme) 中找到。

打开输出文件(我在 Mac 上用的是 `ToyViewer`,你可以用自己喜欢的图像查看器试试;如果它不支持这种格式,就 Google 一下“ppm viewer”),会看到这样的结果:

![图像 1:第一张 PPM 图像](/raytracing/rtiow/img-1.01-first-ppm-image.png)

太好了!这就是图形学里的“hello world”。如果你的图像看起来不是这样,请用文本编辑器打开输出文件,看看里面是什么样子。它的开头应该类似这样:

**代码清单 2**:第一张图像的输出

```text
P3
256 256
255
0 0 0
1 0 0
2 0 0
3 0 0
4 0 0
5 0 0
6 0 0
7 0 0
8 0 0
9 0 0
10 0 0
11 0 0
12 0 0
...
```

如果你的 PPM 文件看起来不是这样,请仔细检查你的格式化输出代码。如果它 _确实_ 是这样却无法显示,那么可能是换行符不同或类似的原因让你的图像查看器无法正确解析。为了帮助调试,你可以在 GitHub 项目的 `images` 目录中找到一个 `test.ppm` 文件。它可以帮你确认查看器能否处理 PPM 格式,也可以用来和你生成的 PPM 文件做对比。

有些读者反映在 Windows 上查看生成的文件时遇到问题。这种情况下,问题通常是 PPM 文件被写成了 UTF-16 编码,这往往发生在 PowerShell 中。如果你遇到这个问题,请参阅 [Discussion 1114](https://github.com/RayTracing/raytracing.github.io/discussions/1114) 获取帮助。

> **译注**:在 Windows PowerShell 5.1 中,`>` 重定向默认以 UTF-16 编码写文件,会导致 PPM 无法打开。可以改在 `cmd.exe` 中运行同样的命令,或者使用 PowerShell 7 及以上版本。

如果一切都显示正常,那么系统和 IDE 方面的问题基本就解决了——本系列剩下的所有内容都使用这种简单的机制来生成渲染图像。

如果你想输出其他图像格式,我很喜欢 `stb_image.h`,这是一个只有头文件的图像库,可以在 GitHub 上获取:[https://github.com/nothings/stb](https://github.com/nothings/stb)。

## 2.3 添加进度指示器

在继续之前,我们先给输出加一个进度指示器。这是跟踪长时间渲染进度的一种便捷方法,也可能帮助发现因无限循环或其他问题而卡住的运行。

我们的程序把图像输出到标准输出流(`std::cout`),所以保持这一点不变,改为把进度写到日志输出流(`std::clog`):

**代码清单 3**:`main.cc` 带进度报告的主渲染循环

```cpp {2,16}
    for (int j = 0; j < image_height; ++j) {
        std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
        for (int i = 0; i < image_width; i++) {
            auto r = double(i) / (image_width-1);
            auto g = double(j) / (image_height-1);
            auto b = 0.0;

            int ir = int(255.999 * r);
            int ig = int(255.999 * g);
            int ib = int(255.999 * b);

            std::cout << ir << ' ' << ig << ' ' << ib << '\n';
        }
    }

    std::clog << "\rDone.                 \n";
```

现在运行时,你会看到一个不断更新的剩余扫描线计数。希望它运行得飞快,让你根本看不到它!别担心——随着我们不断扩展光线追踪器,将来你会有大把时间盯着缓慢更新的进度行。
