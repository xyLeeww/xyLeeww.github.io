---
title: "13. 散焦模糊(Defocus Blur)"
order: 13
description: "用薄透镜近似在相机中实现散焦模糊:从散焦圆盘上的随机点发射光线,让焦平面以外的物体变得模糊。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#defocusblur"
sourceTitle: "Ray Tracing in One Weekend · Defocus Blur"
license: "CC0 1.0"
---

现在来实现我们的最后一个功能:_散焦模糊_(defocus blur)。注意,摄影师把它称为 _景深_(depth of field),所以请只在你那些搞光线追踪的朋友之间使用 _散焦模糊_ 这个说法。

真实相机之所以会有散焦模糊,是因为它们需要一个大孔(而不仅仅是一个针孔)来收集光线。一个大孔会让所有东西都失焦,但如果我们在胶片/传感器前面放一块透镜,就会存在某个特定的距离,在这个距离上的所有东西都是清晰对焦的。放在这个距离上的物体看起来是清晰的,而离这个距离越远的物体,看起来就会线性地越模糊。你可以这样理解透镜:所有 _从_ 对焦距离处某个特定点发出、并且射到透镜上的光线,都会被弯折回去,汇聚 _到_ 图像传感器上的同一个点。

我们把相机中心到“所有东西都完美对焦”的那个平面之间的距离称为 _对焦距离_(focus distance)。要注意,对焦距离通常和焦距并不相同——_焦距_(focal length)是相机中心到像平面之间的距离。不过在我们的模型里,这两者取相同的值,因为我们会把像素网格直接放在对焦平面上,而对焦平面与相机中心的距离正是 _对焦距离_。

在实体相机中,对焦距离由透镜与胶片/传感器之间的距离控制。这就是为什么当你改变对焦目标时,会看到镜头相对于机身移动(手机相机里也可能发生这种事,只不过移动的是传感器)。“光圈”(aperture)是一个用来控制透镜有效大小的孔。对于真实相机,如果需要更多的光,就把光圈开大,这样远离对焦距离的物体也会变得更模糊。而对于我们的虚拟相机,我们可以拥有一个完美的传感器,永远不需要更多的光,所以只有在想要散焦模糊时才使用光圈。

## 13.1 薄透镜近似

真实的相机有一组复杂的复合透镜。在我们的代码里,可以按照“传感器、透镜、光圈”的顺序进行模拟,然后算出光线该往哪里发射,并在计算完成后把图像翻转过来(图像在胶片上是倒立投影的)。不过,图形学从业者通常使用薄透镜近似(thin lens approximation):

![图 21:相机透镜模型](/raytracing/rtiow/fig-1.21-cam-lens.jpg)

我们并不需要模拟相机内部的任何东西——就渲染相机外部的图像而言,那只会带来不必要的复杂度。相反,我通常让光线从一个无限薄的圆形“透镜”出发,射向对焦平面上我们关心的那个像素(对焦平面距透镜 `focal_length`),在三维世界里,位于这个平面上的一切都完美对焦。

在实践中,我们通过把视口放在这个平面上来实现这一点。把所有内容综合起来:

1. 对焦平面与相机观察方向正交。
2. 对焦距离是相机中心与对焦平面之间的距离。
3. 视口位于对焦平面上,以相机观察方向向量为中心。
4. 像素位置组成的网格位于视口之内(视口位于三维世界中)。
5. 随机的图像采样位置从当前像素位置周围的区域中选取。
6. 相机从透镜上的随机点发射光线,穿过当前的图像采样位置。

![图 22:相机对焦平面](/raytracing/rtiow/fig-1.22-cam-film-plane.jpg)

## 13.2 生成采样光线

没有散焦模糊时,场景中所有光线都从相机中心(也就是 `lookfrom`)出发。为了实现散焦模糊,我们构造一个以相机中心为圆心的圆盘。半径越大,散焦模糊就越强。你可以认为我们原来的相机拥有一个半径为零的散焦圆盘(完全没有模糊),所以所有光线都从圆盘中心(`lookfrom`)出发。

那么,散焦圆盘应该多大呢?既然这个圆盘的大小控制着散焦模糊的程度,它就应该是相机类的一个参数。我们可以直接把圆盘半径作为相机参数,但那样的话,模糊程度会随着投影距离的不同而变化。一个稍微更方便的参数是:指定一个圆锥的锥角,这个圆锥的顶点位于视口中心,底面(即散焦圆盘)位于相机中心。这样一来,对于同一个镜头画面,当你改变对焦距离时,应该能得到更一致的结果。

因为我们要从散焦圆盘上选取随机点,所以需要一个函数来完成这件事:`random_in_unit_disk()`。这个函数的工作方式与我们在 `random_unit_vector()` 中使用的方法相同,只不过是二维的。

**代码清单 85**:`vec3.h` 生成单位圆盘内的随机点

```cpp {7-13}
...

inline vec3 unit_vector(const vec3& u) {
    return v / v.length();
}

inline vec3 random_in_unit_disk() {
    while (true) {
        auto p = vec3(random_double(-1,1), random_double(-1,1), 0);
        if (p.length_squared() < 1)
            return p;
    }
}

...
```

现在我们来更新相机,让光线从散焦圆盘上发出:

**代码清单 86**:`camera.h` 景深可调的相机

```cpp {13-14,26-27,41,58,61-64,68-69,76,86-90} del={38}
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

    double defocus_angle = 0;  // Variation angle of rays through each pixel
    double focus_dist = 10;    // Distance from camera lookfrom point to plane of perfect focus

    ...

  private:
    int    image_height;         // Rendered image height
    double pixel_samples_scale;  // Color scale factor for a sum of pixel samples
    point3 center;               // Camera center
    point3 pixel00_loc;          // Location of pixel 0, 0
    vec3   pixel_delta_u;        // Offset to pixel to the right
    vec3   pixel_delta_v;        // Offset to pixel below
    vec3   u, v, w;              // Camera frame basis vectors
    vec3   defocus_disk_u;       // Defocus disk horizontal radius
    vec3   defocus_disk_v;       // Defocus disk vertical radius

    void initialize() {
        image_height = int(image_width / aspect_ratio);
        image_height = (image_height < 1) ? 1 : image_height;

        pixel_samples_scale = 1.0 / samples_per_pixel;

        center = lookfrom;

        // Determine viewport dimensions.
        auto focal_length = (lookfrom - lookat).length();
        auto theta = degrees_to_radians(vfov);
        auto h = std::tan(theta/2);
        auto viewport_height = 2 * h * focus_dist;
        auto viewport_width = viewport_height * (double(image_width)/image_height);

        // Calculate the u,v,w unit basis vectors for the camera coordinate frame.
        w = unit_vector(lookfrom - lookat);
        u = unit_vector(cross(vup, w));
        v = cross(w, u);

        // Calculate the vectors across the horizontal and down the vertical viewport edges.
        vec3 viewport_u = viewport_width * u;    // Vector across viewport horizontal edge
        vec3 viewport_v = viewport_height * -v;  // Vector down viewport vertical edge

        // Calculate the horizontal and vertical delta vectors to the next pixel.
        pixel_delta_u = viewport_u / image_width;
        pixel_delta_v = viewport_v / image_height;

        // Calculate the location of the upper left pixel.
        auto viewport_upper_left = center - (focus_dist * w) - viewport_u/2 - viewport_v/2;
        pixel00_loc = viewport_upper_left + 0.5 * (pixel_delta_u + pixel_delta_v);

        // Calculate the camera defocus disk basis vectors.
        auto defocus_radius = focus_dist * std::tan(degrees_to_radians(defocus_angle / 2));
        defocus_disk_u = u * defocus_radius;
        defocus_disk_v = v * defocus_radius;
    }

    ray get_ray(int i, int j) const {
        // Construct a camera ray originating from the defocus disk and directed at a randomly
        // sampled point around the pixel location i, j.

        auto offset = sample_square();
        auto pixel_sample = pixel00_loc
                          + ((i + offset.x()) * pixel_delta_u)
                          + ((j + offset.y()) * pixel_delta_v);

        auto ray_origin = (defocus_angle <= 0) ? center : defocus_disk_sample();
        auto ray_direction = pixel_sample - ray_origin;

        return ray(ray_origin, ray_direction);
    }

    vec3 sample_square() const {
        ...
    }

    point3 defocus_disk_sample() const {
        // Returns a random point in the camera defocus disk.
        auto p = random_in_unit_disk();
        return center + (p[0] * defocus_disk_u) + (p[1] * defocus_disk_v);
    }

    color ray_color(const ray& r, int depth, const hittable& world) const {
        ...
    }
};
```

使用一个大光圈:

**代码清单 87**:`main.cc` 带景深效果的场景相机

```cpp {16-17}
int main() {
    ...

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.vfov     = 20;
    cam.lookfrom = point3(-2,2,1);
    cam.lookat   = point3(0,0,-1);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 10.0;
    cam.focus_dist    = 3.4;

    cam.render(world);
}
```

我们得到:

![图像 22:带有景深效果的球体](/raytracing/rtiow/img-1.22-depth-of-field.png)
