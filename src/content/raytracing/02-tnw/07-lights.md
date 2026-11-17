---
title: "7. 光源(Lights)"
order: 7
description: "引入自发光材质和背景色,把普通物体变成光源,并搭建出一个空的康奈尔盒(Cornell Box)场景"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#lights"
sourceTitle: "Ray Tracing: The Next Week · Lights"
license: "CC0 1.0"
---

光照是光线追踪的关键组成部分。早期简单的光线追踪器使用的是抽象的光源,比如空间中的点,或者某个方向。现代的做法则采用更加基于物理的光源,它们具有位置和大小。为了创建这样的光源,我们需要能够把任意一个普通物体变成向场景中发光的东西。

## 7.1 自发光材质

首先,我们来制作一种会发光的材质。我们需要添加一个 emitted 函数(也可以把它加到 `hit_record` 里——这只是设计上的品味问题)。和背景一样,它只是告诉光线它是什么颜色,不做任何反射。它非常简单:

**代码清单 55**:`material.h` 漫射光源类

```cpp {5-16}
class dielectric : public material {
    ...
}

class diffuse_light : public material {
  public:
    diffuse_light(shared_ptr<texture> tex) : tex(tex) {}
    diffuse_light(const color& emit) : tex(make_shared<solid_color>(emit)) {}

    color emitted(double u, double v, const point3& p) const override {
        return tex->value(u, v, p);
    }

  private:
    shared_ptr<texture> tex;
};
```

为了不必让所有不发光的材质都去实现 `emitted()`,我让基类直接返回黑色:

**代码清单 56**:`material.h` material 类中新增的 emitted 函数

```cpp {5-7}
class material {
  public:
    virtual ~material() = default;

    virtual color emitted(double u, double v, const point3& p) const {
        return color(0,0,0);
    }

    virtual bool scatter(
        const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered
    ) const {
        return false;
    }
};
```

## 7.2 为光线颜色函数加入背景色

接下来,我们想要一个纯黑的背景,这样场景中唯一的光就来自这些发光体。为此,我们要给 `ray_color` 函数加入一个背景色参数,并留意新的 `color_from_emission` 值。

**代码清单 57**:`camera.h` 带有背景色和自发光材质的 ray_color 函数

```cpp {7,20-33}
class camera {
  public:
    double aspect_ratio      = 1.0;  // Ratio of image width over height
    int    image_width       = 100;  // Rendered image width in pixel count
    int    samples_per_pixel = 10;   // Count of random samples for each pixel
    int    max_depth         = 10;   // Maximum number of ray bounces into scene
    color  background;               // Scene background color

    ...

  private:
    ...
    color ray_color(const ray& r, int depth, const hittable& world) const {
        // If we've exceeded the ray bounce limit, no more light is gathered.
        if (depth <= 0)
            return color(0,0,0);

        hit_record rec;

        // If the ray hits nothing, return the background color.
        if (!world.hit(r, interval(0.001, infinity), rec))
            return background;

        ray scattered;
        color attenuation;
        color color_from_emission = rec.mat->emitted(rec.u, rec.v, rec.p);

        if (!rec.mat->scatter(r, rec, attenuation, scattered))
            return color_from_emission;

        color color_from_scatter = attenuation * ray_color(scattered, depth-1, world);

        return color_from_emission + color_from_scatter;
    }
};
```

`main()` 也做了更新,为之前的场景设置背景色:

**代码清单 58**:`main.cc` 指定新的背景色

```cpp {9,21,33,45,57}
void bouncing_spheres() {
    ...
    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 20;
    cam.background        = color(0.70, 0.80, 1.00);
    ...
}

void checkered_spheres() {
    ...
    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;
    cam.background        = color(0.70, 0.80, 1.00);
    ...
}

void earth() {
    ...
    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;
    cam.background        = color(0.70, 0.80, 1.00);
    ...
}

void perlin_spheres() {
    ...
    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;
    cam.background        = color(0.70, 0.80, 1.00);
    ...
}

void quads() {
    ...
    camera cam;

    cam.aspect_ratio      = 1.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;
    cam.background        = color(0.70, 0.80, 1.00);
    ...
}
```

由于我们删掉了之前用来在光线射向天空时确定天空颜色的代码,所以需要为旧场景的渲染传入一个新的颜色值。我们选择让整个天空保持一种单一的蓝白色。你也可以传入一个布尔值,在之前的天空盒代码和新的纯色背景之间切换。这里我们保持简单。

## 7.3 把物体变成光源

如果我们把一个矩形设置为光源:

**代码清单 59**:`main.cc` 一个简单的矩形光源

```cpp {1-27,30,36}
void simple_light() {
    hittable_list world;

    auto pertext = make_shared<noise_texture>(4);
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, make_shared<lambertian>(pertext)));
    world.add(make_shared<sphere>(point3(0,2,0), 2, make_shared<lambertian>(pertext)));

    auto difflight = make_shared<diffuse_light>(color(4,4,4));
    world.add(make_shared<quad>(point3(3,1,-2), vec3(2,0,0), vec3(0,2,0), difflight));

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;
    cam.background        = color(0,0,0);

    cam.vfov     = 20;
    cam.lookfrom = point3(26,3,6);
    cam.lookat   = point3(0,2,0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0;

    cam.render(world);
}

int main() {
    switch (6) {
        case 1:  bouncing_spheres();   break;
        case 2:  checkered_spheres();  break;
        case 3:  earth();              break;
        case 4:  perlin_spheres();     break;
        case 5:  quads();              break;
        case 6:  simple_light();       break;
    }
}
```

我们会得到:

![图像 17:带有矩形光源的场景](/raytracing/tnw/img-2.17-rect-light.png)

注意,光源比 $(1,1,1)$ 更亮。这样它才足够亮,能够照亮其他物体。

你也可以随意试试把一些球体也变成光源。

**代码清单 60**:`main.cc` 一个简单的矩形光源加上一个发光的球

```cpp {4}
void simple_light() {
    ...
    auto difflight = make_shared<diffuse_light>(color(4,4,4));
    world.add(make_shared<sphere>(point3(0,7,0), 2, difflight));
    world.add(make_shared<quad>(point3(3,1,-2), vec3(2,0,0), vec3(0,2,0), difflight));
    ...
}
```

![图像 18:带有矩形光源和球形光源的场景](/raytracing/tnw/img-2.18-rect-sphere-light.png)

## 7.4 创建一个空的“康奈尔盒”

“康奈尔盒(Cornell Box)”于 1984 年提出,用来模拟漫反射表面之间光的相互作用。我们来制作这个盒子的 5 面墙和光源:

**代码清单 61**:`main.cc` 空的康奈尔盒场景

```cpp {1-32,35,42}
void cornell_box() {
    hittable_list world;

    auto red   = make_shared<lambertian>(color(.65, .05, .05));
    auto white = make_shared<lambertian>(color(.73, .73, .73));
    auto green = make_shared<lambertian>(color(.12, .45, .15));
    auto light = make_shared<diffuse_light>(color(15, 15, 15));

    world.add(make_shared<quad>(point3(555,0,0), vec3(0,555,0), vec3(0,0,555), green));
    world.add(make_shared<quad>(point3(0,0,0), vec3(0,555,0), vec3(0,0,555), red));
    world.add(make_shared<quad>(point3(343, 554, 332), vec3(-130,0,0), vec3(0,0,-105), light));
    world.add(make_shared<quad>(point3(0,0,0), vec3(555,0,0), vec3(0,0,555), white));
    world.add(make_shared<quad>(point3(555,555,555), vec3(-555,0,0), vec3(0,0,-555), white));
    world.add(make_shared<quad>(point3(0,0,555), vec3(555,0,0), vec3(0,555,0), white));

    camera cam;

    cam.aspect_ratio      = 1.0;
    cam.image_width       = 600;
    cam.samples_per_pixel = 200;
    cam.max_depth         = 50;
    cam.background        = color(0,0,0);

    cam.vfov     = 40;
    cam.lookfrom = point3(278, 278, -800);
    cam.lookat   = point3(278, 278, 0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0;

    cam.render(world);
}

int main() {
    switch (7) {
        case 1:  bouncing_spheres();   break;
        case 2:  checkered_spheres();  break;
        case 3:  earth();              break;
        case 4:  perlin_spheres();     break;
        case 5:  quads();              break;
        case 6:  simple_light();       break;
        case 7:  cornell_box();        break;
    }
}
```

我们会得到:

![图像 19:空的康奈尔盒](/raytracing/tnw/img-2.19-cornell-empty.png)

这张图像的噪点非常多,因为光源很小,所以大多数随机光线都不会命中光源。
