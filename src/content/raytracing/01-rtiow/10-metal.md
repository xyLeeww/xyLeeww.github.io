---
title: "10. 金属(Metal)"
order: 10
description: "引入抽象材质类,实现朗伯材质与可调模糊度的金属材质,并渲染出带有金属球的场景。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#metal"
sourceTitle: "Ray Tracing in One Weekend · Metal"
license: "CC0 1.0"
---

## 10.1 材质的抽象类

如果我们希望不同的物体拥有不同的材质(material),就需要做一个设计上的决定。我们可以设计一个通用的材质类型,带有大量参数,这样每一种具体材质只需忽略那些与它无关的参数即可。这并不是一个坏办法。或者,我们也可以设计一个抽象的材质类,把每种材质独有的行为封装起来。我更喜欢后一种做法。在我们的程序里,材质需要做两件事:

1. 产生一条散射光线(或者表明它吸收了入射光线)。
2. 如果发生了散射,说明这条光线应当被衰减(attenuation)多少。

由此可以得到下面这个抽象类:

**代码清单 58**:`material.h` 材质类

```cpp
#ifndef MATERIAL_H
#define MATERIAL_H

#include "hittable.h"

class material {
  public:
    virtual ~material() = default;

    virtual bool scatter(
        const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered
    ) const {
        return false;
    }
};

#endif
```

## 10.2 描述光线与物体相交的数据结构

`hit_record` 的作用是避免传递一大堆参数,这样我们可以把想要的任何信息都塞进去。你也可以直接使用多个参数而不是封装一个类型,这只是个人口味问题。可命中物体(hittable)和材质需要在代码中互相引用对方的类型,因此引用关系存在一定的循环。在 C++ 中,我们加上一行 `class material;`,告诉编译器 `material` 是一个稍后才会定义的类。由于我们只是声明了一个指向该类的指针,编译器并不需要知道这个类的细节,这样就解决了循环引用的问题。

**代码清单 59**:`hittable.h` 添加了材质指针的命中记录

```cpp
class material;

class hit_record {
  public:
    point3 p;
    vec3 normal;
    shared_ptr<material> mat;
    double t;
    bool front_face;

    void set_face_normal(const ray& r, const vec3& outward_normal) {
        front_face = dot(r.direction(), outward_normal) < 0;
        normal = front_face ? outward_normal : -outward_normal;
    }
};
```

`hit_record` 只是把一堆参数塞进一个类里、以便成组传递的一种方式。当一条光线命中某个表面(例如某个特定的球体)时,`hit_record` 中的材质指针会被设置为指向该球体的材质指针——也就是我们一开始在 `main()` 中创建这个球体时赋给它的那个。当 `ray_color()` 例程拿到 `hit_record` 后,就可以调用材质指针的成员函数,来确定会散射出什么样的光线(如果有的话)。

为此,`hit_record` 需要知道分配给这个球体的材质是什么。

**代码清单 60**:`sphere.h` 加入材质信息的光线-球体求交

```cpp
class sphere : public hittable {
  public:
    sphere(const point3& center, double radius) : center(center), radius(std::fmax(0,radius)) {
        // TODO: Initialize the material pointer `mat`.
    }

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        ...

        rec.t = root;
        rec.p = r.at(rec.t);
        vec3 outward_normal = (rec.p - center) / radius;
        rec.set_face_normal(r, outward_normal);
        rec.mat = mat;

        return true;
    }

  private:
    point3 center;
    double radius;
    shared_ptr<material> mat;
};
```

## 10.3 光线散射与反射率的建模

在这里以及本系列的其余部分,我们会使用*反照率*(albedo)这个术语(拉丁语,意为“白度”)。在某些学科中,反照率是一个有精确定义的技术术语,但无论在哪里,它都用来表示某种形式的*反射比例*(fractional reflectance)。反照率会随材质颜色而变化,并且(正如我们稍后为玻璃材质实现的那样)也可能随入射观察方向(即入射光线的方向)而变化。

朗伯(Lambertian,即漫反射)反射既可以总是散射光线,并按其反射率 $R$ 衰减光线;也可以只是有时散射(概率为 $1-R$)而不做衰减(没有被散射的光线就直接被材质吸收)。它还可以是这两种策略的混合。我们选择总是散射,于是实现朗伯材质就变成了一件简单的事:

**代码清单 61**:`material.h` 新的 lambertian 材质类

```cpp
class material {
    ...
};


class lambertian : public material {
  public:
    lambertian(const color& albedo) : albedo(albedo) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        auto scatter_direction = rec.normal + random_unit_vector();
        scattered = ray(rec.p, scatter_direction);
        attenuation = albedo;
        return true;
    }

  private:
    color albedo;
};
```

注意还有第三种选择:我们可以以某个固定的概率 $p$ 进行散射,并让衰减为 $\mathit{albedo}/p$。选哪种由你决定。

如果你仔细阅读上面的代码,会发现其中有一个小小的隐患。如果我们生成的随机单位向量恰好与法向量方向相反,两者相加就会得到零,从而产生一个长度为零的散射方向向量。这会在后面导致糟糕的情况(无穷大和 NaN),所以我们需要在把它传下去之前拦截这种情况。

为此,我们将新建一个向量方法——`vec3::near_zero()`——当向量在所有维度上都非常接近零时返回 true。

下面的改动会用到 C++ 标准库函数 `std::fabs`,它返回输入值的绝对值。

**代码清单 62**:`vec3.h` `vec3::near_zero()` 方法

```cpp
class vec3 {
    ...

    double length_squared() const {
        return e[0]*e[0] + e[1]*e[1] + e[2]*e[2];
    }


    bool near_zero() const {
        // Return true if the vector is close to zero in all dimensions.
        auto s = 1e-8;
        return (std::fabs(e[0]) < s) && (std::fabs(e[1]) < s) && (std::fabs(e[2]) < s);
    }

    ...
};
```

**代码清单 63**:`material.h` 万无一失的朗伯散射

```cpp
class lambertian : public material {
  public:
    lambertian(const color& albedo) : albedo(albedo) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        auto scatter_direction = rec.normal + random_unit_vector();


        // Catch degenerate scatter direction
        if (scatter_direction.near_zero())
            scatter_direction = rec.normal;

        scattered = ray(rec.p, scatter_direction);
        attenuation = albedo;
        return true;
    }

  private:
    color albedo;
};
```

## 10.4 镜面反射

对于抛光的金属,光线不会被随机散射。关键问题是:光线是如何从金属镜面上反射的?这里向量数学是我们的好帮手:

![图 15:光线反射](/raytracing/rtiow/fig-1.15-reflection.jpg)

红色所示的反射光线方向就是 $\mathbf{v} + 2\mathbf{b}$。在我们的设计中,$\mathbf{n}$ 是单位向量(长度为 1),但 $\mathbf{v}$ 不一定是。为了得到向量 $\mathbf{b}$,我们把法向量按 $\mathbf{v}$ 在 $\mathbf{n}$ 上投影的长度进行缩放,这个长度由点积 $\mathbf{v} \cdot \mathbf{n}$ 给出。(如果 $\mathbf{n}$ 不是单位向量,我们还需要把这个点积再除以 $\mathbf{n}$ 的长度。)最后,由于 $\mathbf{v}$ 指向表面*内部*,而我们希望 $\mathbf{b}$ 指向表面*外部*,所以需要对这个投影长度取负。

把这些综合起来,就得到了下面计算反射向量的代码:

**代码清单 64**:`vec3.h` vec3 反射函数

```cpp
...

inline vec3 random_on_hemisphere(const vec3& normal) {
    ...
}


inline vec3 reflect(const vec3& v, const vec3& n) {
    return v - 2*dot(v,n)*n;
}
```

金属材质只需用这个公式来反射光线:

**代码清单 65**:`material.h` 带反射函数的金属材质

```cpp
...

class lambertian : public material {
    ...
};


class metal : public material {
  public:
    metal(const color& albedo) : albedo(albedo) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        vec3 reflected = reflect(r_in.direction(), rec.normal);
        scattered = ray(rec.p, reflected);
        attenuation = albedo;
        return true;
    }

  private:
    color albedo;
};
```

我们需要修改 `ray_color()` 函数,以纳入上面所有的改动:

**代码清单 66**:`camera.h` 使用散射反射的光线颜色

```cpp
#include "hittable.h"
#include "material.h"
...

class camera {
  ...
  private:
    ...
    color ray_color(const ray& r, int depth, const hittable& world) const {
        // If we've exceeded the ray bounce limit, no more light is gathered.
        if (depth <= 0)
            return color(0,0,0);

        hit_record rec;

        if (world.hit(r, interval(0.001, infinity), rec)) {
            ray scattered;
            color attenuation;
            if (rec.mat->scatter(r, rec, attenuation, scattered))
                return attenuation * ray_color(scattered, depth-1, world);
            return color(0,0,0);
        }

        vec3 unit_direction = unit_vector(r.direction());
        auto a = 0.5*(unit_direction.y() + 1.0);
        return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
    }
};
```

现在我们更新 `sphere` 的构造函数,让它初始化材质指针 `mat`:

**代码清单 67**:`sphere.h` 用材质初始化球体

```cpp
class sphere : public hittable {
  public:
    sphere(const point3& center, double radius, shared_ptr<material> mat)
      : center(center), radius(std::fmax(0,radius)), mat(mat) {}

    ...
};
```

## 10.5 带有金属球的场景

现在,让我们往场景里加入一些金属球:

**代码清单 68**:`main.cc` 带有金属球的场景

```cpp
#include "rtweekend.h"

#include "camera.h"
#include "hittable.h"
#include "hittable_list.h"
#include "material.h"
#include "sphere.h"

int main() {
    hittable_list world;


    auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
    auto material_center = make_shared<lambertian>(color(0.1, 0.2, 0.5));
    auto material_left   = make_shared<metal>(color(0.8, 0.8, 0.8));
    auto material_right  = make_shared<metal>(color(0.8, 0.6, 0.2));

    world.add(make_shared<sphere>(point3( 0.0, -100.5, -1.0), 100.0, material_ground));
    world.add(make_shared<sphere>(point3( 0.0,    0.0, -1.2),   0.5, material_center));
    world.add(make_shared<sphere>(point3(-1.0,    0.0, -1.0),   0.5, material_left));
    world.add(make_shared<sphere>(point3( 1.0,    0.0, -1.0),   0.5, material_right));

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.render(world);
}
```

渲染结果如下:

![图像 13:闪亮的金属](/raytracing/rtiow/img-1.13-metal-shiny.png)

## 10.6 模糊反射

我们还可以借助一个小球体为反射光线选取一个新的终点,从而使反射方向随机化。我们会在以原终点为球心的球面上随机取一个点,并按模糊度(fuzz)因子进行缩放。

![图 16:生成模糊的反射光线](/raytracing/rtiow/fig-1.16-reflect-fuzzy.jpg)

这个模糊球越大,反射就越模糊。这启发我们添加一个模糊度参数,它就是这个球的半径(因此 0 表示没有扰动)。问题在于,对于较大的球或者掠射的光线,我们可能会把光线散射到表面以下。对于这种情况,我们可以直接让表面把它们吸收掉。

还要注意,为了让模糊球有意义,它相对于反射向量的缩放比例必须保持一致,而反射向量的长度可能任意变化。为了解决这个问题,我们需要把反射光线归一化。

**代码清单 69**:`material.h` 金属材质的模糊度

```cpp
class metal : public material {
  public:
    metal(const color& albedo, double fuzz) : albedo(albedo), fuzz(fuzz < 1 ? fuzz : 1) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        vec3 reflected = reflect(r_in.direction(), rec.normal);
        reflected = unit_vector(reflected) + (fuzz * random_unit_vector());
        scattered = ray(rec.p, reflected);
        attenuation = albedo;
        return (dot(scattered.direction(), rec.normal) > 0);
    }

  private:
    color albedo;
    double fuzz;
};
```

我们可以给两个金属球分别加上 0.3 和 1.0 的模糊度来试一试:

**代码清单 70**:`main.cc` 带模糊度的金属球

```cpp
int main() {
    ...
    auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
    auto material_center = make_shared<lambertian>(color(0.1, 0.2, 0.5));
    auto material_left   = make_shared<metal>(color(0.8, 0.8, 0.8), 0.3);
    auto material_right  = make_shared<metal>(color(0.8, 0.6, 0.2), 1.0);
    ...
}
```

![图像 14:模糊的金属](/raytracing/rtiow/img-1.14-metal-fuzz.png)
