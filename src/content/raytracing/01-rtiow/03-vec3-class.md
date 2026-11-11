---
title: "3. vec3 类(The vec3 Class)"
order: 3
description: "定义同时用于点、方向和颜色的 vec3 类及其工具函数,并编写颜色输出函数"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#thevec3class"
sourceTitle: "Ray Tracing in One Weekend · The vec3 Class"
license: "CC0 1.0"
---

几乎所有图形程序都有一个(或几个)用于存储几何向量和颜色的类。在许多系统中,这些向量是 4D 的(对几何来说是 3D 位置加一个齐次坐标,对颜色来说是 RGB 加一个 alpha 透明度分量)。就我们的用途而言,三个坐标就够了。我们会用同一个类 `vec3` 来表示颜色、位置、方向、偏移量,以及其他任何东西。有些人不喜欢这样做,因为它无法阻止你做一些傻事,比如用颜色减去一个位置。他们说得有道理,但只要不是明显错误,我们总是选择“代码更少”的路线。尽管如此,我们还是为 `vec3` 声明了两个别名:`point3` 和 `color`。由于这两个类型只是 `vec3` 的别名,所以当你把一个 `color` 传给期望 `point3` 的函数时不会得到任何警告,也没有什么能阻止你把一个 `point3` 加到一个 `color` 上,但这样做能让代码更易读、更易懂一些。

我们在一个新的头文件 `vec3.h` 的上半部分定义 `vec3` 类,在下半部分定义一组实用的向量工具函数:

**代码清单 4**:`vec3.h` vec3 的定义和辅助函数

```cpp
#ifndef VEC3_H
#define VEC3_H

#include <cmath>
#include <iostream>

class vec3 {
  public:
    double e[3];

    vec3() : e{0,0,0} {}
    vec3(double e0, double e1, double e2) : e{e0, e1, e2} {}

    double x() const { return e[0]; }
    double y() const { return e[1]; }
    double z() const { return e[2]; }

    vec3 operator-() const { return vec3(-e[0], -e[1], -e[2]); }
    double operator[](int i) const { return e[i]; }
    double& operator[](int i) { return e[i]; }

    vec3& operator+=(const vec3& v) {
        e[0] += v.e[0];
        e[1] += v.e[1];
        e[2] += v.e[2];
        return *this;
    }

    vec3& operator*=(double t) {
        e[0] *= t;
        e[1] *= t;
        e[2] *= t;
        return *this;
    }

    vec3& operator/=(double t) {
        return *this *= 1/t;
    }

    double length() const {
        return std::sqrt(length_squared());
    }

    double length_squared() const {
        return e[0]*e[0] + e[1]*e[1] + e[2]*e[2];
    }
};

// point3 is just an alias for vec3, but useful for geometric clarity in the code.
using point3 = vec3;


// Vector Utility Functions

inline std::ostream& operator<<(std::ostream& out, const vec3& v) {
    return out << v.e[0] << ' ' << v.e[1] << ' ' << v.e[2];
}

inline vec3 operator+(const vec3& u, const vec3& v) {
    return vec3(u.e[0] + v.e[0], u.e[1] + v.e[1], u.e[2] + v.e[2]);
}

inline vec3 operator-(const vec3& u, const vec3& v) {
    return vec3(u.e[0] - v.e[0], u.e[1] - v.e[1], u.e[2] - v.e[2]);
}

inline vec3 operator*(const vec3& u, const vec3& v) {
    return vec3(u.e[0] * v.e[0], u.e[1] * v.e[1], u.e[2] * v.e[2]);
}

inline vec3 operator*(double t, const vec3& v) {
    return vec3(t*v.e[0], t*v.e[1], t*v.e[2]);
}

inline vec3 operator*(const vec3& v, double t) {
    return t * v;
}

inline vec3 operator/(const vec3& v, double t) {
    return (1/t) * v;
}

inline double dot(const vec3& u, const vec3& v) {
    return u.e[0] * v.e[0]
         + u.e[1] * v.e[1]
         + u.e[2] * v.e[2];
}

inline vec3 cross(const vec3& u, const vec3& v) {
    return vec3(u.e[1] * v.e[2] - u.e[2] * v.e[1],
                u.e[2] * v.e[0] - u.e[0] * v.e[2],
                u.e[0] * v.e[1] - u.e[1] * v.e[0]);
}

inline vec3 unit_vector(const vec3& v) {
    return v / v.length();
}

#endif
```

这里我们使用 `double`,但有些光线追踪器使用 `float`。`double` 的精度和范围更大,但大小是 `float` 的两倍。如果你是在内存受限的条件下编程(比如硬件着色器),这种大小上的增加可能很重要。两者都可以——按你自己的喜好来。

## 3.1 颜色工具函数

利用新的 `vec3` 类,我们创建一个新的头文件 `color.h`,并定义一个工具函数,把单个像素的颜色写到标准输出流。

**代码清单 5**:`color.h` 颜色工具函数

```cpp
#ifndef COLOR_H
#define COLOR_H

#include "vec3.h"

#include <iostream>

using color = vec3;

void write_color(std::ostream& out, const color& pixel_color) {
    auto r = pixel_color.x();
    auto g = pixel_color.y();
    auto b = pixel_color.z();

    // Translate the [0,1] component values to the byte range [0,255].
    int rbyte = int(255.999 * r);
    int gbyte = int(255.999 * g);
    int bbyte = int(255.999 * b);

    // Write out the pixel color components.
    out << rbyte << ' ' << gbyte << ' ' << bbyte << '\n';
}

#endif
```

现在我们可以修改 main,让它同时使用这两个文件:

**代码清单 6**:`main.cc` 第一张 PPM 图像的最终代码(新增两条 `#include`,并在内层循环中改用 `color` 与 `write_color`)

```cpp
#include "color.h"
#include "vec3.h"

#include <iostream>

int main() {

    // Image

    int image_width = 256;
    int image_height = 256;

    // Render

    std::cout << "P3\n" << image_width << ' ' << image_height << "\n255\n";

    for (int j = 0; j < image_height; j++) {
        std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
        for (int i = 0; i < image_width; i++) {
            auto pixel_color = color(double(i)/(image_width-1), double(j)/(image_height-1), 0);
            write_color(std::cout, pixel_color);
        }
    }

    std::clog << "\rDone.                 \n";
}
```

你应该会得到和之前完全相同的图像。
