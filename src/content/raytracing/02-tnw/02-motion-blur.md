---
title: "2. 运动模糊(Motion Blur)"
order: 2
description: "给光线加上时间信息,让相机在快门开启期间的随机时刻发射光线,并实现运动的球体来渲染运动模糊"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#motionblur"
sourceTitle: "Ray Tracing: The Next Week · Motion Blur"
license: "CC0 1.0"
---

当你决定使用光线追踪时,你就已经认定视觉质量比运行时间更重要。在渲染模糊反射和散焦模糊(defocus blur)时,我们对每个像素使用了多个采样。一旦你在这条路上迈出了一步,好消息是几乎*所有*效果都可以用类似的暴力方式实现。运动模糊(motion blur)当然就是其中之一。

在真实的相机中,快门(shutter)会在一个很短的时间区间内保持打开,在此期间相机和世界中的物体都可能发生移动。为了准确再现这样一张相机拍摄的画面,我们要求的是快门向世界打开期间相机所感受到的平均值。

## 2.1 时空光线追踪简介

我们可以在快门打开期间的某个随机时刻发射一条光线,从而得到单个(简化的)光子的随机估计。只要我们能确定物体在那个时刻应该处在什么位置,就能准确地测量出这条光线在同一时刻的光照。这又是一个例子,说明随机(蒙特卡洛,Monte Carlo)光线追踪最终会变得相当简单。暴力法又赢了!

由于光线追踪器的“引擎”只需确保每条光线对应的物体都处在应在的位置,求交的核心部分不需要怎么改动。为此,我们需要为每条光线存储确切的时间:

**代码清单 1**:`ray.h` 带有时间信息的光线

```cpp {5-9,14,23}
class ray {
  public:
    ray() {}

    ray(const point3& origin, const vec3& direction, double time)
      : orig(origin), dir(direction), tm(time) {}

    ray(const point3& origin, const vec3& direction)
      : ray(origin, direction, 0) {}

    const point3& origin() const  { return orig; }
    const vec3& direction() const { return dir; }

    double time() const { return tm; }

    point3 at(double t) const {
        return orig + t*dir;
    }

  private:
    point3 orig;
    vec3 dir;
    double tm;
};
```

## 2.2 管理时间

在继续之前,我们先来思考一下时间,以及如何在一次或多次连续渲染中管理它。快门计时有两个方面需要考虑:从一次快门打开到下一次快门打开之间的时间,以及每一帧快门保持打开的时长。标准的电影胶片过去以每秒 24 帧拍摄。现代数字电影可以是每秒 24、30、48、60、120 帧,或者导演想要的任意帧数。

每一帧都可以有自己的快门速度。这个快门速度不必是(通常也不是)整帧的最大时长。你可以让快门每帧打开 1/1000 秒,也可以是 1/60 秒。

如果你想渲染一系列图像,就需要为相机设置合适的快门计时:帧与帧之间的间隔、快门/渲染时长,以及总帧数(总拍摄时间)。如果相机在动而世界是静止的,那就没问题了。然而,如果世界中有任何东西在动,你就需要给 `hittable` 添加一个方法,让每个物体都能知道当前帧的时间段。这个方法将为所有动画物体提供一种途径,来设置它们在该帧内的运动。

这相当直接,如果你愿意,它绝对是一个值得尝试的有趣方向。不过就我们目前的目的而言,我们将采用一个简单得多的模型。我们只渲染单独一帧,并隐含地假设它从时间 = 0 开始、到时间 = 1 结束。我们的第一个任务是修改相机,让它在 $[0,1]$ 内的随机时间发射光线;第二个任务是创建一个动画球体类。

## 2.3 更新相机以模拟运动模糊

我们需要修改相机,让它在开始时间与结束时间之间的某个随机时刻生成光线。应该由相机来记录这个时间区间,还是在创建光线时交给相机的使用者来决定?拿不准的时候,如果能让调用变得简单,我倾向于让构造函数复杂一些,所以我会让相机来记录时间,不过这只是个人偏好。相机需要的改动不多,因为目前它还不允许移动;它只是在一个时间段内发射光线。

**代码清单 2**:`camera.h` 带有时间信息的相机

```cpp {16-18}
class camera {
  ...
  private:
    ...
    ray get_ray(int i, int j) const {
        // Construct a camera ray originating from the defocus disk and directed at a randomly
        // sampled point around the pixel location i, j.

        auto offset = sample_square();
        auto pixel_sample = pixel00_loc
                          + ((i + offset.x()) * pixel_delta_u)
                          + ((j + offset.y()) * pixel_delta_v);

        auto ray_origin = (defocus_angle <= 0) ? center : defocus_disk_sample();
        auto ray_direction = pixel_sample - ray_origin;
        auto ray_time = random_double();

        return ray(ray_origin, ray_direction, ray_time);
    }

    ...
};
```

## 2.4 添加运动的球体

现在来创建一个运动的物体。我会更新球体类,让它的球心在时间=0 时位于 `center1`,并线性移动到时间=1 时的 `center2`。(在这个时间区间之外它也会一直这样移动下去,所以实际上可以在任意时间对它采样。)我们的做法是把原来的三维球心点替换成一条三维光线,用它描述时间=0 时的初始位置,以及到时间=1 时终点位置的位移。

**代码清单 3**:`sphere.h` 运动的球体

```cpp {3-10,15}
class sphere : public hittable {
  public:
    // Stationary Sphere
    sphere(const point3& static_center, double radius, shared_ptr<material> mat)
      : center(static_center, vec3(0,0,0)), radius(std::fmax(0,radius)), mat(mat) {}

    // Moving Sphere
    sphere(const point3& center1, const point3& center2, double radius,
           shared_ptr<material> mat)
      : center(center1, center2 - center1), radius(std::fmax(0,radius)), mat(mat) {}

    ...

  private:
    ray center;
    double radius;
    shared_ptr<material> mat;

};
#endif
```

更新后的 `sphere::hit()` 函数与旧的 `sphere::hit()` 函数几乎一模一样:我们现在只需要确定动画球心的当前位置:

**代码清单 4**:`sphere.h` 运动球体的求交函数

```cpp {5-6,15}
class sphere : public hittable {
  public:
    ...
    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        point3 current_center = center.at(r.time());
        vec3 oc = current_center - r.origin();
        auto a = r.direction().length_squared();
        auto h = dot(r.direction(), oc);
        auto c = oc.length_squared() - radius*radius;

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

## 2.5 记录光线相交的时间

既然光线有了时间属性,我们就需要更新各个 `material::scatter()` 方法,把相交的时间考虑进去:

**代码清单 5**:`material.h` 在 material::scatter() 方法中处理光线时间

```cpp {11,24,37}
class lambertian : public material {
    ...
    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        auto scatter_direction = rec.normal + random_unit_vector();

        // Catch degenerate scatter direction
        if (scatter_direction.near_zero())
            scatter_direction = rec.normal;

        scattered = ray(rec.p, scatter_direction, r_in.time());
        attenuation = albedo;
        return true;
    }
    ...
};

class metal : public material {
    ...
    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        vec3 reflected = reflect(r_in.direction(), rec.normal);
        reflected = unit_vector(reflected) + (fuzz * random_unit_vector());
        scattered = ray(rec.p, reflected, r_in.time());
        attenuation = albedo;

        return (dot(scattered.direction(), rec.normal) > 0);
    }
    ...
};

class dielectric : public material {
    ...
    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        ...
        scattered = ray(rec.p, direction, r_in.time());
        return true;
    }
    ...
};
```

## 2.6 整合到一起

下面的代码取用了上一本书末尾场景中的那些漫反射小球,并让它们在图像渲染期间运动。每个球体从时间 $t=0$ 时的球心 $\mathbf{C}$ 移动到时间 $t=1$ 时的 $\mathbf{C} + (0, r/2, 0)$:

**代码清单 6**:`main.cc` 上一本书的最终场景,但球体在运动

```cpp {19-20,29-30}
int main() {
    hittable_list world;

    auto ground_material = make_shared<lambertian>(color(0.5, 0.5, 0.5));
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, ground_material));

    for (int a = -11; a < 11; a++) {
        for (int b = -11; b < 11; b++) {
            auto choose_mat = random_double();
            point3 center(a + 0.9*random_double(), 0.2, b + 0.9*random_double());

            if ((center - point3(4, 0.2, 0)).length() > 0.9) {
                shared_ptr<material> sphere_material;

                if (choose_mat < 0.8) {
                    // diffuse
                    auto albedo = color::random() * color::random();
                    sphere_material = make_shared<lambertian>(albedo);
                    auto center2 = center + vec3(0, random_double(0,.5), 0);
                    world.add(make_shared<sphere>(center, center2, 0.2, sphere_material));
                } else if (choose_mat < 0.95) {
                ...
    }
    ...

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.vfov     = 20;
    cam.lookfrom = point3(13,2,3);
    cam.lookat   = point3(0,0,0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0.6;
    cam.focus_dist    = 10.0;

    cam.render(world);
}
```

得到的结果如下:

![图像 1:弹跳的小球](/raytracing/tnw/img-2.01-bouncing-spheres.png)
