---
title: "7. 把相机代码移入独立的类(Moving Camera Code Into Its Own Class)"
order: 7
description: "把相机设置、光线生成和渲染循环从 main 中整理到一个新的 camera 类里,main 只负责搭建场景。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#movingcameracodeintoitsownclass"
sourceTitle: "Ray Tracing in One Weekend · Moving Camera Code Into Its Own Class"
license: "CC0 1.0"
---

在继续之前,现在正是把相机和场景渲染代码整合进一个新类——`camera` 类——的好时机。相机(camera)类负责两项重要工作:

1. 构造光线并把它们发射到场景(world)中。
2. 利用这些光线的结果构造出渲染图像。

在这次重构中,我们会把 `ray_color()` 函数,以及主程序中的图像、相机和渲染这几部分代码收拢到一起。新的 camera 类将包含两个公有方法 `initialize()` 和 `render()`,外加两个私有辅助方法 `get_ray()` 和 `ray_color()`。

最终,相机会采用我们能想到的最简单的使用方式:先以无参数的方式默认构造,然后由持有它的代码通过简单赋值修改相机的公有变量,最后调用 `initialize()` 函数完成全部初始化。之所以选择这种方式,而不是让持有者调用一个带一大堆参数的构造函数,或者定义并调用一堆 setter 方法,是因为这样持有者只需设置它明确关心的东西。最后,我们既可以让持有者自己调用 `initialize()`,也可以让相机在 `render()` 开始时自动调用这个函数。我们采用第二种做法。

main 创建相机并设置好默认值之后,会调用 `render()` 方法。`render()` 方法会为渲染做好相机的准备工作,然后执行渲染循环。

下面是新的 `camera` 类的骨架:

**代码清单 37**:`camera.h` camera 类骨架

```cpp
#ifndef CAMERA_H
#define CAMERA_H

#include "hittable.h"

class camera {
  public:
    /* Public Camera Parameters Here */

    void render(const hittable& world) {
        ...
    }

  private:
    /* Private Camera Variables Here */

    void initialize() {
        ...
    }

    color ray_color(const ray& r, const hittable& world) const {
        ...
    }
};

#endif
```

首先,把 `main.cc` 中的 `ray_color()` 函数填进来:

**代码清单 38**:`camera.h` camera::ray_color 函数

```cpp {8-16}
class camera {
  ...

  private:
    ...

    color ray_color(const ray& r, const hittable& world) const {
        hit_record rec;

        if (world.hit(r, interval(0, infinity), rec)) {
            return 0.5 * (rec.normal + color(1,1,1));
        }

        vec3 unit_direction = unit_vector(r.direction());
        auto a = 0.5*(unit_direction.y() + 1.0);
        return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
    }
};

#endif
```

现在,我们把 `main()` 函数中的几乎所有内容都搬进新的 camera 类。`main()` 函数中只剩下场景的构建。下面是迁移了代码之后的 camera 类:

**代码清单 39**:`camera.h` 可以工作的 camera 类

```cpp {3-24,27-56}
class camera {
  public:
    double aspect_ratio = 1.0;  // Ratio of image width over height
    int    image_width  = 100;  // Rendered image width in pixel count

    void render(const hittable& world) {
        initialize();

        std::cout << "P3\n" << image_width << ' ' << image_height << "\n255\n";

        for (int j = 0; j < image_height; j++) {
            std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
            for (int i = 0; i < image_width; i++) {
                auto pixel_center = pixel00_loc + (i * pixel_delta_u) + (j * pixel_delta_v);
                auto ray_direction = pixel_center - center;
                ray r(center, ray_direction);

                color pixel_color = ray_color(r, world);
                write_color(std::cout, pixel_color);
            }
        }

        std::clog << "\rDone.                 \n";
    }

  private:
    int    image_height;   // Rendered image height
    point3 center;         // Camera center
    point3 pixel00_loc;    // Location of pixel 0, 0
    vec3   pixel_delta_u;  // Offset to pixel to the right
    vec3   pixel_delta_v;  // Offset to pixel below

    void initialize() {
        image_height = int(image_width / aspect_ratio);
        image_height = (image_height < 1) ? 1 : image_height;

        center = point3(0, 0, 0);

        // Determine viewport dimensions.
        auto focal_length = 1.0;
        auto viewport_height = 2.0;
        auto viewport_width = viewport_height * (double(image_width)/image_height);

        // Calculate the vectors across the horizontal and down the vertical viewport edges.
        auto viewport_u = vec3(viewport_width, 0, 0);
        auto viewport_v = vec3(0, -viewport_height, 0);

        // Calculate the horizontal and vertical delta vectors from pixel to pixel.
        pixel_delta_u = viewport_u / image_width;
        pixel_delta_v = viewport_v / image_height;

        // Calculate the location of the upper left pixel.
        auto viewport_upper_left =
            center - vec3(0, 0, focal_length) - viewport_u/2 - viewport_v/2;
        pixel00_loc = viewport_upper_left + 0.5 * (pixel_delta_u + pixel_delta_v);
    }

    color ray_color(const ray& r, const hittable& world) const {
        ...
    }
};

#endif
```

下面是大幅精简后的 main:

**代码清单 40**:`main.cc` 使用新相机的新 main

```cpp {3,13-23} del={8-10}
#include "rtweekend.h"

#include "camera.h"
#include "hittable.h"
#include "hittable_list.h"
#include "sphere.h"

color ray_color(const ray& r, const hittable& world) {
    ...
}

int main() {
    hittable_list world;

    world.add(make_shared<sphere>(point3(0,0,-1), 0.5));
    world.add(make_shared<sphere>(point3(0,-100.5,-1), 100));

    camera cam;

    cam.aspect_ratio = 16.0 / 9.0;
    cam.image_width  = 400;

    cam.render(world);
}
```

运行这个重构后的新程序,应该会得到与之前相同的渲染图像。

> **译注**:正文提到 camera 类还会有一个私有辅助方法 `get_ray()`,但本章的代码中还没有出现它,它会在下一章[抗锯齿](/rt-docs/01-rtiow/08-antialiasing/)中加入。
