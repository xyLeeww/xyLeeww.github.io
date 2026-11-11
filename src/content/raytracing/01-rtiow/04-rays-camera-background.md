---
title: "4. 光线、简单相机与背景(Rays, a Simple Camera, and Background)"
order: 4
description: "实现 ray 类,搭建视口与像素网格,向场景发射光线并渲染蓝白渐变背景"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#rays,asimplecamera,andbackground"
sourceTitle: "Ray Tracing in One Weekend · Rays, a Simple Camera, and Background"
license: "CC0 1.0"
---

## 4.1 ray 类

所有光线追踪器都有的一样东西,就是一个光线(ray)类,以及计算沿某条光线看到什么颜色的过程。我们把光线看作一个函数 $\mathbf{P}(t) = \mathbf{A} + t \mathbf{b}$。这里 $\mathbf{P}$ 是三维空间中一条直线上的某个 3D 位置。$\mathbf{A}$ 是光线的起点(origin),$\mathbf{b}$ 是光线的方向(direction)。光线参数 $t$ 是一个实数(在代码中是 `double`)。代入不同的 $t$,$\mathbf{P}(t)$ 就会让点沿着光线移动。如果加上负的 $t$ 值,你就能到达这条 3D 直线上的任何位置。对于正的 $t$,你只能得到 $\mathbf{A}$ 前方的部分,这就是通常所说的半直线,或者射线。

![图 2:线性插值](/raytracing/rtiow/fig-1.02-lerp.jpg)

我们可以把光线这个概念表示为一个类,并把函数 $\mathbf{P}(t)$ 表示为一个函数,我们称之为 `ray::at(t)`:

**代码清单 7**:`ray.h` ray 类

```cpp
#ifndef RAY_H
#define RAY_H

#include "vec3.h"

class ray {
  public:
    ray() {}

    ray(const point3& origin, const vec3& direction) : orig(origin), dir(direction) {}

    const point3& origin() const  { return orig; }
    const vec3& direction() const { return dir; }

    point3 at(double t) const {
        return orig + t*dir;
    }

  private:
    point3 orig;
    vec3 dir;
};

#endif
```

(对于不熟悉 C++ 的读者:函数 `ray::origin()` 和 `ray::direction()` 都返回对其成员的不可变引用。调用者可以根据需要直接使用这个引用,或者复制出一个可修改的副本。)

## 4.2 向场景发射光线

现在我们可以转入正题,做一个光线追踪器了。光线追踪器的核心是:让光线穿过像素,并计算沿这些光线方向看到的颜色。涉及的步骤如下:

1. 计算从“眼睛”出发、穿过该像素的光线;
2. 确定这条光线与哪些物体相交;
3. 计算最近交点处的颜色。

在刚开始开发光线追踪器时,我总会先做一个简单的相机(camera),让代码先跑起来。

我经常因为用正方形图像调试而陷入麻烦,因为我太容易把 $x$ 和 $y$ 弄反了,所以我们将使用非正方形的图像。正方形图像的宽高比是 1:1,因为它的宽度和高度相同。既然我们想要非正方形图像,就选择 16:9,因为它非常常见。16:9 的宽高比意味着图像宽度与图像高度之比是 16:9。换句话说,对于一张宽高比为 16:9 的图像,

$$
\text{width} / \text{height} = 16 / 9 = 1.7778
$$

举个实际的例子,一张宽 800 像素、高 400 像素的图像,宽高比是 2:1。

图像的宽高比可以由其宽度与高度之比确定。不过,由于我们心里已经有一个给定的宽高比,所以更简单的做法是设定图像宽度和宽高比,然后用它们来计算图像高度。这样,我们就可以通过改变图像宽度来放大或缩小图像,而不会打乱我们想要的宽高比。我们确实需要保证在求解图像高度时,得到的高度至少为 1。

除了设置渲染图像的像素尺寸,我们还需要设置一个虚拟的 _视口_(viewport),让场景光线从中穿过。视口是 3D 世界中的一个虚拟矩形,它包含图像像素位置构成的网格。如果像素在水平方向和垂直方向上的间距相同,那么包围这些像素的视口就会和渲染图像具有相同的宽高比。相邻两个像素之间的距离称为像素间距,标准做法是使用正方形像素。

一开始,我们先任意选取视口高度为 2.0,再按比例缩放视口宽度以得到想要的宽高比。下面是这段代码的大致样子:

**代码清单 8**:渲染图像的设置

```cpp
auto aspect_ratio = 16.0 / 9.0;
int image_width = 400;

// Calculate the image height, and ensure that it's at least 1.
int image_height = int(image_width / aspect_ratio);
image_height = (image_height < 1) ? 1 : image_height;

// Viewport widths less than one are ok since they are real valued.
auto viewport_height = 2.0;
auto viewport_width = viewport_height * (double(image_width)/image_height);
```

如果你在想为什么计算 `viewport_width` 时不直接用 `aspect_ratio`,原因是:`aspect_ratio` 的值是理想比例,它不一定是 `image_width` 与 `image_height` 之间的 _实际_ 比例。如果允许 `image_height` 取实数值——而不仅仅是整数——那么使用 `aspect_ratio` 就没问题。但 `image_width` 与 `image_height` 之间的 _实际_ 比例可能会因代码中的两处而改变。第一,`image_height` 会向下取整到最近的整数,这可能使比例变大。第二,我们不允许 `image_height` 小于 1,这同样可能改变实际的宽高比。

注意,`aspect_ratio` 是一个理想比例,我们用基于整数的图像宽度与高度之比尽可能地逼近它。为了让视口的比例与图像的比例完全一致,我们使用计算得出的图像宽高比来确定最终的视口宽度。

接下来我们定义相机中心:3D 空间中的一个点,所有场景光线都从这里发出(这个点通常也被称为 _视点_(eye point))。从相机中心指向视口中心的向量与视口正交。我们先把视口与相机中心点之间的距离设为一个单位。这个距离通常被称为 _焦距_(focal length)。

为简单起见,我们先把相机中心放在 $(0,0,0)$。我们还让 y 轴朝上、x 轴朝右,负 z 轴指向观察方向。(这通常被称为 _右手坐标系_(right-handed coordinates)。)

![图 3:相机几何](/raytracing/rtiow/fig-1.03-cam-geom.jpg)

现在来到不可避免的棘手部分。虽然我们的 3D 空间遵循上述约定,但这与我们的图像坐标相冲突:在图像坐标中,我们希望第 0 个像素位于左上角,然后一路向下,最后一个像素位于右下角。这意味着图像坐标的 Y 轴是反过来的:沿图像向下时 Y 增大。

在扫描图像时,我们将从左上角的像素(像素 $0,0$)开始,在每一行中从左到右扫描,然后从上到下逐行扫描。为了方便在像素网格中定位,我们将使用一个从左边缘指向右边缘的向量($\mathbf{V_u}$),以及一个从上边缘指向下边缘的向量($\mathbf{V_v}$)。

我们的像素网格会从视口边缘向内缩进半个像素间距。这样,视口区域就被均匀地划分为 宽 × 高 个相同的区域。下面是视口和像素网格的样子:

![图 4:视口与像素网格](/raytracing/rtiow/fig-1.04-pixel-grid.jpg)

在这张图中,我们画出了视口、一张 7×5 分辨率图像的像素网格、视口左上角 $\mathbf{Q}$、像素 $\mathbf{P_{0,0}}$ 的位置、视口向量 $\mathbf{V_u}$(`viewport_u`)、视口向量 $\mathbf{V_v}$(`viewport_v`),以及像素增量向量 $\mathbf{\Delta u}$ 和 $\mathbf{\Delta v}$。

综合以上内容,下面是实现相机的代码。我们会先放一个桩函数 `ray_color(const ray& r)`,它返回给定场景光线的颜色——目前我们让它始终返回黑色。

**代码清单 9**:`main.cc` 创建场景光线

```cpp {2,8-10,17-42,51-55}
#include "color.h"
#include "ray.h"
#include "vec3.h"

#include <iostream>


color ray_color(const ray& r) {
    return color(0,0,0);
}

int main() {

    // Image


    auto aspect_ratio = 16.0 / 9.0;
    int image_width = 400;

    // Calculate the image height, and ensure that it's at least 1.
    int image_height = int(image_width / aspect_ratio);
    image_height = (image_height < 1) ? 1 : image_height;

    // Camera

    auto focal_length = 1.0;
    auto viewport_height = 2.0;
    auto viewport_width = viewport_height * (double(image_width)/image_height);
    auto camera_center = point3(0, 0, 0);

    // Calculate the vectors across the horizontal and down the vertical viewport edges.
    auto viewport_u = vec3(viewport_width, 0, 0);
    auto viewport_v = vec3(0, -viewport_height, 0);

    // Calculate the horizontal and vertical delta vectors from pixel to pixel.
    auto pixel_delta_u = viewport_u / image_width;
    auto pixel_delta_v = viewport_v / image_height;

    // Calculate the location of the upper left pixel.
    auto viewport_upper_left = camera_center
                             - vec3(0, 0, focal_length) - viewport_u/2 - viewport_v/2;
    auto pixel00_loc = viewport_upper_left + 0.5 * (pixel_delta_u + pixel_delta_v);

    // Render

    std::cout << "P3\n" << image_width << " " << image_height << "\n255\n";

    for (int j = 0; j < image_height; j++) {
        std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
        for (int i = 0; i < image_width; i++) {
            auto pixel_center = pixel00_loc + (i * pixel_delta_u) + (j * pixel_delta_v);
            auto ray_direction = pixel_center - camera_center;
            ray r(camera_center, ray_direction);

            color pixel_color = ray_color(r);
            write_color(std::cout, pixel_color);
        }
    }

    std::clog << "\rDone.                 \n";
}
```

> **译注**:与代码清单 6 相比,原来的 `int image_width = 256;` 和 `int image_height = 256;` 两行已被新的图像设置代码(`aspect_ratio` 等)取代。

注意,在上面的代码中,我没有把 `ray_direction` 设为单位向量,因为我认为不这样做能让代码更简单,也稍微快一点。

现在我们来填写 `ray_color(ray)` 函数,实现一个简单的渐变。这个函数会根据光线方向缩放为单位长度 _之后_ 的 $y$ 坐标高度(因此 $-1.0 < y < 1.0$),对白色和蓝色进行线性混合。因为我们看的是向量归一化之后的 $y$ 高度,所以你会发现,除了垂直方向的渐变之外,颜色在水平方向上也有渐变。

我会用一个标准的图形学技巧来线性缩放 $0.0 \le a \le 1.0$。当 $a = 1.0$ 时,我想要蓝色;当 $a = 0.0$ 时,我想要白色;在两者之间,我想要它们的混合。这就构成了“线性混合”(linear blend),或者说“线性插值”(linear interpolation)。它通常被称为两个值之间的 _lerp_。lerp 总是具有如下形式:

$$
\mathit{blendedValue} = (1-a)\cdot\mathit{startValue} + a\cdot\mathit{endValue},
$$

其中 $a$ 从 0 变化到 1。

把这些全部放在一起,我们得到:

**代码清单 10**:`main.cc` 渲染从蓝到白的渐变

```cpp {9-11}
#include "color.h"
#include "ray.h"
#include "vec3.h"

#include <iostream>


color ray_color(const ray& r) {
    vec3 unit_direction = unit_vector(r.direction());
    auto a = 0.5*(unit_direction.y() + 1.0);
    return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
}

...
```

在我们的例子中,结果如下:

![图像 2:随光线 Y 坐标变化的蓝白渐变](/raytracing/rtiow/img-1.02-blue-to-white.png)
