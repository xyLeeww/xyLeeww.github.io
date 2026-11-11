---
title: "8. 抗锯齿(Antialiasing)"
order: 8
description: "在每个像素内随机采样多条光线并取平均,消除边缘的“阶梯”状锯齿。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#antialiasing"
sourceTitle: "Ray Tracing in One Weekend · Antialiasing"
license: "CC0 1.0"
---

如果把目前渲染出的图像放大来看,你可能会注意到物体边缘有明显的“阶梯”状起伏。这种阶梯效应通常被称为“走样(aliasing)”,或者俗称“锯齿(jaggies)”。真实的相机拍照时,边缘一般不会出现锯齿,因为边缘像素是一部分前景和一部分背景混合的结果。要知道,与我们渲染出的图像不同,世界的真实图像是连续的。换句话说,这个世界(以及它的任何真实图像)实际上拥有无限的分辨率。我们可以通过对每个像素取一组采样(sample)的平均值来获得同样的效果。

如果每个像素只有一条穿过其中心的光线(ray),我们做的就是通常所说的 _点采样(point sampling)_。点采样的问题可以用这样一个例子说明:渲染远处的一个小棋盘。假设这个棋盘由 8×8 的黑白方格组成,但只有四条光线击中了它,那么这四条光线可能全都只与白格相交,或者全都只与黑格相交,又或者是某种奇怪的组合。在现实世界中,当我们用眼睛看远处的棋盘时,看到的是一片灰色,而不是一个个清晰的黑点和白点。这是因为我们的眼睛天然就在做我们希望光线追踪器(ray tracer)去做的事情:对落在渲染图像某个特定(离散)区域上的光(这是一个连续函数)进行积分。

显然,让同一条穿过像素中心的光线重复采样多次是没有任何好处的——每次只会得到相同的结果。我们要做的是对落在像素 _周围_ 的光进行采样,再对这些样本积分,以逼近真实的连续结果。那么,怎样对落在像素周围的光进行积分呢?

我们采用最简单的模型:对以像素为中心、向四个相邻像素各延伸一半距离的正方形区域进行采样。这不是最优的方法,但它最直接。(想深入了解这个话题,可以参阅 [_A Pixel is Not a Little Square_](https://www.researchgate.net/publication/244986797)。)

![图 8:像素采样](/raytracing/rtiow/fig-1.08-pixel-samples.jpg)

## 8.1 一些随机数工具函数

我们需要一个能返回实数随机数的随机数生成器。这个函数应当返回一个规范随机数(canonical random number),按照惯例,它落在 $0 ≤ n < 1$ 范围内。1 前面的“小于”很重要,因为我们有时会利用这一点。

一种简单的做法是使用 `<cstdlib>` 中的 `std::rand()` 函数,它返回 0 到 `RAND_MAX` 之间的一个随机整数。因此,把下面的代码片段加入 `rtweekend.h`,就能得到我们想要的实数随机数:

**代码清单 41**:`rtweekend.h` `random_double()` 函数

```cpp {2,14-22}
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <memory>
...

// Utility Functions

inline double degrees_to_radians(double degrees) {
    return degrees * pi / 180.0;
}

inline double random_double() {
    // Returns a random real in [0,1).
    return std::rand() / (RAND_MAX + 1.0);
}

inline double random_double(double min, double max) {
    // Returns a random real in [min,max).
    return min + (max-min)*random_double();
}
```

C++ 传统上并没有标准的随机数生成器,不过较新的 C++ 版本通过 `<random>` 头文件解决了这个问题(尽管一些专家认为它并不完美)。如果你想使用它,可以按下面的方式获得满足我们要求的随机数:

**代码清单 42**:`rtweekend.h` `random_double()` 的另一种实现

```cpp {3,7-11}
...

#include <random>

...

inline double random_double() {
    static std::uniform_real_distribution<double> distribution(0.0, 1.0);
    static std::mt19937 generator;
    return distribution(generator);
}

inline double random_double(double min, double max) {
    // Returns a random real in [min,max).
    return min + (max-min)*random_double();
}

...
```

## 8.2 为每个像素生成多个采样

对于由多个采样组成的单个像素,我们会在像素周围的区域中选取样本,然后把得到的光照(颜色)值平均起来。

首先,我们要更新 `write_color()` 函数,让它考虑所使用的采样数量:我们需要求出所有采样的平均值。为此,我们会在每次迭代中累加完整的颜色,最后在写出颜色之前统一做一次除法(除以采样数)。为了确保最终结果的颜色分量保持在合理的 $[0,1]$ 范围内,我们将添加并使用一个小的辅助函数:`interval::clamp(x)`。

**代码清单 43**:`interval.h` `interval::clamp()` 工具函数

```cpp {9-13}
class interval {
  public:
    ...

    bool surrounds(double x) const {
        return min < x && x < max;
    }

    double clamp(double x) const {
        if (x < min) return min;
        if (x > max) return max;
        return x;
    }
    ...
};
```

下面是使用了区间截断(clamp)函数的新版 `write_color()`:

**代码清单 44**:`color.h` 支持多重采样的 `write_color()` 函数

```cpp {1,12-15}
#include "interval.h"
#include "vec3.h"

using color = vec3;

void write_color(std::ostream& out, const color& pixel_color) {
    auto r = pixel_color.x();
    auto g = pixel_color.y();
    auto b = pixel_color.z();

    // Translate the [0,1] component values to the byte range [0,255].
    static const interval intensity(0.000, 0.999);
    int rbyte = int(256 * intensity.clamp(r));
    int gbyte = int(256 * intensity.clamp(g));
    int bbyte = int(256 * intensity.clamp(b));

    // Write out the pixel color components.
    out << rbyte << ' ' << gbyte << ' ' << bbyte << '\n';
}
```

现在来更新相机(camera)类,定义并使用一个新函数 `camera::get_ray(i,j)`,它会为每个像素生成不同的采样。这个函数会用到一个新的辅助函数 `sample_square()`,后者在以原点为中心的单位正方形内生成一个随机采样点。然后,我们再把这个理想正方形中的随机样本变换回当前正在采样的那个像素上。

**代码清单 45**:`camera.h` 带有每像素采样数参数的相机

```cpp {5,15-20,29,39,45-63}
class camera {
  public:
    double aspect_ratio      = 1.0;  // Ratio of image width over height
    int    image_width       = 100;  // Rendered image width in pixel count
    int    samples_per_pixel = 10;   // Count of random samples for each pixel

    void render(const hittable& world) {
        initialize();

        std::cout << "P3\n" << image_width << ' ' << image_height << "\n255\n";

        for (int j = 0; j < image_height; j++) {
            std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
            for (int i = 0; i < image_width; i++) {
                color pixel_color(0,0,0);
                for (int sample = 0; sample < samples_per_pixel; sample++) {
                    ray r = get_ray(i, j);
                    pixel_color += ray_color(r, world);
                }
                write_color(std::cout, pixel_samples_scale * pixel_color);
            }
        }

        std::clog << "\rDone.                 \n";
    }
    ...
  private:
    int    image_height;         // Rendered image height
    double pixel_samples_scale;  // Color scale factor for a sum of pixel samples
    point3 center;               // Camera center
    point3 pixel00_loc;          // Location of pixel 0, 0
    vec3   pixel_delta_u;        // Offset to pixel to the right
    vec3   pixel_delta_v;        // Offset to pixel below

    void initialize() {
        image_height = int(image_width / aspect_ratio);
        image_height = (image_height < 1) ? 1 : image_height;

        pixel_samples_scale = 1.0 / samples_per_pixel;

        center = point3(0, 0, 0);
        ...
    }

    ray get_ray(int i, int j) const {
        // Construct a camera ray originating from the origin and directed at randomly sampled
        // point around the pixel location i, j.

        auto offset = sample_square();
        auto pixel_sample = pixel00_loc
                          + ((i + offset.x()) * pixel_delta_u)
                          + ((j + offset.y()) * pixel_delta_v);

        auto ray_origin = center;
        auto ray_direction = pixel_sample - ray_origin;

        return ray(ray_origin, ray_direction);
    }

    vec3 sample_square() const {
        // Returns the vector to a random point in the [-.5,-.5]-[+.5,+.5] unit square.
        return vec3(random_double() - 0.5, random_double() - 0.5, 0);
    }

    color ray_color(const ray& r, const hittable& world) const {
        ...
    }
};

#endif
```

(除了上面新增的 `sample_square()` 函数之外,你还会在 GitHub 上的源代码中看到 `sample_disk()` 函数。它是为想要尝试非正方形像素的读者准备的,本书不会用到它。`sample_disk()` 依赖于后面才会定义的 `random_in_unit_disk()` 函数。)

更新 main 函数,设置这个新的相机参数。

**代码清单 46**:`main.cc` 设置新的每像素采样数参数

```cpp {8}
int main() {
    ...

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;

    cam.render(world);
}
```

放大生成的图像,就能看出边缘像素的差别。

![图像 6:抗锯齿前后对比](/raytracing/rtiow/img-1.06-antialias-before-after.png)
