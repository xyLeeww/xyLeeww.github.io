---
title: "4. 纹理映射(Texture Mapping)"
order: 4
description: "实现纯色纹理、空间棋盘格纹理与球面纹理坐标,并借助 stb_image 加载图像纹理,渲染出贴着地图的地球"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#texturemapping"
sourceTitle: "Ray Tracing: The Next Week · Texture Mapping"
license: "CC0 1.0"
---

在计算机图形学中,*纹理映射(texture mapping)*是把某种材质效果施加到场景中物体上的过程。“纹理”指的是这种效果,而“映射”则是数学意义上的映射,即把一个空间映射到另一个空间上。这种效果可以是任何材质属性:颜色、光泽度、凹凸几何(称为*凹凸映射(Bump Mapping)*),甚至是材质是否存在(用来在表面上挖出镂空区域)。

最常见的纹理映射是把一张图像映射到物体表面上,从而定义物体表面上每一点的颜色。在实践中,我们是反过来实现这个过程的:给定物体上的某个点,我们去查找纹理贴图在该点定义的颜色。

首先,我们会让纹理颜色是程序化的,并创建一个纯色的纹理贴图。大多数程序会把恒定的 RGB 颜色和纹理放在不同的类中,所以你完全可以采用不同的做法,但我非常推崇这种架构,因为能把任何颜色都当作纹理来用实在是太棒了。

为了进行纹理查找,我们需要一个*纹理坐标(texture coordinate)*。这个坐标可以有很多种定义方式,我们会在后续过程中逐步展开这个想法。目前,我们传入二维的纹理坐标。按照惯例,纹理坐标被命名为 $u$ 和 $v$。对于纯色纹理,每一对 $(u,v)$ 都得到同一个恒定的颜色,所以实际上我们完全可以忽略这些坐标。不过,其他类型的纹理会需要这些坐标,所以我们把它们保留在方法接口中。

我们的纹理类的主要方法是 `color value(...)`,它根据输入坐标返回纹理颜色。除了接收该点的纹理坐标 $u$ 和 $v$ 之外,我们还会提供所讨论的那个点的位置,原因稍后就会清楚。

## 4.1 纯色纹理

**代码清单 22**:`texture.h` 纹理类

```cpp
#ifndef TEXTURE_H
#define TEXTURE_H

class texture {
  public:
    virtual ~texture() = default;

    virtual color value(double u, double v, const point3& p) const = 0;
};

class solid_color : public texture {
  public:
    solid_color(const color& albedo) : albedo(albedo) {}

    solid_color(double red, double green, double blue) : solid_color(color(red,green,blue)) {}

    color value(double u, double v, const point3& p) const override {
        return albedo;
    }

  private:
    color albedo;
};

#endif
```

我们需要更新 `hit_record` 结构,用来存储光线与物体交点处的 $u,v$ 表面坐标。

**代码清单 23**:`hittable.h` 为 `hit_record` 添加 $u,v$ 坐标

```cpp {7-8}
class hit_record {
  public:
    vec3 p;
    vec3 normal;
    shared_ptr<material> mat;
    double t;
    double u;
    double v;
    bool front_face;

    ...
```

以后,我们需要为每种 `hittable` 计算给定点的 $(u,v)$ 纹理坐标。这一点稍后再详细介绍。

## 4.2 实体纹理:棋盘格纹理

实体纹理(solid texture,或称空间纹理(spatial texture))只取决于每个点在三维空间中的位置。你可以把实体纹理想象成是在给空间本身中的所有点上色,而不是给空间中的某个特定物体上色。因此,当物体改变位置时,它可以在纹理的颜色之间穿行,不过通常你会希望固定物体与实体纹理之间的关系。

为了探索空间纹理,我们会实现一个空间纹理类 `checker_texture`,它实现了一种三维的棋盘格图案。由于空间纹理函数是由空间中给定的位置驱动的,纹理的 `value()` 函数会忽略参数 `u` 和 `v`,只使用参数 `p`。

为了得到棋盘格图案,我们首先对输入点的每个分量向下取整(floor)。我们也可以对坐标做截断,但那样会把数值往零的方向拉,导致零的两侧得到相同的颜色。向下取整函数总是把数值移到左边(朝负无穷方向)的整数上。得到这三个整数结果($\lfloor x \rfloor, \lfloor y \rfloor, \lfloor z \rfloor$)之后,我们把它们相加,并对结果取模 2,得到 0 或 1。0 对应偶数颜色,1 对应奇数颜色。

最后,我们给纹理加上一个缩放因子,以便控制场景中棋盘格图案的大小。

**代码清单 24**:`texture.h` 棋盘格纹理

```cpp
class checker_texture : public texture {
  public:
    checker_texture(double scale, shared_ptr<texture> even, shared_ptr<texture> odd)
      : inv_scale(1.0 / scale), even(even), odd(odd) {}

    checker_texture(double scale, const color& c1, const color& c2)
      : checker_texture(scale, make_shared<solid_color>(c1), make_shared<solid_color>(c2)) {}

    color value(double u, double v, const point3& p) const override {
        auto xInteger = int(std::floor(inv_scale * p.x()));
        auto yInteger = int(std::floor(inv_scale * p.y()));
        auto zInteger = int(std::floor(inv_scale * p.z()));

        bool isEven = (xInteger + yInteger + zInteger) % 2 == 0;

        return isEven ? even->value(u, v, p) : odd->value(u, v, p);
    }

  private:
    double inv_scale;
    shared_ptr<texture> even;
    shared_ptr<texture> odd;
};
```

棋盘格的奇/偶参数既可以指向一个纯色纹理,也可以指向其他某种程序化纹理。这与 Pat Hanrahan 早在 20 世纪 80 年代提出的着色器网络(shader network)的思想一脉相承。

为了支持程序化纹理,我们扩展 `lambertian` 类,让它使用纹理而不是颜色:

**代码清单 25**:`material.h` 带纹理的朗伯材质

```cpp {2,8-9,20,25}
#include "hittable.h"
#include "texture.h"

...

class lambertian : public material {
  public:
    lambertian(const color& albedo) : tex(make_shared<solid_color>(albedo)) {}
    lambertian(shared_ptr<texture> tex) : tex(tex) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        auto scatter_direction = rec.normal + random_unit_vector();

        // Catch degenerate scatter direction
        if (scatter_direction.near_zero())
            scatter_direction = rec.normal;

        scattered = ray(rec.p, scatter_direction, r_in.time());
        attenuation = tex->value(rec.u, rec.v, rec.p);
        return true;
    }

  private:
    shared_ptr<texture> tex;
};
```

如果我们把它加到主场景中:

**代码清单 26**:`main.cc` 使用棋盘格纹理

```cpp {9,14-15}
#include "rtweekend.h"

#include "bvh.h"
#include "camera.h"
#include "hittable.h"
#include "hittable_list.h"
#include "material.h"
#include "sphere.h"
#include "texture.h"

int main() {
    hittable_list world;

    auto checker = make_shared<checker_texture>(0.32, color(.2, .3, .1), color(.9, .9, .9));
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, make_shared<lambertian>(checker)));

    for (int a = -11; a < 11; a++) {
    ...
}
```

就会得到:

![图像 2:棋盘格地面上的球体](/raytracing/tnw/img-2.02-checker-ground.png)

## 4.3 渲染实体棋盘格纹理

我们要给程序添加第二个场景,并且随着本书的推进还会添加更多场景。为此,我们会设置一个 switch 语句,用来为每次运行选择想要的场景。这是一种粗糙的做法,但我们希望让一切尽可能简单,把注意力集中在光线追踪上。在你自己的光线追踪器中,你也许会想用其他方式,比如支持命令行参数。

下面是 main.cc 针对我们唯一的随机球体场景重构之后的样子。把 `main()` 重命名为 `bouncing_spheres()`,并添加一个新的 `main()` 函数来调用它:

**代码清单 27**:`main.cc` 由 main 分派到所选场景

```cpp {12,23-25} del={11}
#include "rtweekend.h"

#include "bvh.h"
#include "camera.h"
#include "hittable.h"
#include "hittable_list.h"
#include "material.h"
#include "sphere.h"
#include "texture.h"

int main() {
void bouncing_spheres() {
    hittable_list world;

    auto ground_material = make_shared<lambertian>(color(0.5, 0.5, 0.5));
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, ground_material));

    ...

    cam.render(world);
}

int main() {
    bouncing_spheres();
}
```

现在添加一个场景,其中有两个上下叠放的棋盘格球体。

**代码清单 28**:`main.cc` 两个棋盘格球体

```cpp {15-38,41-44}
#include "rtweekend.h"

#include "bvh.h"
#include "camera.h"
#include "hittable.h"
#include "hittable_list.h"
#include "material.h"
#include "sphere.h"
#include "texture.h"

void bouncing_spheres() {
    ...
}

void checkered_spheres() {
    hittable_list world;

    auto checker = make_shared<checker_texture>(0.32, color(.2, .3, .1), color(.9, .9, .9));

    world.add(make_shared<sphere>(point3(0,-10, 0), 10, make_shared<lambertian>(checker)));
    world.add(make_shared<sphere>(point3(0, 10, 0), 10, make_shared<lambertian>(checker)));

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
    switch (2) {
        case 1: bouncing_spheres();  break;
        case 2: checkered_spheres(); break;
    }
}
```

我们得到这样的结果:

![图像 3:棋盘格球体](/raytracing/tnw/img-2.03-checker-spheres.png)

你可能会觉得这个结果看起来有点怪。由于 `checker_texture` 是一种空间纹理,我们实际上看到的是球面切过三维棋盘格空间的样子。在很多情况下,这样就很完美,或者至少足够了。但在另外很多情况下,我们确实希望在物体表面上得到一致的效果。接下来就介绍这种做法。

## 4.4 球体的纹理坐标

纯色纹理不使用任何坐标。实体(或空间)纹理使用空间中点的坐标。现在是时候用上 $u,v$ 纹理坐标了。这些坐标指定了二维源图像上(或某个二维参数化空间中)的位置。为此,我们需要一种方法来求出三维物体表面上任意一点的 $u,v$ 坐标。这种映射完全是任意的,但通常你会希望它覆盖整个表面,并且能以某种合理的方式对二维图像进行缩放、定向和拉伸。我们先推导出一种求球体 $u,v$ 坐标的方案。

对于球体,纹理坐标通常基于某种形式的经度和纬度,*也就是*球坐标。因此我们计算球坐标 $(\theta,\phi)$,其中 $\theta$ 是从底部极点向上量起的角度(也就是从 -Y 向上),$\phi$ 是绕 Y 轴旋转的角度(从 -X 到 +Z 到 +X 到 -Z,再回到 -X)。

我们想把 $\theta$ 和 $\phi$ 映射到纹理坐标 $u$ 和 $v$,二者都在 $[0,1]$ 范围内,其中 $(u=0,v=0)$ 对应纹理的左下角。因此,从 $(\theta,\phi)$ 到 $(u,v)$ 的归一化为:

$$
u = \frac{\phi}{2\pi}
$$
$$
v = \frac{\theta}{\pi}
$$

为了对以原点为球心的单位球面上的给定点计算 $\theta$ 和 $\phi$,我们从对应笛卡尔坐标的方程出发:

$$
\begin{align*}
y &= -\cos(\theta)            \\
x &= -\cos(\phi) \sin(\theta) \\
z &= \quad\sin(\phi) \sin(\theta)
\end{align*}
$$

我们需要反解这些方程,求出 $\theta$ 和 $\phi$。多亏了 `<cmath>` 中这个可爱的函数 `std::atan2()`——它接收任意一对分别与正弦和余弦成比例的数,并返回对应的角度——我们可以传入 $x$ 和 $z$($\sin(\theta)$ 会相互抵消)来求 $\phi$:

$$
\phi = \operatorname{atan2}(z, -x)
$$

`std::atan2()` 返回的值在 $-\pi$ 到 $\pi$ 之间,但这些值是先从 0 增加到 $\pi$,然后跳变到 $-\pi$,再回到零。虽然这在数学上是正确的,但我们希望 $u$ 的范围是从 $0$ 到 $1$,而不是先从 $0$ 到 $1/2$,再从 $-1/2$ 到 $0$。幸运的是,

$$
\operatorname{atan2}(a,b) = \operatorname{atan2}(-a,-b) + \pi,
$$

而第二种写法得到的值会从 $0$ 连续地变化到 $2\pi$。因此,我们可以这样计算 $\phi$:

$$
\phi = \operatorname{atan2}(-z, x) + \pi
$$

$\theta$ 的推导更加直接:

$$
\theta = \arccos(-y)
$$

所以对于球体,$(u,v)$ 坐标的计算由一个工具函数完成:它接收以原点为球心的单位球面上的点,并计算出 $u$ 和 $v$:

**代码清单 29**:`sphere.h` get_sphere_uv 函数

```cpp {6-19}
class sphere : public hittable {
  ...
  private:
    ...

    static void get_sphere_uv(const point3& p, double& u, double& v) {
        // p: a given point on the sphere of radius one, centered at the origin.
        // u: returned value [0,1] of angle around the Y axis from X=-1.
        // v: returned value [0,1] of angle from Y=-1 to Y=+1.
        //     <1 0 0> yields <0.50 0.50>       <-1  0  0> yields <0.00 0.50>
        //     <0 1 0> yields <0.50 1.00>       < 0 -1  0> yields <0.50 0.00>
        //     <0 0 1> yields <0.25 0.50>       < 0  0 -1> yields <0.75 0.50>

        auto theta = std::acos(-p.y());
        auto phi = std::atan2(-p.z(), p.x()) + pi;

        u = phi / (2*pi);
        v = theta / pi;
    }
};
```

更新 `sphere::hit()` 函数,让它调用这个函数来更新命中记录中的 UV 坐标。

**代码清单 30**:`sphere.h` 由命中点求球体 UV 坐标

```cpp {11}
class sphere : public hittable {
  public:
    ...
    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        ...

        rec.t = root;
        rec.p = r.at(rec.t);
        vec3 outward_normal = (rec.p - current_center) / radius;
        rec.set_face_normal(r, outward_normal);
        get_sphere_uv(outward_normal, rec.u, rec.v);
        rec.mat = mat;

        return true;
    }
    ...
};
```

我们根据命中点 $\mathbf{P}$ 计算出表面坐标 $(u,v)$。然后就可以用它们去索引我们的程序化实体纹理(比如大理石)。我们也可以读入一张图像,用二维的 $(u,v)$ 纹理坐标去索引这张图像。

在图像中使用缩放后的 $(u,v)$ 的一种直接做法,是把 $u$ 和 $v$ 取整,当作像素坐标 $(i,j)$ 来用。这样做很别扭,因为我们不希望在更改图像分辨率时还得修改代码。所以,图形学中最通用的非官方标准之一,就是使用纹理坐标而不是图像像素坐标。纹理坐标不过是图像中位置的某种分数形式。例如,对于一张 $N_x$ 乘 $N_y$ 的图像中的像素 $(i,j)$,其图像纹理位置为:

$$
u = \frac{i}{N_x-1}
$$
$$
v = \frac{j}{N_y-1}
$$

这只是一个用分数表示的位置。

## 4.5 访问纹理图像数据

现在是时候创建一个保存图像的纹理类了。我将使用我最喜欢的图像工具库 [stb_image](https://github.com/nothings/stb)。它把图像数据读入一个 32 位浮点数数组。这些数据就是紧密排列的 RGB 值,每个分量都在 [0,1] 范围内(从黑色到纯白)。此外,图像是在线性颜色空间(gamma = 1)中加载的——也就是我们进行所有计算时所用的颜色空间。

为了让加载图像文件更加方便,我们提供了一个辅助类来管理这一切:`rtw_image`。它提供了一个辅助函数——`pixel_data(int x, int y)`——用来获取每个像素的 8 位 RGB 字节值。下面的代码清单假设你已经把头文件 `stb_image.h` 复制到了一个名为 `external` 的文件夹中。请根据你自己的目录结构进行调整。

**代码清单 31**:`rtw_stb_image.h` rtw_image 辅助类

```cpp
#ifndef RTW_STB_IMAGE_H
#define RTW_STB_IMAGE_H

// Disable strict warnings for this header from the Microsoft Visual C++ compiler.
#ifdef _MSC_VER
    #pragma warning (push, 0)
#endif

#define STB_IMAGE_IMPLEMENTATION
#define STBI_FAILURE_USERMSG
#include "external/stb_image.h"

#include <cstdlib>
#include <iostream>

class rtw_image {
  public:
    rtw_image() {}

    rtw_image(const char* image_filename) {
        // Loads image data from the specified file. If the RTW_IMAGES environment variable is
        // defined, looks only in that directory for the image file. If the image was not found,
        // searches for the specified image file first from the current directory, then in the
        // images/ subdirectory, then the _parent's_ images/ subdirectory, and then _that_
        // parent, on so on, for six levels up. If the image was not loaded successfully,
        // width() and height() will return 0.

        auto filename = std::string(image_filename);
        auto imagedir = getenv("RTW_IMAGES");

        // Hunt for the image file in some likely locations.
        if (imagedir && load(std::string(imagedir) + "/" + image_filename)) return;
        if (load(filename)) return;
        if (load("images/" + filename)) return;
        if (load("../images/" + filename)) return;
        if (load("../../images/" + filename)) return;
        if (load("../../../images/" + filename)) return;
        if (load("../../../../images/" + filename)) return;
        if (load("../../../../../images/" + filename)) return;
        if (load("../../../../../../images/" + filename)) return;

        std::cerr << "ERROR: Could not load image file '" << image_filename << "'.\n";
    }

    ~rtw_image() {
        delete[] bdata;
        STBI_FREE(fdata);
    }

    bool load(const std::string& filename) {
        // Loads the linear (gamma=1) image data from the given file name. Returns true if the
        // load succeeded. The resulting data buffer contains the three [0.0, 1.0]
        // floating-point values for the first pixel (red, then green, then blue). Pixels are
        // contiguous, going left to right for the width of the image, followed by the next row
        // below, for the full height of the image.

        auto n = bytes_per_pixel; // Dummy out parameter: original components per pixel
        fdata = stbi_loadf(filename.c_str(), &image_width, &image_height, &n, bytes_per_pixel);
        if (fdata == nullptr) return false;

        bytes_per_scanline = image_width * bytes_per_pixel;
        convert_to_bytes();
        return true;
    }

    int width()  const { return (fdata == nullptr) ? 0 : image_width; }
    int height() const { return (fdata == nullptr) ? 0 : image_height; }

    const unsigned char* pixel_data(int x, int y) const {
        // Return the address of the three RGB bytes of the pixel at x,y. If there is no image
        // data, returns magenta.
        static unsigned char magenta[] = { 255, 0, 255 };
        if (bdata == nullptr) return magenta;

        x = clamp(x, 0, image_width);
        y = clamp(y, 0, image_height);

        return bdata + y*bytes_per_scanline + x*bytes_per_pixel;
    }

  private:
    const int      bytes_per_pixel = 3;
    float         *fdata = nullptr;         // Linear floating point pixel data
    unsigned char *bdata = nullptr;         // Linear 8-bit pixel data
    int            image_width = 0;         // Loaded image width
    int            image_height = 0;        // Loaded image height
    int            bytes_per_scanline = 0;

    static int clamp(int x, int low, int high) {
        // Return the value clamped to the range [low, high).
        if (x < low) return low;
        if (x < high) return x;
        return high - 1;
    }

    static unsigned char float_to_byte(float value) {
        if (value <= 0.0)
            return 0;
        if (1.0 <= value)
            return 255;
        return static_cast<unsigned char>(256.0 * value);
    }

    void convert_to_bytes() {
        // Convert the linear floating point pixel data to bytes, storing the resulting byte
        // data in the `bdata` member.

        int total_bytes = image_width * image_height * bytes_per_pixel;
        bdata = new unsigned char[total_bytes];

        // Iterate through all pixel components, converting from [0.0, 1.0] float values to
        // unsigned [0, 255] byte values.

        auto *bptr = bdata;
        auto *fptr = fdata;
        for (auto i=0; i < total_bytes; i++, fptr++, bptr++)
            *bptr = float_to_byte(*fptr);
    }
};

// Restore MSVC compiler warnings
#ifdef _MSC_VER
    #pragma warning (pop)
#endif

#endif
```

如果你使用 C 或 C++ 以外的语言来实现,就需要找到(或自己编写)一个提供类似功能的图像加载库。

`image_texture` 类使用了 `rtw_image` 类:

**代码清单 32**:`texture.h` 图像纹理类

```cpp {1,9-31}
#include "rtw_stb_image.h"

...

class checker_texture : public texture {
    ...
};

class image_texture : public texture {
  public:
    image_texture(const char* filename) : image(filename) {}

    color value(double u, double v, const point3& p) const override {
        // If we have no texture data, then return solid cyan as a debugging aid.
        if (image.height() <= 0) return color(0,1,1);

        // Clamp input texture coordinates to [0,1] x [1,0]
        u = interval(0,1).clamp(u);
        v = 1.0 - interval(0,1).clamp(v);  // Flip V to image coordinates

        auto i = int(u * image.width());
        auto j = int(v * image.height());
        auto pixel = image.pixel_data(i,j);

        auto color_scale = 1.0 / 255.0;
        return color(color_scale*pixel[0], color_scale*pixel[1], color_scale*pixel[2]);
    }

  private:
    rtw_image image;
};
```

## 4.6 渲染图像纹理

我只是从网上随便找了一张地球地图——对我们的目的来说,任何标准投影都可以。

![图像 4:earthmap.jpg](/raytracing/tnw/earthmap.jpg)

下面的代码从文件中读入一张图像,然后把它赋给一个漫反射材质:

**代码清单 33**:`main.cc` 使用地球纹理贴图进行渲染

```cpp {1-21,24,27}
void earth() {
    auto earth_texture = make_shared<image_texture>("earthmap.jpg");
    auto earth_surface = make_shared<lambertian>(earth_texture);
    auto globe = make_shared<sphere>(point3(0,0,0), 2, earth_surface);

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.vfov     = 20;
    cam.lookfrom = point3(0,0,12);
    cam.lookat   = point3(0,0,0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0;

    cam.render(hittable_list(globe));
}

int main() {
    switch (3) {
        case 1:  bouncing_spheres();  break;
        case 2:  checkered_spheres(); break;
        case 3:  earth();             break;
    }
}
```

我们开始看到“所有颜色都是纹理”这一设计的威力了——我们可以把任何一种纹理赋给朗伯材质,而朗伯材质并不需要知道这一点。

如果渲染出来的图片中间是一个巨大的青色球体,那就说明 `stb_image` 没能找到你的地球地图照片。程序会在可执行文件所在的目录中查找该文件。请确保把地球图片复制到你的构建目录中,或者修改 `earth()`,让它指向其他位置。

![图像 5:贴上地球纹理的球体](/raytracing/tnw/img-2.05-earth-sphere.png)
