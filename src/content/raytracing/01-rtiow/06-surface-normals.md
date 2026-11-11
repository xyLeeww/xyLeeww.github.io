---
title: "6. 表面法线与多个物体(Surface Normals and Multiple Objects)"
order: 6
description: "用表面法线为球体着色,化简光线-球体求交代码,并引入 hittable 抽象、物体列表与 interval 类,让场景支持多个物体。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#surfacenormalsandmultipleobjects"
sourceTitle: "Ray Tracing in One Weekend · Surface Normals and Multiple Objects"
license: "CC0 1.0"
---

## 6.1 用表面法线着色

首先,我们来求出表面法线(surface normal),这样就可以进行着色了。表面法线是一个在交点处垂直于表面的向量。

关于代码中的法向量,我们要做一个关键的设计决定:法向量是允许任意长度,还是统一归一化为单位长度。

归一化向量需要做一次开销较大的平方根运算,在用不着的时候跳过它,是很有诱惑力的。但在实践中,有三点重要的观察。第一,只要在 _任何_ 地方需要单位长度的法向量,那还不如一开始就统一做一次,而不是在每个需要单位长度的地方“以防万一”地一遍又一遍地做。第二,我们 _确实_ 在好几个地方需要单位长度的法向量。第三,如果要求法向量是单位长度,那么往往可以借助对具体几何体类型的了解,在它的构造函数或 `hit()` 函数中高效地得到这个向量。例如,球体的法线只需除以球的半径就能变成单位长度,完全不需要开平方。

综上所述,我们采用这样的约定:所有法向量都是单位长度。

对球体来说,朝外的法线方向就是交点减去球心的方向:

![图 6:球体表面法线的几何关系](/raytracing/rtiow/fig-1.06-sphere-normal.jpg)

放到地球上来说,就是从地心指向你的向量是笔直向上的。现在把它写进代码并进行着色。我们还没有任何光源之类的东西,所以先用颜色映射把法线可视化出来。可视化法线的一个常用技巧(因为很容易,而且假定 $\mathbf{n}$ 是单位向量也比较直观——这样每个分量都在 -1 到 1 之间)是把每个分量映射到 0 到 1 的区间,再把 $(x, y, z)$ 映射为 $(\mathit{red}, \mathit{green}, \mathit{blue})$。为了求法线,我们需要知道交点,而不只是是否命中(这正是我们目前唯一计算的东西)。场景中只有一个球,而且它就在相机正前方,所以暂时不用担心 $t$ 为负的情况。我们直接假定最近的交点(最小的 $t$)就是我们想要的那个。下面这些代码修改让我们能够计算并可视化 $\mathbf{n}$:

**代码清单 12**:`main.cc` 在球体上渲染表面法线

```cpp {1,8-12,16-20}
double hit_sphere(const point3& center, double radius, const ray& r) {
    vec3 oc = center - r.origin();
    auto a = dot(r.direction(), r.direction());
    auto b = -2.0 * dot(r.direction(), oc);
    auto c = dot(oc, oc) - radius*radius;
    auto discriminant = b*b - 4*a*c;

    if (discriminant < 0) {
        return -1.0;
    } else {
        return (-b - std::sqrt(discriminant) ) / (2.0*a);
    }
}

color ray_color(const ray& r) {
    auto t = hit_sphere(point3(0,0,-1), 0.5, r);
    if (t > 0.0) {
        vec3 N = unit_vector(r.at(t) - vec3(0,0,-1));
        return 0.5*color(N.x()+1, N.y()+1, N.z()+1);
    }

    vec3 unit_direction = unit_vector(r.direction());
    auto a = 0.5*(unit_direction.y() + 1.0);
    return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
}
```

得到的图片如下:

![图像 4:按法向量着色的球体](/raytracing/rtiow/img-1.04-normals-sphere.png)

## 6.2 化简光线-球体求交代码

我们回过头来再看看光线-球体求交函数:

**代码清单 13**:`main.cc` 光线-球体求交代码(化简前)

```cpp
double hit_sphere(const point3& center, double radius, const ray& r) {
    vec3 oc = center - r.origin();
    auto a = dot(r.direction(), r.direction());
    auto b = -2.0 * dot(r.direction(), oc);
    auto c = dot(oc, oc) - radius*radius;
    auto discriminant = b*b - 4*a*c;

    if (discriminant < 0) {
        return -1.0;
    } else {
        return (-b - std::sqrt(discriminant) ) / (2.0*a);
    }
}
```

首先,回忆一下:一个向量与自身的点积等于该向量长度的平方。

其次,注意 `b` 的表达式里有一个因子 -2。来看看当 $b = -2h$ 时,二次方程的求根公式会变成什么样:

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

$$
= \frac{-(-2h) \pm \sqrt{(-2h)^2 - 4ac}}{2a}
$$

$$
= \frac{2h \pm 2\sqrt{h^2 - ac}}{2a}
$$

$$
= \frac{h \pm \sqrt{h^2 - ac}}{a}
$$

化简后的形式很简洁,所以我们就用它。接下来求解 $h$:

$$
b = -2 \mathbf{d} \cdot (\mathbf{C} - \mathbf{Q})
$$

$$
b = -2h
$$

$$
h = \frac{b}{-2} = \mathbf{d} \cdot (\mathbf{C} - \mathbf{Q})
$$

利用这些观察,现在可以把球体求交代码化简成这样:

**代码清单 14**:`main.cc` 光线-球体求交代码(化简后)

```cpp {3-6,11}
double hit_sphere(const point3& center, double radius, const ray& r) {
    vec3 oc = center - r.origin();
    auto a = r.direction().length_squared();
    auto h = dot(r.direction(), oc);
    auto c = oc.length_squared() - radius*radius;
    auto discriminant = h*h - a*c;

    if (discriminant < 0) {
        return -1.0;
    } else {
        return (h - std::sqrt(discriminant)) / a;
    }
}
```

## 6.3 可命中物体的抽象

那么,如果有不止一个球呢?虽然用一个球体数组很诱人,但一个非常干净的方案是:为光线可能命中的任何东西定义一个“抽象类”,让球体和球体列表都只是“某种可以被命中的东西”。这个类该叫什么名字有点让人纠结——要不是有“面向对象”编程这个说法,叫它“object”(物体)本来挺好。“surface”(表面)也很常用,但缺点是我们以后可能会需要体积(雾、云之类的东西)。“hittable”强调的是把它们统一起来的那个成员函数。这些名字我都不太喜欢,不过我们还是选用“hittable”。

这个 `hittable` 抽象类有一个接收光线作为参数的 `hit` 函数。大多数光线追踪器都发现,给命中加上一个有效区间 $t_{\mathit{min}}$ 到 $t_{\mathit{max}}$ 会很方便,只有当 $t_{\mathit{min}} < t < t_{\mathit{max}}$ 时命中才“算数”。对于最初的光线,这个区间就是正的 $t$;但我们后面会看到,使用 $t_{\mathit{min}}$ 到 $t_{\mathit{max}}$ 这样的区间可以简化代码。还有一个设计问题:命中某个东西时,是否要顺便计算法线之类的信息。在搜索过程中,我们可能会命中更近的物体,而最终只需要最近那个物体的法线。我采用简单的方案,把一堆信息计算出来,存进某个结构体里。下面是这个抽象类:

**代码清单 15**:`hittable.h` hittable 类

```cpp
#ifndef HITTABLE_H
#define HITTABLE_H

#include "ray.h"

class hit_record {
  public:
    point3 p;
    vec3 normal;
    double t;
};

class hittable {
  public:
    virtual ~hittable() = default;

    virtual bool hit(const ray& r, double ray_tmin, double ray_tmax, hit_record& rec) const = 0;
};

#endif
```

下面是球体:

**代码清单 16**:`sphere.h` sphere 类

```cpp
#ifndef SPHERE_H
#define SPHERE_H

#include "hittable.h"
#include "vec3.h"

class sphere : public hittable {
  public:
    sphere(const point3& center, double radius) : center(center), radius(std::fmax(0,radius)) {}

    bool hit(const ray& r, double ray_tmin, double ray_tmax, hit_record& rec) const override {
        vec3 oc = center - r.origin();
        auto a = r.direction().length_squared();
        auto h = dot(r.direction(), oc);
        auto c = oc.length_squared() - radius*radius;

        auto discriminant = h*h - a*c;
        if (discriminant < 0)
            return false;

        auto sqrtd = std::sqrt(discriminant);

        // Find the nearest root that lies in the acceptable range.
        auto root = (h - sqrtd) / a;
        if (root <= ray_tmin || ray_tmax <= root) {
            root = (h + sqrtd) / a;
            if (root <= ray_tmin || ray_tmax <= root)
                return false;
        }

        rec.t = root;
        rec.p = r.at(rec.t);
        rec.normal = (rec.p - center) / radius;

        return true;
    }

  private:
    point3 center;
    double radius;
};

#endif
```

(注意,这里用到了 C++ 标准函数 `std::fmax()`,它返回两个浮点参数中较大的那个。类似地,我们之后还会用到 `std::fmin()`,它返回两个浮点参数中较小的那个。)

## 6.4 正面与背面

关于法线的第二个设计决定是:法线是否应该总是朝外。目前求得的法线总是从球心指向交点的方向(法线朝外)。如果光线从外部与球体相交,法线与光线方向相反;如果光线从内部与球体相交,(始终朝外的)法线就与光线方向相同。另一种做法是让法线总是与光线方向相反:光线在球外时,法线朝外;光线在球内时,法线朝内。

![图 7:球体表面法线可能的朝向](/raytracing/rtiow/fig-1.07-normal-sides.jpg)

我们必须在这两种做法中选一种,因为最终我们会想知道光线是从表面的哪一侧射来的。对于两面渲染效果不同的物体(比如双面印字的纸张上的文字),或者有内外之分的物体(比如玻璃球),这一点很重要。

如果我们决定让法线总是朝外,那么在给光线着色时,就需要判断光线位于哪一侧。可以通过比较光线和法线来判断:如果光线和法线朝向同一方向,光线就在物体内部;如果光线和法线朝向相反方向,光线就在物体外部。这可以通过计算两个向量的点积来确定:如果点积为正,光线就在球体内部。

**代码清单 17**:比较光线与法线

```cpp
if (dot(ray_direction, outward_normal) > 0.0) {
    // ray is inside the sphere
    ...
} else {
    // ray is outside the sphere
    ...
}
```

如果我们决定让法线总是与光线方向相反,就无法再用点积来判断光线位于表面的哪一侧,而需要把这个信息存下来:

**代码清单 18**:记住表面的哪一侧

```cpp
bool front_face;
if (dot(ray_direction, outward_normal) > 0.0) {
    // ray is inside the sphere
    normal = -outward_normal;
    front_face = false;
} else {
    // ray is outside the sphere
    normal = outward_normal;
    front_face = true;
}
```

我们可以让法线总是从表面指向“外侧”,也可以让它总是与入射光线方向相反。这个选择取决于你想在几何求交时判断表面朝向,还是在着色时判断。本书中材质类型比几何体类型多,所以我们选择工作量更少的方案,把判断放在几何求交阶段。这纯粹是个人偏好问题,在文献中两种实现都能见到。

我们给 `hit_record` 类加上一个 `front_face` 布尔成员,并添加一个函数 `set_face_normal()` 来帮我们完成这项计算。为方便起见,我们假定传给新函数 `set_face_normal()` 的向量是单位长度的。当然也可以在函数里显式地对参数做归一化,但让几何体代码来做会更高效,因为当你对具体几何体了解得更多时,这件事通常更容易做。

**代码清单 19**:`hittable.h` 为 hit_record 添加正面(front face)跟踪

```cpp {6-14}
class hit_record {
  public:
    point3 p;
    vec3 normal;
    double t;
    bool front_face;

    void set_face_normal(const ray& r, const vec3& outward_normal) {
        // Sets the hit record normal vector.
        // NOTE: the parameter `outward_normal` is assumed to have unit length.

        front_face = dot(r.direction(), outward_normal) < 0;
        normal = front_face ? outward_normal : -outward_normal;
    }
};
```

然后把表面朝向的判断加到 sphere 类中:

**代码清单 20**:`sphere.h` 带法线朝向判断的 sphere 类

```cpp {9-10}
class sphere : public hittable {
  public:
    ...
    bool hit(const ray& r, double ray_tmin, double ray_tmax, hit_record& rec) const {
        ...

        rec.t = root;
        rec.p = r.at(rec.t);
        vec3 outward_normal = (rec.p - center) / radius;
        rec.set_face_normal(r, outward_normal);

        return true;
    }
    ...
};
```

## 6.5 可命中物体列表

我们已经有了一个叫 `hittable` 的通用物体类型,光线可以与它相交。现在再添加一个类,用来存储一组 `hittable`:

**代码清单 21**:`hittable_list.h` hittable_list 类

```cpp
#ifndef HITTABLE_LIST_H
#define HITTABLE_LIST_H

#include "hittable.h"

#include <memory>
#include <vector>

using std::make_shared;
using std::shared_ptr;

class hittable_list : public hittable {
  public:
    std::vector<shared_ptr<hittable>> objects;

    hittable_list() {}
    hittable_list(shared_ptr<hittable> object) { add(object); }

    void clear() { objects.clear(); }

    void add(shared_ptr<hittable> object) {
        objects.push_back(object);
    }

    bool hit(const ray& r, double ray_tmin, double ray_tmax, hit_record& rec) const override {
        hit_record temp_rec;
        bool hit_anything = false;
        auto closest_so_far = ray_tmax;

        for (const auto& object : objects) {
            if (object->hit(r, ray_tmin, closest_so_far, temp_rec)) {
                hit_anything = true;
                closest_so_far = temp_rec.t;
                rec = temp_rec;
            }
        }

        return hit_anything;
    }
};

#endif
```

## 6.6 一些新的 C++ 特性

`hittable_list` 类的代码用到了几个 C++ 特性,如果你平时不怎么写 C++,可能会被它们绊住:`vector`、`shared_ptr` 和 `make_shared`。

`shared_ptr<type>` 是指向某个已分配类型对象的指针,具有引用计数语义。每当你把它的值赋给另一个共享指针(通常就是一次简单赋值),引用计数就加一。当共享指针离开作用域(比如在代码块或函数末尾)时,引用计数就减一。一旦计数降为零,对象就会被安全地删除。

通常,共享指针会先用一个新分配的对象来初始化,大致如下:

**代码清单 22**:使用 shared_ptr 分配对象的示例

```cpp
shared_ptr<double> double_ptr = make_shared<double>(0.37);
shared_ptr<vec3>   vec3_ptr   = make_shared<vec3>(1.414214, 2.718281, 1.618034);
shared_ptr<sphere> sphere_ptr = make_shared<sphere>(point3(0,0,0), 1.0);
```

`make_shared<thing>(thing_constructor_params ...)` 会使用给定的构造函数参数,分配一个 `thing` 类型的新实例,并返回一个 `shared_ptr<thing>`。

由于类型可以从 `make_shared<type>(...)` 的返回类型自动推导出来,上面几行可以用 C++ 的 `auto` 类型说明符更简洁地写成:

**代码清单 23**:使用 shared_ptr 与 auto 类型分配对象的示例

```cpp
auto double_ptr = make_shared<double>(0.37);
auto vec3_ptr   = make_shared<vec3>(1.414214, 2.718281, 1.618034);
auto sphere_ptr = make_shared<sphere>(point3(0,0,0), 1.0);
```

我们会在代码中使用共享指针,因为它允许多个几何体共享同一个实例(例如一堆都使用同一种颜色材质的球体),而且能让内存管理自动化,也更容易理解。

`std::shared_ptr` 包含在头文件 `<memory>` 中。

你可能不熟悉的第二个 C++ 特性是 `std::vector`。它是一个泛型的、类似数组的容器,可以存放任意类型。上面我们用它存放指向 `hittable` 的指针。`std::vector` 会随着值的加入而自动增长:`objects.push_back(object)` 会把一个值添加到 `std::vector` 成员变量 `objects` 的末尾。

`std::vector` 包含在头文件 `<vector>` 中。

最后,代码清单 21 中的 `using` 语句告诉编译器,我们将从 `std` 库中获取 `shared_ptr` 和 `make_shared`,这样每次引用它们时就不必加上 `std::` 前缀了。

## 6.7 常用常量与工具函数

我们需要一些数学常量,方便起见把它们定义在单独的头文件里。目前我们只需要无穷大(infinity),不过也顺手把我们自己定义的 pi 放进去,后面会用到。我们还会把常用的常量以及以后的工具函数都放在这里。这个新头文件 `rtweekend.h` 将成为我们通用的主头文件。

**代码清单 24**:`rtweekend.h` 公共头文件 rtweekend.h

```cpp
#ifndef RTWEEKEND_H
#define RTWEEKEND_H

#include <cmath>
#include <iostream>
#include <limits>
#include <memory>

// C++ Std Usings

using std::make_shared;
using std::shared_ptr;

// Constants

const double infinity = std::numeric_limits<double>::infinity();
const double pi = 3.1415926535897932385;

// Utility Functions

inline double degrees_to_radians(double degrees) {
    return degrees * pi / 180.0;
}

// Common Headers

#include "color.h"
#include "ray.h"
#include "vec3.h"

#endif
```

程序源文件会首先包含 `rtweekend.h`,这样其他所有头文件(我们的大部分代码都在头文件里)都可以默认 `rtweekend.h` 已经被包含了。头文件仍然需要显式包含它所需的其他头文件。基于这些前提,我们对代码做一些更新。

**代码清单 25**:`color.h` 假定已包含 rtweekend.h

```cpp del={1}
#include <iostream>
```

**代码清单 26**:`hittable.h` 假定已包含 rtweekend.h

```cpp del={1}
#include "ray.h"
```

**代码清单 27**:`hittable_list.h` 假定已包含 rtweekend.h

```cpp del={1,4-5}
#include <memory>
#include <vector>

using std::make_shared;
using std::shared_ptr;
```

**代码清单 28**:`sphere.h` 假定已包含 rtweekend.h

```cpp del={1}
#include "vec3.h"
```

**代码清单 29**:`vec3.h` 假定已包含 rtweekend.h

```cpp del={1-2}
#include <cmath>
#include <iostream>
```

下面是新的 main:

**代码清单 30**:`main.cc` 使用 hittable 的新 main

```cpp {1,6-8,16-20,38-43,76} del={3-5,10-14}
#include "rtweekend.h"

#include "color.h"
#include "ray.h"
#include "vec3.h"
#include "hittable.h"
#include "hittable_list.h"
#include "sphere.h"

#include <iostream>

double hit_sphere(const point3& center, double radius, const ray& r) {
    ...
}

color ray_color(const ray& r, const hittable& world) {
    hit_record rec;
    if (world.hit(r, 0, infinity, rec)) {
        return 0.5 * (rec.normal + color(1,1,1));
    }

    vec3 unit_direction = unit_vector(r.direction());
    auto a = 0.5*(unit_direction.y() + 1.0);
    return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
}

int main() {

    // Image

    auto aspect_ratio = 16.0 / 9.0;
    int image_width = 400;

    // Calculate the image height, and ensure that it's at least 1.
    int image_height = int(image_width / aspect_ratio);
    image_height = (image_height < 1) ? 1 : image_height;

    // World

    hittable_list world;

    world.add(make_shared<sphere>(point3(0,0,-1), 0.5));
    world.add(make_shared<sphere>(point3(0,-100.5,-1), 100));

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

    std::cout << "P3\n" << image_width << ' ' << image_height << "\n255\n";

    for (int j = 0; j < image_height; j++) {
        std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
        for (int i = 0; i < image_width; i++) {
            auto pixel_center = pixel00_loc + (i * pixel_delta_u) + (j * pixel_delta_v);
            auto ray_direction = pixel_center - camera_center;
            ray r(camera_center, ray_direction);

            color pixel_color = ray_color(r, world);
            write_color(std::cout, pixel_color);
        }
    }

    std::clog << "\rDone.                 \n";
}
```

这样得到的图片实际上只是把球体的位置及其表面法线可视化了出来。这通常是查看几何模型的缺陷或特定性质的好办法。

![图像 5:带地面的、按法线着色的球体渲染结果](/raytracing/rtiow/img-1.05-normals-sphere-ground.png)

## 6.8 区间类

在继续之前,我们先实现一个区间(interval)类,用来管理带有最小值和最大值的实数区间。接下来我们会经常用到这个类。

**代码清单 31**:`interval.h` 引入新的 interval 类

```cpp
#ifndef INTERVAL_H
#define INTERVAL_H

class interval {
  public:
    double min, max;

    interval() : min(+infinity), max(-infinity) {} // Default interval is empty

    interval(double min, double max) : min(min), max(max) {}

    double size() const {
        return max - min;
    }

    bool contains(double x) const {
        return min <= x && x <= max;
    }

    bool surrounds(double x) const {
        return min < x && x < max;
    }

    static const interval empty, universe;
};

const interval interval::empty    = interval(+infinity, -infinity);
const interval interval::universe = interval(-infinity, +infinity);

#endif
```

**代码清单 32**:`rtweekend.h` 包含新的 interval 类

```cpp {4}
// Common Headers

#include "color.h"
#include "interval.h"
#include "ray.h"
#include "vec3.h"
```

**代码清单 33**:`hittable.h` 使用 interval 的 hittable::hit()

```cpp {4}
class hittable {
  public:
    ...
    virtual bool hit(const ray& r, interval ray_t, hit_record& rec) const = 0;
};
```

**代码清单 34**:`hittable_list.h` 使用 interval 的 hittable_list::hit()

```cpp {4,7,10}
class hittable_list : public hittable {
  public:
    ...
    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        hit_record temp_rec;
        bool hit_anything = false;
        auto closest_so_far = ray_t.max;

        for (const auto& object : objects) {
            if (object->hit(r, interval(ray_t.min, closest_so_far), temp_rec)) {
                hit_anything = true;
                closest_so_far = temp_rec.t;
                rec = temp_rec;
            }
        }

        return hit_anything;
    }
    ...
};
```

**代码清单 35**:`sphere.h` 使用 interval 的 sphere

```cpp {4,9,11}
class sphere : public hittable {
  public:
    ...
    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        ...

        // Find the nearest root that lies in the acceptable range.
        auto root = (h - sqrtd) / a;
        if (!ray_t.surrounds(root)) {
            root = (h + sqrtd) / a;
            if (!ray_t.surrounds(root))
                return false;
        }
        ...
    }
    ...
};
```

**代码清单 36**:`main.cc` 使用 interval 的新 main

```cpp {3}
color ray_color(const ray& r, const hittable& world) {
    hit_record rec;
    if (world.hit(r, interval(0, infinity), rec)) {
        return 0.5 * (rec.normal + color(1,1,1));
    }

    vec3 unit_direction = unit_vector(r.direction());
    auto a = 0.5*(unit_direction.y() + 1.0);
    return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
}
```
