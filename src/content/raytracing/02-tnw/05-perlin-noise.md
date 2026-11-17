---
title: "5. 柏林噪声(Perlin Noise)"
order: 5
description: "用柏林噪声生成实体纹理:从随机数块、三线性插值、埃尔米特平滑到随机向量与湍流,最终做出大理石纹理"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#perlinnoise"
sourceTitle: "Ray Tracing: The Next Week · Perlin Noise"
license: "CC0 1.0"
---

为了得到好看的实体纹理(solid texture),大多数人都会使用某种形式的柏林噪声(Perlin noise)。它以发明者 Ken Perlin 的名字命名。柏林纹理返回的不是下面这样的白噪声(white noise):

![图像 6:白噪声](/raytracing/tnw/img-2.06-white-noise.jpg)

而是返回某种类似于模糊过的白噪声的东西:

![图像 7:模糊后的白噪声](/raytracing/tnw/img-2.07-white-noise-blurred.jpg)

柏林噪声的一个关键特点是它是可重复的:它接受一个 3D 点作为输入,并且总是返回同一个看起来随机的数。相邻的点会返回相近的数。柏林噪声的另一个重要特点是它要简单、快速,所以它通常是用一种取巧的办法(hack)实现的。我会根据 Andrew Kensler 的描述,一步步把这个取巧的实现搭建起来。

## 5.1 使用随机数块

我们可以直接用一个 3D 随机数数组铺满整个空间,并按块来使用这些随机数。这样你会得到一种块状的图案,而且重复非常明显:

![图像 8:平铺的随机图案](/raytracing/tnw/img-2.08-tile-random.jpg)

我们不用平铺,而是用某种哈希(hashing)把它打乱。要实现这一点,需要一些辅助代码:

**代码清单 34**:`perlin.h` 柏林纹理类及其函数

```cpp
#ifndef PERLIN_H
#define PERLIN_H

class perlin {
  public:
    perlin() {
        for (int i = 0; i < point_count; i++) {
            randfloat[i] = random_double();
        }

        perlin_generate_perm(perm_x);
        perlin_generate_perm(perm_y);
        perlin_generate_perm(perm_z);
    }

    double noise(const point3& p) const {
        auto i = int(4*p.x()) & 255;
        auto j = int(4*p.y()) & 255;
        auto k = int(4*p.z()) & 255;

        return randfloat[perm_x[i] ^ perm_y[j] ^ perm_z[k]];
    }

  private:
    static const int point_count = 256;
    double randfloat[point_count];
    int perm_x[point_count];
    int perm_y[point_count];
    int perm_z[point_count];

    static void perlin_generate_perm(int* p) {
        for (int i = 0; i < point_count; i++)
            p[i] = i;

        permute(p, point_count);
    }

    static void permute(int* p, int n) {
        for (int i = n-1; i > 0; i--) {
            int target = random_int(0, i);
            int tmp = p[i];
            p[i] = p[target];
            p[target] = tmp;
        }
    }
};

#endif
```

现在我们创建一个真正的纹理,它接收这些介于 0 和 1 之间的浮点数,并生成灰色:

**代码清单 35**:`texture.h` 噪声纹理

```cpp {1,6-16}
#include "perlin.h"
#include "rtw_stb_image.h"

...

class noise_texture : public texture {
  public:
    noise_texture() {}

    color value(double u, double v, const point3& p) const override {
        return color(1,1,1) * noise.noise(p);
    }

  private:
    perlin noise;
};
```

我们可以把这个纹理用在几个球体上:

**代码清单 36**:`main.cc` 包含两个柏林纹理球体的场景

```cpp {1-23,26,30}
void perlin_spheres() {
    hittable_list world;

    auto pertext = make_shared<noise_texture>();
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, make_shared<lambertian>(pertext)));
    world.add(make_shared<sphere>(point3(0,2,0), 2, make_shared<lambertian>(pertext)));

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.vfov     = 20;
    cam.lookfrom = point3(13,2,3);
    cam.lookat   = point3(0,0,0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0;

    cam.render(world);
}

int main() {
    switch (4) {
        case 1:  bouncing_spheres();   break;
        case 2:  checkered_spheres();  break;
        case 3:  earth();              break;
        case 4:  perlin_spheres();     break;
    }
}
```

哈希确实如我们所愿地把图案打乱了:

![图像 9:哈希后的随机纹理](/raytracing/tnw/img-2.09-hash-random.png)

## 5.2 让结果变平滑

为了让它变得平滑,我们可以进行线性插值:

**代码清单 37**:`perlin.h` 使用三线性插值的柏林噪声

```cpp {6-24,36-47}
class perlin {
  public:
    ...

    double noise(const point3& p) const {
        auto u = p.x() - std::floor(p.x());
        auto v = p.y() - std::floor(p.y());
        auto w = p.z() - std::floor(p.z());

        auto i = int(std::floor(p.x()));
        auto j = int(std::floor(p.y()));
        auto k = int(std::floor(p.z()));
        double c[2][2][2];

        for (int di=0; di < 2; di++)
            for (int dj=0; dj < 2; dj++)
                for (int dk=0; dk < 2; dk++)
                    c[di][dj][dk] = randfloat[
                        perm_x[(i+di) & 255] ^
                        perm_y[(j+dj) & 255] ^
                        perm_z[(k+dk) & 255]
                    ];

        return trilinear_interp(c, u, v, w);
    }

    ...

  private:
    ...

    static void permute(int* p, int n) {
        ...
    }

    static double trilinear_interp(double c[2][2][2], double u, double v, double w) {
        auto accum = 0.0;
        for (int i=0; i < 2; i++)
            for (int j=0; j < 2; j++)
                for (int k=0; k < 2; k++)
                    accum += (i*u + (1-i)*(1-u))
                           * (j*v + (1-j)*(1-v))
                           * (k*w + (1-k)*(1-w))
                           * c[i][j][k];

        return accum;
    }
};
```

于是我们得到:

![图像 10:使用三线性插值的柏林纹理](/raytracing/tnw/img-2.10-perlin-trilerp.png)

## 5.3 用埃尔米特平滑加以改进

平滑处理让结果有所改善,但其中还是有明显的网格特征。其中一部分是马赫带(Mach bands),这是对颜色做线性插值时一种已知的视觉感知伪影。一个标准的技巧是使用埃尔米特三次曲线(Hermite cubic)来让插值变得圆滑:

**代码清单 38**:`perlin.h` 使用埃尔米特平滑的柏林噪声

```cpp {9-11}
class perlin (
  public:
    ...
    double noise(const point3& p) const {
        auto u = p.x() - std::floor(p.x());
        auto v = p.y() - std::floor(p.y());
        auto w = p.z() - std::floor(p.z());

        u = u*u*(3-2*u);
        v = v*v*(3-2*v);
        w = w*w*(3-2*w);

        auto i = int(std::floor(p.x()));
        auto j = int(std::floor(p.y()));
        auto k = int(std::floor(p.z()));
        ...
```

这样得到的图像看起来更平滑:

![图像 11:经过三线性插值和平滑处理的柏林纹理](/raytracing/tnw/img-2.11-perlin-trilerp-smooth.png)

## 5.4 调整频率

它的频率也有点低。我们可以缩放输入点,让它变化得更快:

**代码清单 39**:`texture.h` 平滑后、频率更高的柏林噪声

```cpp {3,6,11}
class noise_texture : public texture {
  public:
    noise_texture(double scale) : scale(scale) {}

    color value(double u, double v, const point3& p) const override {
        return color(1,1,1) * noise.noise(scale * p);
    }

  private:
    perlin noise;
    double scale;
};
```

然后我们在 `perlin_spheres()` 场景描述中加上这个缩放系数:

**代码清单 40**:`main.cc` 噪声带有缩放系数的柏林纹理球体

```cpp {3}
void perlin_spheres() {
    ...
    auto pertext = make_shared<noise_texture>(4);
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, make_shared<lambertian>(pertext)));
    world.add(make_shared<sphere>(point3(0, 2, 0), 2, make_shared<lambertian>(pertext)));

    camera cam;
    ...
}
```

得到的结果如下:

![图像 12:频率更高的柏林纹理](/raytracing/tnw/img-2.12-perlin-hifreq.png)

## 5.5 在晶格点上使用随机向量

它看起来仍然有点块状,这可能是因为图案的最小值和最大值总是恰好落在整数的 x/y/z 上。Ken Perlin 一个非常巧妙的技巧是:在晶格点(lattice point)上放置随机的单位向量(而不只是浮点数),并用点积把最小值和最大值从晶格上移开。所以,首先我们需要把随机浮点数换成随机向量。这些向量可以是任意一组合理的、不规则的方向,我也不打算费心让它们严格均匀分布:

**代码清单 41**:`perlin.h` 使用随机单位平移的柏林噪声

```cpp {5,17}
class perlin {
  public:
    perlin() {
        for (int i = 0; i < point_count; i++) {
            randvec[i] = unit_vector(vec3::random(-1,1));
        }

        perlin_generate_perm(perm_x);
        perlin_generate_perm(perm_y);
        perlin_generate_perm(perm_z);
    }

    ...

  private:
    static const int point_count = 256;
    vec3 randvec[point_count];
    int perm_x[point_count];
    int perm_y[point_count];
    int perm_z[point_count];
    ...
};
```

现在,柏林类的 `noise()` 方法变成了:

**代码清单 42**:`perlin.h` 带有新 noise() 方法的柏林类

```cpp {15,20,26} del={8-10}
class perlin {
  public:
    ...
    double noise(const point3& p) const {
        auto u = p.x() - std::floor(p.x());
        auto v = p.y() - std::floor(p.y());
        auto w = p.z() - std::floor(p.z());
        u = u*u*(3-2*u);
        v = v*v*(3-2*v);
        w = w*w*(3-2*w);

        auto i = int(std::floor(p.x()));
        auto j = int(std::floor(p.y()));
        auto k = int(std::floor(p.z()));
        vec3 c[2][2][2];

        for (int di=0; di < 2; di++)
            for (int dj=0; dj < 2; dj++)
                for (int dk=0; dk < 2; dk++)
                    c[di][dj][dk] = randvec[
                        perm_x[(i+di) & 255] ^
                        perm_y[(j+dj) & 255] ^
                        perm_z[(k+dk) & 255]
                    ];

        return perlin_interp(c, u, v, w);
    }

    ...
};
```

插值也变得稍微复杂了一些:

**代码清单 43**:`perlin.h` 目前的柏林插值函数

```cpp {9-26} del={5-7}
class perlin {
  ...
  private:
    ...
    static double trilinear_interp(double c[2][2][2], double u, double v, double w) {
        ...
    }

    static double perlin_interp(const vec3 c[2][2][2], double u, double v, double w) {
        auto uu = u*u*(3-2*u);
        auto vv = v*v*(3-2*v);
        auto ww = w*w*(3-2*w);
        auto accum = 0.0;

        for (int i=0; i < 2; i++)
            for (int j=0; j < 2; j++)
                for (int k=0; k < 2; k++) {
                    vec3 weight_v(u-i, v-j, w-k);
                    accum += (i*uu + (1-i)*(1-uu))
                           * (j*vv + (1-j)*(1-vv))
                           * (k*ww + (1-k)*(1-ww))
                           * dot(c[i][j][k], weight_v);
                }

        return accum;
    }
};
```

柏林插值函数的输出可能是负值。这些负值会被传给我们的 `linear_to_gamma()` 颜色函数,而这个函数只接受正数输入。为了解决这个问题,我们把 $[-1,+1]$ 范围内的值映射到 $[0,1]$。

**代码清单 44**:`texture.h` 平滑后、频率更高的柏林噪声

```cpp {6}
class noise_texture : public texture {
  public:
    noise_texture(double scale) : scale(scale) {}

    color value(double u, double v, const point3& p) const override {
        return color(1,1,1) * 0.5 * (1.0 + noise.noise(scale * p));
    }

  private:
    perlin noise;
    double scale;
};
```

这样终于得到了看起来更合理的结果:

![图像 13:极值偏离整数位置的柏林纹理](/raytracing/tnw/img-2.13-perlin-shift.png)

## 5.6 引入湍流

人们经常使用一种由多个频率叠加而成的复合噪声。它通常被称为湍流(turbulence),是多次调用噪声函数的结果之和:

**代码清单 45**:`perlin.h` 湍流函数

```cpp {10-22}
class perlin {
  ...
  public:
    ...

    double noise(const point3& p) const {
        ...
    }

    double turb(const point3& p, int depth) const {
        auto accum = 0.0;
        auto temp_p = p;
        auto weight = 1.0;

        for (int i = 0; i < depth; i++) {
            accum += weight * noise(temp_p);
            weight *= 0.5;
            temp_p *= 2;
        }

        return std::fabs(accum);
    }

    ...
```

**代码清单 46**:`texture.h` 带湍流的噪声纹理

```cpp {6}
class noise_texture : public texture {
  public:
    noise_texture(double scale) : scale(scale) {}

    color value(double u, double v, const point3& p) const override {
        return color(1,1,1) * noise.turb(p, 7);
    }

  private:
    perlin noise;
    double scale;
};
```

直接使用湍流,会得到一种类似迷彩网的外观:

![图像 14:带湍流的柏林纹理](/raytracing/tnw/img-2.14-perlin-turb.png)

## 5.7 调整相位

不过,湍流通常是被间接使用的。例如,程序化实体纹理的“hello world”就是一种简单的类大理石纹理。基本思路是让颜色与某种类似正弦函数的东西成正比,并用湍流来调整相位(也就是平移 $\sin(x)$ 中的 $x$),从而让条纹起伏波动。把直接使用噪声和湍流的代码注释掉,实现类大理石效果的代码如下:

**代码清单 47**:`texture.h` 带大理石纹理的噪声纹理

```cpp {6}
class noise_texture : public texture {
  public:
    noise_texture(double scale) : scale(scale) {}

    color value(double u, double v, const point3& p) const override {
        return color(.5, .5, .5) * (1 + std::sin(scale * p.z() + 10 * noise.turb(p, 7)));
    }

  private:
    perlin noise;
    double scale;
};
```

得到的结果是:

![图像 15:柏林噪声生成的大理石纹理](/raytracing/tnw/img-2.15-perlin-marble.png)
