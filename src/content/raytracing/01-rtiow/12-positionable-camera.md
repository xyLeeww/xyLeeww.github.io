---
title: "12. 可定位相机(Positionable Camera)"
order: 12
description: "为相机加入可调的垂直视场角,并用 lookfrom、lookat 和 vup 让相机可以放在任意位置、朝向任意方向。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#positionablecamera"
sourceTitle: "Ray Tracing in One Weekend · Positionable Camera"
license: "CC0 1.0"
---

相机和电介质一样,调试起来都很痛苦,所以我总是一步一步地开发相机。首先,我们来支持可调的视场角(field of view,_fov_)。它是渲染图像从一侧边缘到另一侧边缘所张开的视角。由于我们的图像不是正方形的,水平方向和垂直方向的 fov 并不相同。我总是使用垂直 fov。我通常还习惯用角度(度)来指定它,再在构造函数里转换成弧度——这纯属个人喜好。

## 12.1 相机观察几何

首先,我们仍然让光线从原点出发,射向 $z = -1$ 平面。我们也可以让它射向 $z = -2$ 平面或者别的什么平面,只要让 $h$ 是相对于那个距离的比例即可。下面是我们的设置:

![图 18:相机观察几何(侧视图)](/raytracing/rtiow/fig-1.18-cam-view-geom.jpg)

由此可得 $h = \tan(\frac{\theta}{2})$。现在我们的相机变成了:

**代码清单 80**:`camera.h` 视场角(fov)可调的相机

```cpp
class camera {
  public:
    double aspect_ratio      = 1.0;  // Ratio of image width over height
    int    image_width       = 100;  // Rendered image width in pixel count
    int    samples_per_pixel = 10;   // Count of random samples for each pixel
    int    max_depth         = 10;   // Maximum number of ray bounces into scene

    double vfov = 90;  // Vertical view angle (field of view)

    void render(const hittable& world) {
    ...

  private:
    ...

    void initialize() {
        image_height = int(image_width / aspect_ratio);
        image_height = (image_height < 1) ? 1 : image_height;

        pixel_samples_scale = 1.0 / samples_per_pixel;

        center = point3(0, 0, 0);

        // Determine viewport dimensions.
        auto focal_length = 1.0;
        auto theta = degrees_to_radians(vfov);
        auto h = std::tan(theta/2);
        auto viewport_height = 2 * h * focal_length;
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

    ...
};
```

我们用一个简单的场景来测试这些改动:两个相切的球体,使用 90° 的视场角。

**代码清单 81**:`main.cc` 使用广角相机的场景

```cpp
int main() {
    hittable_list world;

    auto R = std::cos(pi/4);

    auto material_left  = make_shared<lambertian>(color(0,0,1));
    auto material_right = make_shared<lambertian>(color(1,0,0));

    world.add(make_shared<sphere>(point3(-R, 0, -1), R, material_left));
    world.add(make_shared<sphere>(point3( R, 0, -1), R, material_right));

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.vfov = 90;

    cam.render(world);
}
```

渲染结果如下:

![图像 19:广角视图](/raytracing/rtiow/img-1.19-wide-view.png)

## 12.2 定位与定向相机

为了得到任意的视点,我们先给关心的几个点起名字。我们把放置相机的位置称为 _lookfrom_,把相机看向的点称为 _lookat_。(以后如果你愿意,也可以改为指定一个观察方向,而不是一个观察目标点。)

我们还需要一种方式来指定相机的横滚(roll),也就是相机的侧向倾斜:绕 lookat-lookfrom 轴的旋转。换一种方式理解:即使你保持 `lookfrom` 和 `lookat` 不变,你仍然可以绕着自己的鼻子转动脑袋。我们需要的是一种为相机指定“向上”向量的方法。

![图 19:相机观察方向](/raytracing/rtiow/fig-1.19-cam-view-dir.jpg)

我们可以指定任意的向上向量,只要它不与观察方向平行即可。把这个向上向量投影到与观察方向正交的平面上,就得到了一个相对于相机的向上向量。我沿用常见的惯例,把它称为“视图上方向”(view up,_vup_)向量。经过几次叉积和向量归一化之后,我们就得到了一组完整的标准正交基 $(u,v,w)$,用来描述相机的朝向。$u$ 是指向相机右方的单位向量,$v$ 是指向相机上方的单位向量,$w$ 是指向观察方向反方向的单位向量(因为我们使用右手坐标系),而相机中心位于原点。

![图 20:相机的视图上方向](/raytracing/rtiow/fig-1.20-cam-view-up.jpg)

和之前固定相机朝向 $-Z$ 一样,我们这个可任意设置视角的相机朝向 $-w$。请记住,我们可以——但并非必须——使用世界坐标的向上方向 $(0,1,0)$ 来指定 vup。这样做很方便,而且在你决定尝试疯狂的相机角度之前,它会自然地让相机保持水平。

**代码清单 82**:`camera.h` 可定位、可定向的相机

```cpp
class camera {
  public:
    double aspect_ratio      = 1.0;  // Ratio of image width over height
    int    image_width       = 100;  // Rendered image width in pixel count
    int    samples_per_pixel = 10;   // Count of random samples for each pixel
    int    max_depth         = 10;   // Maximum number of ray bounces into scene

    double vfov     = 90;              // Vertical view angle (field of view)
    point3 lookfrom = point3(0,0,0);   // Point camera is looking from
    point3 lookat   = point3(0,0,-1);  // Point camera is looking at
    vec3   vup      = vec3(0,1,0);     // Camera-relative "up" direction

    ...

  private:
    int    image_height;         // Rendered image height
    double pixel_samples_scale;  // Color scale factor for a sum of pixel samples
    point3 center;               // Camera center
    point3 pixel00_loc;          // Location of pixel 0, 0
    vec3   pixel_delta_u;        // Offset to pixel to the right
    vec3   pixel_delta_v;        // Offset to pixel below
    vec3   u, v, w;              // Camera frame basis vectors

    void initialize() {
        image_height = int(image_width / aspect_ratio);
        image_height = (image_height < 1) ? 1 : image_height;

        pixel_samples_scale = 1.0 / samples_per_pixel;

        center = lookfrom;

        // Determine viewport dimensions.
        auto focal_length = (lookfrom - lookat).length();
        auto theta = degrees_to_radians(vfov);
        auto h = std::tan(theta/2);
        auto viewport_height = 2 * h * focal_length;
        auto viewport_width = viewport_height * (double(image_width)/image_height);

        // Calculate the u,v,w unit basis vectors for the camera coordinate frame.
        w = unit_vector(lookfrom - lookat);
        u = unit_vector(cross(vup, w));
        v = cross(w, u);

        // Calculate the vectors across the horizontal and down the vertical viewport edges.
        vec3 viewport_u = viewport_width * u;    // Vector across viewport horizontal edge
        vec3 viewport_v = viewport_height * -v;  // Vector down viewport vertical edge

        // Calculate the horizontal and vertical delta vectors from pixel to pixel.
        pixel_delta_u = viewport_u / image_width;
        pixel_delta_v = viewport_v / image_height;

        // Calculate the location of the upper left pixel.
        auto viewport_upper_left = center - (focal_length * w) - viewport_u/2 - viewport_v/2;
        pixel00_loc = viewport_upper_left + 0.5 * (pixel_delta_u + pixel_delta_v);
    }

    ...

  private:
};
```

我们换回之前的那个场景,并使用新的视点:

**代码清单 83**:`main.cc` 使用另一个视点的场景

```cpp
int main() {
    hittable_list world;

    auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
    auto material_center = make_shared<lambertian>(color(0.1, 0.2, 0.5));
    auto material_left   = make_shared<dielectric>(1.50);
    auto material_bubble = make_shared<dielectric>(1.00 / 1.50);
    auto material_right  = make_shared<metal>(color(0.8, 0.6, 0.2), 1.0);

    world.add(make_shared<sphere>(point3( 0.0, -100.5, -1.0), 100.0, material_ground));
    world.add(make_shared<sphere>(point3( 0.0,    0.0, -1.2),   0.5, material_center));
    world.add(make_shared<sphere>(point3(-1.0,    0.0, -1.0),   0.5, material_left));
    world.add(make_shared<sphere>(point3(-1.0,    0.0, -1.0),   0.4, material_bubble));
    world.add(make_shared<sphere>(point3( 1.0,    0.0, -1.0),   0.5, material_right));

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.vfov     = 90;
    cam.lookfrom = point3(-2,2,1);
    cam.lookat   = point3(0,0,-1);
    cam.vup      = vec3(0,1,0);

    cam.render(world);
}
```

得到:

![图像 20:远景视图](/raytracing/rtiow/img-1.20-view-distant.png)

我们还可以改变视场角:

**代码清单 84**:`main.cc` 修改视场角

```cpp
    cam.vfov     = 20;
```

得到:

![图像 21:放大视图](/raytracing/rtiow/img-1.21-view-zoom.png)
