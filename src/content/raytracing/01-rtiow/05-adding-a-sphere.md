---
title: "5. 添加球体(Adding a Sphere)"
order: 5
description: "推导光线与球体相交的二次方程,并渲染出第一个红色球体"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#addingasphere"
sourceTitle: "Ray Tracing in One Weekend · Adding a Sphere"
license: "CC0 1.0"
---

我们来给光线追踪器添加一个物体。人们在光线追踪器中经常使用球体,因为计算一条光线是否命中(hit)球体相对简单。

## 5.1 光线与球体相交

以原点为球心、半径为 $r$ 的球体方程,是一个重要的数学方程:

$$
x^2 + y^2 + z^2 = r^2
$$

你也可以这样理解:如果给定点 $(x,y,z)$ 在球面上,那么 $x^2 + y^2 + z^2 = r^2$。如果给定点 $(x,y,z)$ 在球体 _内部_,那么 $x^2 + y^2 + z^2 < r^2$;如果给定点 $(x,y,z)$ 在球体 _外部_,那么 $x^2 + y^2 + z^2 > r^2$。

如果我们想让球心位于任意点 $(C_x, C_y, C_z)$,方程就会变得难看很多:

$$
(C_x - x)^2 + (C_y - y)^2 + (C_z - z)^2 = r^2
$$

在图形学中,你几乎总是希望公式用向量来表达,这样所有 $x$/$y$/$z$ 的东西都可以简单地用一个 `vec3` 类来表示。你可能会注意到,从点 $\mathbf{P} = (x,y,z)$ 指向球心 $\mathbf{C} = (C_x, C_y, C_z)$ 的向量是 $(\mathbf{C} - \mathbf{P})$。

如果使用点积的定义:

$$
(\mathbf{C} - \mathbf{P}) \cdot (\mathbf{C} - \mathbf{P})
   = (C_x - x)^2 + (C_y - y)^2 + (C_z - z)^2
$$

那么就可以把球体方程改写成向量形式:

$$
(\mathbf{C} - \mathbf{P}) \cdot (\mathbf{C} - \mathbf{P}) = r^2
$$

我们可以把它读作“任何满足这个方程的点 $\mathbf{P}$ 都在球面上”。我们想知道光线 $\mathbf{P}(t) = \mathbf{Q} + t\mathbf{d}$ 是否会在某处命中球体。如果它确实命中了球体,那么必然存在某个 $t$,使得 $\mathbf{P}(t)$ 满足球体方程。所以我们要寻找使下式成立的任意 $t$:

$$
(\mathbf{C} - \mathbf{P}(t)) \cdot (\mathbf{C} - \mathbf{P}(t)) = r^2
$$

把 $\mathbf{P}(t)$ 替换为它的展开形式,就可以求出 $t$:

$$
(\mathbf{C} - (\mathbf{Q} + t \mathbf{d}))
    \cdot (\mathbf{C} - (\mathbf{Q} + t \mathbf{d})) = r^2
$$

左边是三个向量,与右边的三个向量做点积。如果完整地展开点积,我们会得到九个向量。你当然可以一项一项全部写出来,但我们不必那么费劲。还记得吗,我们要求解的是 $t$,所以我们根据是否含有 $t$ 把各项分开:

$$
(-t \mathbf{d} + (\mathbf{C} - \mathbf{Q})) \cdot (-t \mathbf{d} + (\mathbf{C} - \mathbf{Q}))
   = r^2
$$

现在按照向量代数的规则把点积分配展开:

$$
t^2 \mathbf{d} \cdot \mathbf{d}
   - 2t \mathbf{d} \cdot (\mathbf{C} - \mathbf{Q})
   + (\mathbf{C} - \mathbf{Q}) \cdot (\mathbf{C} - \mathbf{Q}) = r^2
$$

把半径的平方移到左边:

$$
t^2 \mathbf{d} \cdot \mathbf{d}
   - 2t \mathbf{d} \cdot (\mathbf{C} - \mathbf{Q})
   + (\mathbf{C} - \mathbf{Q}) \cdot (\mathbf{C} - \mathbf{Q}) - r^2 = 0
$$

很难一眼看出这个方程到底是什么,但方程中的向量和 $r$ 都是已知的常量。而且,我们仅有的这些向量都通过点积化成了标量。唯一的未知数是 $t$,并且出现了 $t^2$,这意味着这是一个二次方程。对于二次方程 $ax^2 + bx + c = 0$,可以用求根公式求解:

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

因此,在光线-球体相交方程中求解 $t$ 时,$a$、$b$ 和 $c$ 的值为:

$$
a = \mathbf{d} \cdot \mathbf{d}
$$

$$
b = -2 \mathbf{d} \cdot (\mathbf{C} - \mathbf{Q})
$$

$$
c = (\mathbf{C} - \mathbf{Q}) \cdot (\mathbf{C} - \mathbf{Q}) - r^2
$$

利用以上所有内容就可以解出 $t$,但其中的平方根部分可能为正(意味着有两个实数解)、为负(意味着没有实数解)或为零(意味着有一个实数解)。在图形学中,代数几乎总是与几何直接对应。我们得到的情况是:

![图 5:光线与球体相交的几种结果](/raytracing/rtiow/fig-1.05-ray-sphere.jpg)

## 5.2 创建第一张光线追踪图像

如果我们把这些数学硬编码到程序中,就可以测试代码:在 z 轴上 -1 的位置放一个小球,然后把所有与它相交的像素涂成红色。

**代码清单 11**:`main.cc` 渲染一个红色球体

```cpp {1-8,11-12}
bool hit_sphere(const point3& center, double radius, const ray& r) {
    vec3 oc = center - r.origin();
    auto a = dot(r.direction(), r.direction());
    auto b = -2.0 * dot(r.direction(), oc);
    auto c = dot(oc, oc) - radius*radius;
    auto discriminant = b*b - 4*a*c;
    return (discriminant >= 0);
}

color ray_color(const ray& r) {
    if (hit_sphere(point3(0,0,-1), 0.5, r))
        return color(1, 0, 0);

    vec3 unit_direction = unit_vector(r.direction());
    auto a = 0.5*(unit_direction.y() + 1.0);
    return (1.0-a)*color(1.0, 1.0, 1.0) + a*color(0.5, 0.7, 1.0);
}
```

我们得到的结果是这样的:

![图像 3:一个简单的红色球体](/raytracing/rtiow/img-1.03-red-sphere.png)

现在它还缺少各种东西——比如着色、反射光线,以及多于一个的物体——但我们离完成一半已经比离起点更近了!需要注意的一点是,我们是通过求解二次方程、看是否存在解来测试光线是否与球体相交的,但 $t$ 为负值的解也同样能通过测试。如果你把球心改到 $z = +1$,会得到完全相同的图像,因为这个解法无法区分 _相机前方_ 的物体和 _相机后方_ 的物体。这可不是什么特性!接下来我们会修复这些问题。
