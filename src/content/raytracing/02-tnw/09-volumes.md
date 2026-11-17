---
title: "9. 体积(Volumes)"
order: 9
description: "用“随机表面”的技巧实现恒定密度的参与介质,加入各向同性(isotropic)材质,并渲染出带有烟雾块和雾块的康奈尔盒。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#volumes"
sourceTitle: "Ray Tracing: The Next Week · Volumes"
license: "CC0 1.0"
---

给光线追踪器加上烟雾/雾/薄雾是一件很不错的事。它们有时被称为*体积*(volumes)或*参与介质*(participating media)。另一个值得加入的特性是次表面散射(subsurface scattering),它有点像物体内部的浓雾。加入这类特性通常会让软件架构变得一团糟,因为体积和表面完全是两码事;不过有一个巧妙的技巧:把体积变成一个随机的表面。一团烟雾可以用这样一个表面来代替:在体积内的每一点上,这个表面都按一定的概率可能存在、也可能不存在。等你看到代码,就会更明白这一点。

## 9.1 恒定密度介质

首先,我们从恒定密度的体积开始。穿过体积的光线要么在体积内部发生散射,要么像图中中间那条光线一样一路穿过去。越是稀薄透明的体积(比如薄雾),越有可能出现像中间那条一样的光线。光线需要在体积中穿行多远,也决定了它能穿过去的可能性有多大。

![图 10:光线与体积的相互作用](/raytracing/tnw/fig-2.10-ray-vol.jpg)

当光线穿过体积时,它可能在任意一点发生散射。体积越稠密,发生散射的可能性就越大。光线在任意一小段距离 $\Delta L$ 内发生散射的概率为:

$$
\mathit{probability} = C \cdot \Delta L
$$

其中 $C$ 与体积的光学密度(optical density)成正比。如果把相关的微分方程全部推导一遍,你会发现:对于一个随机数,可以得到一个发生散射的距离。如果这个距离位于体积之外,那就没有“命中”。对于恒定密度的体积,我们只需要密度 $C$ 和边界。我会用另一个可命中物体(hittable)来作为边界。

最终得到的类如下:

**代码清单 71**:`constant_medium.h` 恒定密度介质类

```cpp
#ifndef CONSTANT_MEDIUM_H
#define CONSTANT_MEDIUM_H

#include "hittable.h"
#include "material.h"
#include "texture.h"

class constant_medium : public hittable {
  public:
    constant_medium(shared_ptr<hittable> boundary, double density, shared_ptr<texture> tex)
      : boundary(boundary), neg_inv_density(-1/density),
        phase_function(make_shared<isotropic>(tex))
    {}

    constant_medium(shared_ptr<hittable> boundary, double density, const color& albedo)
      : boundary(boundary), neg_inv_density(-1/density),
        phase_function(make_shared<isotropic>(albedo))
    {}

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        hit_record rec1, rec2;

        if (!boundary->hit(r, interval::universe, rec1))
            return false;

        if (!boundary->hit(r, interval(rec1.t+0.0001, infinity), rec2))
            return false;

        if (rec1.t < ray_t.min) rec1.t = ray_t.min;
        if (rec2.t > ray_t.max) rec2.t = ray_t.max;

        if (rec1.t >= rec2.t)
            return false;

        if (rec1.t < 0)
            rec1.t = 0;

        auto ray_length = r.direction().length();
        auto distance_inside_boundary = (rec2.t - rec1.t) * ray_length;
        auto hit_distance = neg_inv_density * std::log(random_double());

        if (hit_distance > distance_inside_boundary)
            return false;

        rec.t = rec1.t + hit_distance / ray_length;
        rec.p = r.at(rec.t);

        rec.normal = vec3(1,0,0);  // arbitrary
        rec.front_face = true;     // also arbitrary
        rec.mat = phase_function;

        return true;
    }

    aabb bounding_box() const override { return boundary->bounding_box(); }

  private:
    shared_ptr<hittable> boundary;
    double neg_inv_density;
    shared_ptr<material> phase_function;
};

#endif
```

各向同性(isotropic)材质的散射函数会均匀地随机选取一个方向:

**代码清单 72**:`material.h` isotropic 类

```cpp {5-19}
class diffuse_light : public material {
    ...
};

class isotropic : public material {
  public:
    isotropic(const color& albedo) : tex(make_shared<solid_color>(albedo)) {}
    isotropic(shared_ptr<texture> tex) : tex(tex) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        scattered = ray(rec.p, random_unit_vector(), r_in.time());
        attenuation = tex->value(rec.u, rec.v, rec.p);
        return true;
    }

  private:
    shared_ptr<texture> tex;
};
```

我们之所以要在边界相关的逻辑上如此小心,是因为需要确保当光线的起点位于体积内部时,这段代码也能正常工作。在云里,光线会四处反弹很多次,所以这是一种很常见的情况。

此外,上面的代码假设光线一旦离开恒定密度介质的边界,就会在边界之外一直传播下去。换句话说,它假设边界的形状是凸的。因此,这个实现适用于长方体或球体这样的边界,但不适用于圆环或内部带有空洞的形状。写出一个能处理任意形状的实现是可能的,不过我们把它留给读者作为练习。

## 9.2 渲染带有烟雾盒和雾盒的康奈尔盒

我们把那两个方块换成烟雾和雾(深色和浅色的粒子),并把光源调大(同时调暗一些,免得整个场景过曝),以便更快地收敛:

**代码清单 73**:`main.cc` 带烟雾的康奈尔盒

```cpp {3,13-55,58,66}
#include "bvh.h"
#include "camera.h"
#include "constant_medium.h"
#include "hittable.h"
#include "hittable_list.h"
#include "material.h"
#include "quad.h"
#include "sphere.h"
#include "texture.h"

...

void cornell_smoke() {
    hittable_list world;

    auto red   = make_shared<lambertian>(color(.65, .05, .05));
    auto white = make_shared<lambertian>(color(.73, .73, .73));
    auto green = make_shared<lambertian>(color(.12, .45, .15));
    auto light = make_shared<diffuse_light>(color(7, 7, 7));

    world.add(make_shared<quad>(point3(555,0,0), vec3(0,555,0), vec3(0,0,555), green));
    world.add(make_shared<quad>(point3(0,0,0), vec3(0,555,0), vec3(0,0,555), red));
    world.add(make_shared<quad>(point3(113,554,127), vec3(330,0,0), vec3(0,0,305), light));
    world.add(make_shared<quad>(point3(0,555,0), vec3(555,0,0), vec3(0,0,555), white));
    world.add(make_shared<quad>(point3(0,0,0), vec3(555,0,0), vec3(0,0,555), white));
    world.add(make_shared<quad>(point3(0,0,555), vec3(555,0,0), vec3(0,555,0), white));

    shared_ptr<hittable> box1 = box(point3(0,0,0), point3(165,330,165), white);
    box1 = make_shared<rotate_y>(box1, 15);
    box1 = make_shared<translate>(box1, vec3(265,0,295));

    shared_ptr<hittable> box2 = box(point3(0,0,0), point3(165,165,165), white);
    box2 = make_shared<rotate_y>(box2, -18);
    box2 = make_shared<translate>(box2, vec3(130,0,65));

    world.add(make_shared<constant_medium>(box1, 0.01, color(0,0,0)));
    world.add(make_shared<constant_medium>(box2, 0.01, color(1,1,1)));

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
    switch (8) {
        case 1:  bouncing_spheres();   break;
        case 2:  checkered_spheres();  break;
        case 3:  earth();              break;
        case 4:  perlin_spheres();     break;
        case 5:  quads();              break;
        case 6:  simple_light();       break;
        case 7:  cornell_box();        break;
        case 8:  cornell_smoke();      break;
    }
}
```

我们得到:

![图像 22:带有烟雾块的康奈尔盒](/raytracing/tnw/img-2.22-cornell-smoke.png)
