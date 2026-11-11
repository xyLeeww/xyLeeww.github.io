---
title: "11. 电介质(Dielectrics)"
order: 11
description: "用斯涅尔定律实现折射,处理全内反射,加入 Schlick 近似,完成玻璃材质并渲染空心玻璃球。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#dielectrics"
sourceTitle: "Ray Tracing in One Weekend · Dielectrics"
license: "CC0 1.0"
---

水、玻璃、钻石这类透明材质都是电介质(dielectric)。当一条光线照射到它们上面时,会分裂成一条反射光线和一条折射(透射)光线。我们的处理方式是在反射和折射之间随机选择一种,每次相互作用只生成一条散射光线。

先快速回顾一下术语:*反射*(reflected)光线射到表面后,朝一个新的方向“弹”开。

*折射*(refracted)光线在从材质的周围环境进入材质本身时(比如进入玻璃或水中)会发生弯折。这就是为什么一支铅笔部分插入水中时看起来像是弯的。

折射光线弯折的程度由材质的*折射率*(refractive index)决定。一般来说,折射率是一个单独的数值,描述光从真空进入该材质时弯折的程度。玻璃的折射率大约在 1.5–1.7 之间,钻石约为 2.4,而空气的折射率很小,为 1.000293。

当一种透明材质嵌在另一种透明材质中时,可以用相对折射率来描述折射:即物体材质的折射率除以周围材质的折射率。例如,如果你想渲染一个位于水下的玻璃球,那么这个玻璃球的有效折射率就是 1.125,它等于玻璃的折射率(1.5)除以水的折射率(1.333)。

大多数常见材质的折射率,在网上简单搜一下就能找到。

## 11.1 折射

最难调试的部分是折射光线。我通常会先让所有光线在存在折射光线时都发生折射。在这个项目中,我试着在场景里放了两个玻璃球,得到了下面的结果(我还没告诉你怎么做是对的、怎么做是错的,不过马上就会讲到!):

![图像 15:初次尝试的玻璃](/raytracing/rtiow/img-1.15-glass-first.png)

这样对吗?现实生活中的玻璃球看起来确实挺怪的。但是不,这是不对的。世界应该是上下颠倒的,而且不应该有奇怪的黑色东西。我只是把穿过图像正中间的那条光线打印了出来,就明显看出它是错的。这种方法往往很管用。

## 11.2 斯涅尔定律

折射由斯涅尔定律(Snell's law)描述:

$$
\eta \cdot \sin\theta = \eta' \cdot \sin\theta'
$$

其中 $\theta$ 和 $\theta'$ 是与法线所成的角度,$\eta$ 和 $\eta'$(读作“eta”和“eta prime”)是折射率。几何关系如下:

![图 17:光线折射](/raytracing/rtiow/fig-1.17-refraction.jpg)

为了确定折射光线的方向,我们需要求解 $\sin\theta'$:

$$
\sin\theta' = \frac{\eta}{\eta'} \cdot \sin\theta
$$

在表面的折射一侧,有一条折射光线 $\mathbf{R'}$ 和一条法线 $\mathbf{n'}$,它们之间有一个夹角 $\theta'$。我们可以把 $\mathbf{R'}$ 分解为垂直于 $\mathbf{n'}$ 的部分和平行于 $\mathbf{n'}$ 的部分:

$$
\mathbf{R'} = \mathbf{R'}_{\bot} + \mathbf{R'}_{\parallel}
$$

如果求解 $\mathbf{R'}_{\bot}$ 和 $\mathbf{R'}_{\parallel}$,可以得到:

$$
\mathbf{R'}_{\bot} = \frac{\eta}{\eta'} (\mathbf{R} + |\mathbf{R}| \cos(\theta) \mathbf{n})
$$

$$
\mathbf{R'}_{\parallel} = -\sqrt{1 - |\mathbf{R'}_{\bot}|^2} \mathbf{n}
$$

如果你愿意,可以自己去证明一下,不过我们会把它当作事实直接往下讲。本书的其余部分并不需要你理解这个证明。

除了 $\cos\theta$ 之外,我们知道等号右边每一项的值。众所周知,两个向量的点积可以用它们之间夹角的余弦来表示:

$$
\mathbf{a} \cdot \mathbf{b} = |\mathbf{a}| |\mathbf{b}| \cos\theta
$$

如果我们限定 $\mathbf{a}$ 和 $\mathbf{b}$ 都是单位向量:

$$
\mathbf{a} \cdot \mathbf{b} = \cos\theta
$$

现在就可以用已知量来改写 $\mathbf{R'}_{\bot}$:

$$
\mathbf{R'}_{\bot} =
   \frac{\eta}{\eta'} (\mathbf{R} + (\mathbf{-R} \cdot \mathbf{n}) \mathbf{n})
$$

把两部分重新组合起来,就可以写出一个计算 $\mathbf{R'}$ 的函数:

**代码清单 71**:`vec3.h` 折射函数

```cpp {8-13}
...

inline vec3 reflect(const vec3& v, const vec3& n) {
    return v - 2*dot(v,n)*n;
}


inline vec3 refract(const vec3& uv, const vec3& n, double etai_over_etat) {
    auto cos_theta = std::fmin(dot(-uv, n), 1.0);
    vec3 r_out_perp =  etai_over_etat * (uv + cos_theta*n);
    vec3 r_out_parallel = -std::sqrt(std::fabs(1.0 - r_out_perp.length_squared())) * n;
    return r_out_perp + r_out_parallel;
}
```

而总是发生折射的电介质材质如下:

**代码清单 72**:`material.h` 总是发生折射的电介质材质类

```cpp {8-28}
...

class metal : public material {
    ...
};


class dielectric : public material {
  public:
    dielectric(double refraction_index) : refraction_index(refraction_index) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        attenuation = color(1.0, 1.0, 1.0);
        double ri = rec.front_face ? (1.0/refraction_index) : refraction_index;

        vec3 unit_direction = unit_vector(r_in.direction());
        vec3 refracted = refract(unit_direction, rec.normal, ri);

        scattered = ray(rec.p, refracted);
        return true;
    }

  private:
    // Refractive index in vacuum or air, or the ratio of the material's refractive index over
    // the refractive index of the enclosing media
    double refraction_index;
};
```

现在我们更新场景来演示折射:把左边的球改成玻璃,其折射率约为 1.5。

**代码清单 73**:`main.cc` 把左边的球改成玻璃

```cpp {3}
auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
auto material_center = make_shared<lambertian>(color(0.1, 0.2, 0.5));
auto material_left   = make_shared<dielectric>(1.50);
auto material_right  = make_shared<metal>(color(0.8, 0.6, 0.2), 1.0);
```

得到的结果如下:

![图像 16:总是发生折射的玻璃球](/raytracing/rtiow/img-1.16-glass-always-refract.png)

## 11.3 全内反射

折射在实践中有一个麻烦的问题:对于某些入射角度,斯涅尔定律无解。当光线以足够小的掠射角进入折射率更低的介质时,折射角可能会大于 90°。我们回顾一下斯涅尔定律以及 $\sin\theta'$ 的推导:

$$
\sin\theta' = \frac{\eta}{\eta'} \cdot \sin\theta
$$

如果光线位于玻璃内部,而外面是空气($\eta = 1.5$,$\eta' = 1.0$):

$$
\sin\theta' = \frac{1.5}{1.0} \cdot \sin\theta
$$

$\sin\theta'$ 的值不可能大于 1。所以,如果

$$
\frac{1.5}{1.0} \cdot \sin\theta > 1.0
$$

等式两边就无法相等,方程无解。如果无解,玻璃就无法折射,因此必须反射这条光线:

**代码清单 74**:`material.h` 判断光线能否折射

```cpp
if (ri * sin_theta > 1.0) {
    // Must Reflect
    ...
} else {
    // Can Refract
    ...
}
```

此时所有的光都被反射了,又因为在实际中这种情况通常发生在实心物体内部,所以称为*全内反射*(total internal reflection)。这就是为什么当你潜在水下时,水与空气的分界面有时会像一面完美的镜子——如果你在水下向上看,可以看到水面以上的东西;但当你靠近水面、朝侧面看时,水面看起来就像一面镜子。

我们可以利用下面的三角恒等式求出 `sin_theta`:

$$
\sin\theta  = \sqrt{1 - \cos^2\theta}
$$

以及

$$
\cos\theta = \mathbf{R} \cdot \mathbf{n}
$$

**代码清单 75**:`material.h` 判断光线能否折射

```cpp
double cos_theta = std::fmin(dot(-unit_direction, rec.normal), 1.0);
double sin_theta = std::sqrt(1.0 - cos_theta*cos_theta);

if (ri * sin_theta > 1.0) {
    // Must Reflect
    ...
} else {
    // Can Refract
    ...
}
```

而(在可能时)总是发生折射的电介质材质如下:

**代码清单 76**:`material.h` 带反射的电介质材质类

```cpp {11-22}
class dielectric : public material {
  public:
    dielectric(double refraction_index) : refraction_index(refraction_index) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        attenuation = color(1.0, 1.0, 1.0);
        double ri = rec.front_face ? (1.0/refraction_index) : refraction_index;

        vec3 unit_direction = unit_vector(r_in.direction());
        double cos_theta = std::fmin(dot(-unit_direction, rec.normal), 1.0);
        double sin_theta = std::sqrt(1.0 - cos_theta*cos_theta);

        bool cannot_refract = ri * sin_theta > 1.0;
        vec3 direction;

        if (cannot_refract)
            direction = reflect(unit_direction, rec.normal);
        else
            direction = refract(unit_direction, rec.normal, ri);

        scattered = ray(rec.p, direction);
        return true;
    }

  private:
    // Refractive index in vacuum or air, or the ratio of the material's refractive index over
    // the refractive index of the enclosing media
    double refraction_index;
};
```

衰减始终为 1——玻璃表面不吸收任何光。

如果我们用新的 `dielectric::scatter()` 函数渲染之前的场景,会发现……没有任何变化。咦?

原来,对于一个折射率大于空气的材质构成的球体,不存在任何能产生全内反射的入射角——无论是在光线进入球体的位置,还是在光线离开的位置。这是由球体的几何形状决定的:一条掠射进入的光线总会被弯折到一个更小的角度,然后在离开时再被弯折回原来的角度。

那么,该如何演示全内反射呢?如果球体的折射率*小于*它所处的介质,我们就可以用很浅的掠射角射中它,得到全*外*反射。这应该足以观察到这一效果了。

我们将构建一个充满水(折射率约为 1.33)的世界,并把球体材质改成空气(折射率 1.00)——也就是一个气泡!为此,把左边球体材质的折射率改为

$$
\frac{\text{index of refraction of air}}{\text{index of refraction of water}}
$$

> **译注**:即“空气的折射率 / 水的折射率”,也就是代码中的 `1.00 / 1.33`。

**代码清单 77**:`main.cc` 左边的球是水中的气泡

```cpp {3}
auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
auto material_center = make_shared<lambertian>(color(0.1, 0.2, 0.5));
auto material_left   = make_shared<dielectric>(1.00 / 1.33);
auto material_right  = make_shared<metal>(color(0.8, 0.6, 0.2), 1.0);
```

这一改动得到如下渲染结果:

![图像 17:气泡有时折射,有时反射](/raytracing/rtiow/img-1.17-air-bubble-total-reflection.png)

可以看到,大致正对的光线发生折射,而掠射的光线发生反射。

## 11.4 Schlick 近似

真实的玻璃,其反射率会随角度变化——以很陡的角度看一扇窗户,它就变成了一面镜子。描述这一现象的方程又大又丑,但几乎所有人都使用 Christophe Schlick 提出的一个计算代价低、而且出奇精确的多项式近似,即 Schlick 近似(Schlick approximation)。这样就得到了我们完整的玻璃材质:

**代码清单 78**:`material.h` 完整的玻璃材质

```cpp {18,33-38}
class dielectric : public material {
  public:
    dielectric(double refraction_index) : refraction_index(refraction_index) {}

    bool scatter(const ray& r_in, const hit_record& rec, color& attenuation, ray& scattered)
    const override {
        attenuation = color(1.0, 1.0, 1.0);
        double ri = rec.front_face ? (1.0/refraction_index) : refraction_index;

        vec3 unit_direction = unit_vector(r_in.direction());
        double cos_theta = std::fmin(dot(-unit_direction, rec.normal), 1.0);
        double sin_theta = std::sqrt(1.0 - cos_theta*cos_theta);

        bool cannot_refract = ri * sin_theta > 1.0;
        vec3 direction;


        if (cannot_refract || reflectance(cos_theta, ri) > random_double())
            direction = reflect(unit_direction, rec.normal);
        else
            direction = refract(unit_direction, rec.normal, ri);

        scattered = ray(rec.p, direction);
        return true;
    }

  private:
    // Refractive index in vacuum or air, or the ratio of the material's refractive index over
    // the refractive index of the enclosing media
    double refraction_index;


    static double reflectance(double cosine, double refraction_index) {
        // Use Schlick's approximation for reflectance.
        auto r0 = (1 - refraction_index) / (1 + refraction_index);
        r0 = r0*r0;
        return r0 + (1-r0)*std::pow((1 - cosine),5);
    }
};
```

## 11.5 空心玻璃球的建模

下面我们来构建一个空心玻璃球。它是一个有一定厚度的球,内部还有另一个由空气构成的球。设想一条光线穿过这样一个物体的路径:它会射中外球,发生折射,接着射中内球(假设确实射中了),第二次折射,然后在内部的空气中传播。之后它继续前进,射中内球的内表面,折射回去,再射中外球的内表面,最后折射并离开,回到场景的大气中。

外球就用一个标准的玻璃球来建模,折射率约为 1.50(模拟从外部空气进入玻璃的折射)。内球稍有不同,因为*它*的折射率应当是相对于包围它的外球材质而言的,以此模拟从玻璃进入内部空气的过渡。

这其实很容易设定,因为电介质材质的 `refraction_index` 参数可以理解为物体折射率与其所处介质折射率之*比*。在本例中,内球的折射率应当是空气的折射率(内球材质)除以玻璃的折射率(包围它的介质),即 $1.00/1.50 = 0.67$。

代码如下:

**代码清单 79**:`main.cc` 带有空心玻璃球的场景

```cpp {4-5,11}
...
auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
auto material_center = make_shared<lambertian>(color(0.1, 0.2, 0.5));
auto material_left   = make_shared<dielectric>(1.50);
auto material_bubble = make_shared<dielectric>(1.00 / 1.50);
auto material_right  = make_shared<metal>(color(0.8, 0.6, 0.2), 0.0);

world.add(make_shared<sphere>(point3( 0.0, -100.5, -1.0), 100.0, material_ground));
world.add(make_shared<sphere>(point3( 0.0,    0.0, -1.2),   0.5, material_center));
world.add(make_shared<sphere>(point3(-1.0,    0.0, -1.0),   0.5, material_left));
world.add(make_shared<sphere>(point3(-1.0,    0.0, -1.0),   0.4, material_bubble));
world.add(make_shared<sphere>(point3( 1.0,    0.0, -1.0),   0.5, material_right));
...
```

结果如下:

![图像 18:空心玻璃球](/raytracing/rtiow/img-1.18-glass-hollow.png)
