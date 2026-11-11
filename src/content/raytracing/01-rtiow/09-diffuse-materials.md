---
title: "9. 漫反射材质(Diffuse Materials)"
order: 9
description: "用随机反弹的光线实现漫反射材质,限制递归深度,修复阴影痤疮,实现朗伯反射并加入伽马校正。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#diffusematerials"
sourceTitle: "Ray Tracing in One Weekend · Diffuse Materials"
license: "CC0 1.0"
---

现在我们已经有了物体,每个像素也有了多条光线,可以开始制作一些看起来逼真的材质(material)了。我们先从漫反射(diffuse)材质(也称为 _哑光(matte)_ 材质)开始。这里有一个问题:是让几何体和材质可以自由搭配(这样就能把一种材质赋给多个球体,反之亦然),还是让几何体和材质紧密绑定(这对几何体和材质相互关联的程序化物体可能会很有用)?我们选择把它们分开——这也是大多数渲染器的常见做法——不过要知道,也存在其他的做法。

## 9.1 一个简单的漫反射材质

自身不发光的漫反射物体只是呈现出周围环境的颜色,但它们会用自己固有的颜色对其进行调制。从漫反射表面反射出去的光,方向是随机的。所以,如果我们向两个漫反射表面之间的缝隙中射入三条光线,它们各自会有不同的随机行为:

![图 9:光线的反弹](/raytracing/rtiow/fig-1.09-light-bounce.jpg)

光线也可能被吸收而不是被反射。表面越暗,光线就越可能被吸收(这正是它看起来暗的原因!)。实际上,任何让方向随机化的算法都能产生看起来哑光的表面。我们先从最直观的方法开始:表面把光线等概率地随机反弹到所有方向上。对于这种材质,击中表面的光线以相同的概率朝着远离表面的任意方向反弹。

![图 10:在地平线以上均匀反射](/raytracing/rtiow/fig-1.10-random-vec-horizon.jpg)

这种非常直观的材质是最简单的一种漫反射——事实上,许多早期的光线追踪论文都使用了这种漫反射方法(后来才采用了一种更精确的方法,我们稍后也会实现它)。目前我们还没有办法随机地反射一条光线,所以需要在向量工具头文件中添加几个函数。首先需要的是生成任意随机向量的能力:

**代码清单 47**:`vec3.h` `vec3` 随机工具函数

```cpp {9-15}
class vec3 {
  public:
    ...

    double length_squared() const {
        return e[0]*e[0] + e[1]*e[1] + e[2]*e[2];
    }

    static vec3 random() {
        return vec3(random_double(), random_double(), random_double());
    }

    static vec3 random(double min, double max) {
        return vec3(random_double(min,max), random_double(min,max), random_double(min,max));
    }
};
```

接下来,我们要想办法处理随机向量,使得到的结果只落在半球面上。有一些解析方法可以做到这一点,但它们理解起来出奇地复杂,实现起来也相当麻烦。所以我们改用通常最简单的算法:拒绝采样法(rejection method)。拒绝采样法的做法是不断生成随机样本,直到产生一个满足要求的样本为止。换句话说,就是不断拒绝不合格的样本,直到找到一个合格的。

用拒绝采样法在半球上生成随机向量有许多同样有效的方式,但出于我们的目的,我们选择最简单的一种:

1. 在单位球内部生成一个随机向量
2. 将这个向量归一化,把它延伸到球面上
3. 如果归一化后的向量落在了错误的半球上,就把它取反

首先,我们用拒绝采样法在单位球(即半径为 1 的球)内部生成随机向量。在包围单位球的立方体内随机选一个点(也就是 $x$、$y$、$z$ 都在 $[-1,+1]$ 范围内的点)。如果这个点位于单位球之外,就重新生成,直到找到一个位于单位球内部或球面上的点为止。

![图 11:找到合格向量之前,有两个向量被拒绝(归一化之前)](/raytracing/rtiow/fig-1.11-sphere-vec.jpg)

![图 12:将被接受的随机向量归一化,得到单位向量](/raytracing/rtiow/fig-1.12-sphere-unit-vec.jpg)

下面是这个函数的第一版:

**代码清单 48**:`vec3.h` `random_unit_vector()` 函数,第一版

```cpp {7-14}
...

inline vec3 unit_vector(const vec3& v) {
    return v / v.length();
}

inline vec3 random_unit_vector() {
    while (true) {
        auto p = vec3::random(-1,1);
        auto lensq = p.length_squared();
        if (lensq <= 1)
            return p / sqrt(lensq);
    }
}
```

遗憾的是,我们还要处理一个小小的浮点数抽象泄漏问题。由于浮点数的精度有限,一个非常小的值在平方后可能会下溢为零。因此,如果三个坐标都足够小(也就是非常靠近球心),向量的模长就会是零,归一化时就会得到错误的向量 $[\pm\infty, \pm\infty, \pm\infty]$。为了解决这个问题,我们还要拒绝落在球心周围这个“黑洞”里的点。使用双精度(64 位浮点数)时,我们可以安全地支持大于 $10^{-160}$ 的值。

下面是更健壮的版本:

**代码清单 49**:`vec3.h` `random_unit_vector()` 函数,第二版

```cpp {5}
inline vec3 random_unit_vector() {
    while (true) {
        auto p = vec3::random(-1,1);
        auto lensq = p.length_squared();
        if (1e-160 < lensq && lensq <= 1)
            return p / sqrt(lensq);
    }
}
```

有了随机单位向量之后,我们可以把它与表面法线(surface normal)比较,来判断它是否位于正确的半球:

![图 13:法向量告诉我们需要的是哪个半球](/raytracing/rtiow/fig-1.13-surface-normal.jpg)

我们可以计算表面法线与随机向量的点积,来判断随机向量是否位于正确的半球。如果点积为正,说明向量位于正确的半球;如果点积为负,就需要把向量取反。

**代码清单 50**:`vec3.h` `random_on_hemisphere()` 函数

```cpp {12-18}
...

inline vec3 random_unit_vector() {
    while (true) {
        auto p = vec3::random(-1,1);
        auto lensq = p.length_squared();
        if (1e-160 < lensq && lensq <= 1)
            return p / sqrt(lensq);
    }
}

inline vec3 random_on_hemisphere(const vec3& normal) {
    vec3 on_unit_sphere = random_unit_vector();
    if (dot(on_unit_sphere, normal) > 0.0) // In the same hemisphere as the normal
        return on_unit_sphere;
    else
        return -on_unit_sphere;
}
```

如果光线从某种材质上反弹后保留了 100% 的颜色,我们就说这种材质是 _白色_ 的;如果光线反弹后保留了 0% 的颜色,我们就说这种材质是黑色的。作为新漫反射材质的第一次演示,我们让 `ray_color` 函数返回一次反弹所得颜色的 50%。我们应该会得到一种漂亮的灰色。

**代码清单 51**:`camera.h` 使用随机光线方向的 `ray_color()`

```cpp {9-10}
class camera {
  ...
  private:
    ...
    color ray_color(const ray& r, const hittable& world) const {
        hit_record rec;

        if (world.hit(r, interval(0, infinity), rec)) {
            vec3 direction = random_on_hemisphere(rec.normal);
            return 0.5 * ray_color(ray(rec.p, direction), world);
        }

        vec3 unit_direction = unit_vector(r.direction());
        auto a = 0.5*(unit_direction.y() + 1.0);
        return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
    }
};
```

……我们确实得到了相当漂亮的灰色球体:

![图像 7:漫反射球体的第一次渲染](/raytracing/rtiow/img-1.07-first-diffuse.png)

## 9.2 限制子光线的数量

这里潜藏着一个问题。注意 `ray_color` 函数是递归的。它什么时候停止递归呢?当光线没有击中任何物体的时候。然而在某些情况下,这可能需要很长时间——长到足以让栈溢出。为了防止这种情况,我们来限制最大递归深度,在达到最大深度时不再贡献任何光照:

**代码清单 52**:`camera.h` 带有深度限制的 `camera::ray_color()`

```cpp {6,19,30-33,39}
class camera {
  public:
    double aspect_ratio      = 1.0;  // Ratio of image width over height
    int    image_width       = 100;  // Rendered image width in pixel count
    int    samples_per_pixel = 10;   // Count of random samples for each pixel
    int    max_depth         = 10;   // Maximum number of ray bounces into scene

    void render(const hittable& world) {
        initialize();

        std::cout << "P3\n" << image_width << ' ' << image_height << "\n255\n";

        for (int j = 0; j < image_height; j++) {
            std::clog << "\rScanlines remaining: " << (image_height - j) << ' ' << std::flush;
            for (int i = 0; i < image_width; i++) {
                color pixel_color(0,0,0);
                for (int sample = 0; sample < samples_per_pixel; sample++) {
                    ray r = get_ray(i, j);
                    pixel_color += ray_color(r, max_depth, world);
                }
                write_color(std::cout, pixel_samples_scale * pixel_color);
            }
        }

        std::clog << "\rDone.                 \n";
    }
    ...
  private:
    ...
    color ray_color(const ray& r, int depth, const hittable& world) const {
        // If we've exceeded the ray bounce limit, no more light is gathered.
        if (depth <= 0)
            return color(0,0,0);

        hit_record rec;

        if (world.hit(r, interval(0, infinity), rec)) {
            vec3 direction = random_on_hemisphere(rec.normal);
            return 0.5 * ray_color(ray(rec.p, direction), depth-1, world);
        }

        vec3 unit_direction = unit_vector(r.direction());
        auto a = 0.5*(unit_direction.y() + 1.0);
        return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
    }
};
```

更新 `main()` 函数,使用这个新的深度限制:

**代码清单 53**:`main.cc` 使用新的光线深度限制

```cpp {9}
int main() {
    ...

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.render(world);
}
```

对于这个非常简单的场景,我们应该会得到基本相同的结果:

![图像 8:限制反弹次数后漫反射球体的第二次渲染](/raytracing/rtiow/img-1.08-second-diffuse.png)

## 9.3 修复阴影痤疮

还有一个不易察觉的 bug 需要处理。光线与表面相交时,会尝试精确地计算交点。不幸的是,这个计算容易受到浮点舍入误差的影响,导致交点有极其微小的偏差。这意味着下一条光线(也就是从表面随机散射出去的那条光线)的起点不太可能恰好与表面齐平。它可能稍稍位于表面之上,也可能稍稍位于表面之下。如果光线的起点稍稍位于表面之下,它就可能再次与这个表面相交,也就是说,它会在 $t=0.00000001$ 处(或者命中函数给出的其他某个浮点近似值处)找到最近的表面。解决这个问题最简单的取巧办法,就是忽略离计算出的交点非常近的命中:

**代码清单 54**:`camera.h` 带容差地计算反射光线的起点

```cpp {12}
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
            vec3 direction = random_on_hemisphere(rec.normal);
            return 0.5 * ray_color(ray(rec.p, direction), depth-1, world);
        }

        vec3 unit_direction = unit_vector(r.direction());
        auto a = 0.5*(unit_direction.y() + 1.0);
        return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
    }
};
```

这样就消除了阴影痤疮(shadow acne)问题。没错,它真的就叫这个名字。结果如下:

![图像 9:没有阴影痤疮的漫反射球体](/raytracing/rtiow/img-1.09-no-acne.png)

## 9.4 真正的朗伯反射

把反射光线均匀地散射到半球上,可以得到一个不错的柔和漫反射模型,但我们肯定能做得更好。对真实漫反射物体更准确的描述是 _朗伯(Lambertian)_ 分布。这种分布散射反射光线的方式与 $\cos(\phi)$ 成正比,其中 $\phi$ 是反射光线与表面法线之间的夹角。这意味着反射光线最可能朝着靠近表面法线的方向散射,而朝着远离法线的方向散射的可能性较小。与我们之前的均匀散射相比,这种不均匀的朗伯分布能更好地模拟现实世界中材质的反射。

我们可以通过把一个随机单位向量加到法向量上来得到这种分布。在表面的交点处,有命中点 $\mathbf{p}$,还有表面的法线 $\mathbf{n}$。在交点处,这个表面恰好有两侧,所以与任一交点相切的单位球只可能有两个(表面的每一侧各有一个)。这两个单位球会沿着离开表面的方向偏移其半径的长度,对单位球来说正好是 1。

一个球沿表面法线($\mathbf{n}$)方向偏移,另一个球沿相反方向($\mathbf{-n}$)偏移。这样我们就得到了两个单位大小的球,它们 _恰好_ 只在交点处与表面接触。由此,其中一个球的球心位于 $(\mathbf{P} + \mathbf{n})$,另一个球的球心位于 $(\mathbf{P} - \mathbf{n})$。球心位于 $(\mathbf{P} - \mathbf{n})$ 的球被认为在表面 _内侧_,而球心位于 $(\mathbf{P} + \mathbf{n})$ 的球被认为在表面 _外侧_。

我们要选择与光线起点位于表面同一侧的那个相切单位球。在这个单位半径的球上随机选一个点 $\mathbf{S}$,然后从命中点 $\mathbf{P}$ 向随机点 $\mathbf{S}$ 发射一条光线(也就是向量 $(\mathbf{S}-\mathbf{P})$):

![图 14:按照朗伯分布随机生成一个向量](/raytracing/rtiow/fig-1.14-rand-unitvec.jpg)

改动其实非常小:

**代码清单 55**:`camera.h` 替换了漫反射方法的 `ray_color()`

```cpp {11}
class camera {
    ...
    color ray_color(const ray& r, int depth, const hittable& world) const {
        // If we've exceeded the ray bounce limit, no more light is gathered.
        if (depth <= 0)
            return color(0,0,0);

        hit_record rec;

        if (world.hit(r, interval(0.001, infinity), rec)) {
            vec3 direction = rec.normal + random_unit_vector();
            return 0.5 * ray_color(ray(rec.p, direction), depth-1, world);
        }

        vec3 unit_direction = unit_vector(r.direction());
        auto a = 0.5*(unit_direction.y() + 1.0);
        return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
    }
};
```

渲染之后,我们得到了一张相似的图像:

![图像 10:朗伯球体的正确渲染](/raytracing/rtiow/img-1.10-correct-lambertian.png)

由于我们这个只有两个球体的场景非常简单,很难分辨这两种漫反射方法的区别,但你应该能注意到两个重要的视觉差异:

1. 改动之后,阴影更加明显
2. 改动之后,两个球体都被天空染上了一层蓝色

这两个变化都是因为光线的散射变得不那么均匀了——更多的光线朝着法线方向散射。这意味着漫反射物体看起来会 _更暗_,因为朝相机反弹的光变少了。至于阴影,更多的光径直向上反弹,所以球体下方的区域会更暗。

日常生活中常见的物体很少是完美漫反射的,所以我们对这类物体在光照下表现的视觉直觉可能并不准确。随着本书中的场景越来越复杂,建议你在这里介绍的几种漫反射渲染方法之间切换着试一试。大多数有意思的场景都包含大量漫反射材质。理解不同漫反射方法对场景光照的影响,能让你获得宝贵的见解。

## 9.5 使用伽马校正得到准确的颜色强度

注意球体下方的阴影。这张图片非常暗,但我们的球体每次反弹只吸收一半的能量,所以它们是反射率 50% 的反射体。球体看起来应该相当亮(在现实中是浅灰色),但它们却显得相当暗。如果把我们的漫反射材质在整个亮度范围(gamut)内走一遍,就能更清楚地看到这一点。我们先把 `ray_color` 函数的反射率从 `0.5`(50%)改为 `0.1`(10%):

**代码清单 56**:`camera.h` 反射率为 10% 的 `ray_color()`

```cpp {12}
class camera {
    ...
    color ray_color(const ray& r, int depth, const hittable& world) const {
        // If we've exceeded the ray bounce limit, no more light is gathered.
        if (depth <= 0)
            return color(0,0,0);

        hit_record rec;

        if (world.hit(r, interval(0.001, infinity), rec)) {
            vec3 direction = rec.normal + random_unit_vector();
            return 0.1 * ray_color(ray(rec.p, direction), depth-1, world);
        }

        vec3 unit_direction = unit_vector(r.direction());
        auto a = 0.5*(unit_direction.y() + 1.0);
        return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
    }
};
```

我们以新的 10% 反射率渲染一次,然后把反射率设为 30% 再渲染一次,接着依次用 50%、70%,最后用 90% 重复。你可以在自己喜欢的图片编辑器里把这些图像从左到右依次排列,就能非常直观地看到你所选亮度范围逐渐变亮的过程。下面就是我们到目前为止一直在用的范围:

![图像 11:目前渲染器的亮度范围](/raytracing/rtiow/img-1.11-linear-gamut.png)

如果仔细观察,或者使用取色器,你应该会发现反射率 50% 的渲染结果(中间那张)太暗了,根本不在白与黑的正中间(中灰色)。实际上,70% 的反射体反而更接近中灰色。原因在于,几乎所有的计算机程序都假定图像在写入图像文件之前已经做过“伽马校正(gamma correction)”。这意味着 0 到 1 之间的值在存储为一个字节之前,会先经过某种变换。未经变换就写入数据的图像被称为处于 _线性空间(linear space)_,而经过变换的图像则被称为处于 _伽马空间(gamma space)_。你所用的图片查看器很可能期望得到伽马空间的图像,而我们给它的却是线性空间的图像。这就是我们的图像显得过暗、不准确的原因。

图像应当以伽马空间存储有很多充分的理由,但就我们的目的而言,只需要知道这件事就够了。我们将把数据变换到伽马空间,让图片查看器能更准确地显示我们的图像。作为一种简单的近似,我们可以使用“gamma 2”作为变换,它是从伽马空间转换到线性空间时所用的幂次。我们需要从线性空间转换到伽马空间,也就是取“gamma 2”的逆变换,即指数为 $1/\mathit{gamma}$,也就是开平方根。我们还要确保能稳妥地处理负数输入。

**代码清单 57**:`color.h` 带伽马校正的 `write_color()`

```cpp {1-7,14-17}
inline double linear_to_gamma(double linear_component)
{
    if (linear_component > 0)
        return std::sqrt(linear_component);

    return 0;
}

void write_color(std::ostream& out, const color& pixel_color) {
    auto r = pixel_color.x();
    auto g = pixel_color.y();
    auto b = pixel_color.z();

    // Apply a linear to gamma transform for gamma 2
    r = linear_to_gamma(r);
    g = linear_to_gamma(g);
    b = linear_to_gamma(b);

    // Translate the [0,1] component values to the byte range [0,255].
    static const interval intensity(0.000, 0.999);
    int rbyte = int(256 * intensity.clamp(r));
    int gbyte = int(256 * intensity.clamp(g));
    int bbyte = int(256 * intensity.clamp(b));

    // Write out the pixel color components.
    out << rbyte << ' ' << gbyte << ' ' << bbyte << '\n';
}
```

使用了伽马校正之后,我们现在得到了从暗到亮更加均匀的渐变:

![图像 12:经过伽马校正后渲染器的亮度范围](/raytracing/rtiow/img-1.12-gamma-gamut.png)
