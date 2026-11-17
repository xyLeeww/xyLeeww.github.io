---
title: "6. 四边形(Quadrilaterals)"
order: 6
description: "加入第二种几何图元——四边形(平行四边形),推导光线与平面求交和平面坐标,并据此判断交点是否落在四边形内部"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#quadrilaterals"
sourceTitle: "Ray Tracing: The Next Week · Quadrilaterals"
license: "CC0 1.0"
---

在这个三本书组成的系列中,我们已经走完了一半多的路程,而一直以来唯一的几何图元(primitive)就是球体。现在是时候加入第二种图元了:四边形(quadrilateral)。

## 6.1 定义四边形

虽然我们把这个新图元命名为 `quad`,但严格来说它是一个平行四边形(parallelogram,对边相互平行),而不是一般意义上的四边形。出于我们的目的,我们用三个几何量来定义一个四边形(quad):

1. $\mathbf{Q}$,起始角点。
2. $\mathbf{u}$,表示第一条边的向量。$\mathbf{Q} + \mathbf{u}$ 给出与 $\mathbf{Q}$ 相邻的其中一个角点。
3. $\mathbf{v}$,表示第二条边的向量。$\mathbf{Q} + \mathbf{v}$ 给出与 $\mathbf{Q}$ 相邻的另一个角点。

四边形中与 $\mathbf{Q}$ 相对的那个角点由 $\mathbf{Q} + \mathbf{u} + \mathbf{v}$ 给出。尽管四边形本身是一个二维物体,这些值却都是三维的。例如,一个角点位于原点、沿 Z 方向延伸两个单位、沿 Y 方向延伸一个单位的四边形,其参数为 $\mathbf{Q} = (0,0,0), \mathbf{u} = (0,0,2), \text{and } \mathbf{v} = (0,1,0)$。

下图展示了四边形的各个组成部分。

![图 5:四边形的组成部分](/raytracing/tnw/fig-2.05-quad-def.jpg)

四边形是平的,所以如果它位于 XY、YZ 或 ZX 平面内,它的轴对齐包围盒在某一个维度上的厚度就会是零。这可能会给光线求交带来数值问题,不过我们可以通过给包围盒中尺寸为零的维度加上填充(padding)来解决。加填充是没问题的,因为我们并没有改变四边形本身的求交结果;我们只是扩大了它的包围盒,以消除出现数值问题的可能,而且包围盒本来就只是对实际形状的粗略近似。为了解决这个问题,我们插入一个很小的填充,确保新构造的 AABB 总是具有非零的体积:

**代码清单 48**:`aabb.h` 新增的 aabb::pad_to_minimums() 方法

```cpp {6-9,19,24-33}
...
class aabb {
  public:
    ...
    aabb(const interval& x, const interval& y, const interval& z)
      : x(x), y(y), z(z)
    {
        pad_to_minimums();
    }

    aabb(const point3& a, const point3& b) {
        // Treat the two points a and b as extrema for the bounding box, so we don't require a
        // particular minimum/maximum coordinate order.

        x = interval(std::fmin(a[0],b[0]), std::fmax(a[0],b[0]));
        y = interval(std::fmin(a[1],b[1]), std::fmax(a[1],b[1]));
        z = interval(std::fmin(a[2],b[2]), std::fmax(a[2],b[2]));

        pad_to_minimums();
    }
    ...
    static const aabb empty, universe;

  private:

    void pad_to_minimums() {
        // Adjust the AABB so that no side is narrower than some delta, padding if necessary.

        double delta = 0.0001;
        if (x.size() < delta) x = x.expand(delta);
        if (y.size() < delta) y = y.expand(delta);
        if (z.size() < delta) z = z.expand(delta);
    }
};
```

现在我们可以写出新的 `quad` 类的初稿了:

**代码清单 49**:`quad.h` 2D 四边形(平行四边形)类

```cpp
#ifndef QUAD_H
#define QUAD_H

#include "hittable.h"

class quad : public hittable {
  public:
    quad(const point3& Q, const vec3& u, const vec3& v, shared_ptr<material> mat)
      : Q(Q), u(u), v(v), mat(mat)
    {
        set_bounding_box();
    }

    virtual void set_bounding_box() {
        // Compute the bounding box of all four vertices.
        auto bbox_diagonal1 = aabb(Q, Q + u + v);
        auto bbox_diagonal2 = aabb(Q + u, Q + v);
        bbox = aabb(bbox_diagonal1, bbox_diagonal2);
    }

    aabb bounding_box() const override { return bbox; }

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        return false; // To be implemented
    }

  private:
    point3 Q;
    vec3 u, v;
    shared_ptr<material> mat;
    aabb bbox;
};

#endif
```

## 6.2 光线与平面求交

正如你在上一个代码清单中看到的,`quad::hit()` 还有待实现。和球体一样,我们需要判断给定的光线是否与该图元相交;如果相交,还要求出这次相交的各种属性(交点、法线、纹理坐标等等)。

光线与四边形的求交分三步来确定:

1. 找到包含该四边形的平面;
2. 求解光线与这个包含四边形的平面的交点;
3. 判断交点是否位于四边形内部。

我们先来解决中间这一步,即求解一般的光线与平面求交问题。

球体之所以通常是光线追踪教学中的第一个图元,是因为它的隐式方程让光线求交变得非常容易求解。和球体一样,平面也有隐式方程,我们可以利用它的隐式方程得出一个求解光线与平面交点的算法。事实上,光线与平面求交甚至比光线与球体求交还要*更容易*求解。

你可能已经知道平面的这个隐式方程了:

$$
Ax + By + Cz + D = 0
$$

其中 $A,B,C,D$ 只是一些常数,$x,y,z$ 是平面上任意一点 $(x,y,z)$ 的坐标值。因此,平面就是满足上述方程的所有点 $(x,y,z)$ 的集合。使用下面这种替代形式会让事情稍微简单一些:

$$
Ax + By + Cz = D
$$

(我们没有翻转 D 的符号,因为它只是某个常数,我们稍后会把它求出来。)

下面是理解这个方程的一种直观方式:给定一个垂直于法向量 $\mathbf{n} = (A,B,C)$ 的平面,以及位置向量 $\mathbf{v} = (x,y,z)$(也就是从原点指向平面上任意一点的向量),那么对于平面上的任意位置,我们都可以用点积来求出 $D$:

$$
\mathbf{n} \cdot \mathbf{v} = D
$$

这与上面给出的 $Ax + By + Cz = D$ 是等价的表述,只不过现在是用向量来表示。

现在来求它与某条光线 $\mathbf{R}(t) = \mathbf{P} + t\mathbf{d}$ 的交点。代入光线方程,我们得到

$$
\mathbf{n} \cdot ( \mathbf{P} + t \mathbf{d} ) = D
$$

求解 $t$:

$$
\mathbf{n} \cdot \mathbf{P} + \mathbf{n} \cdot t \mathbf{d}  = D
$$

$$
\mathbf{n} \cdot \mathbf{P} + t(\mathbf{n} \cdot \mathbf{d}) = D
$$

$$
t = \frac{D - \mathbf{n} \cdot \mathbf{P}}{\mathbf{n} \cdot \mathbf{d}}
$$

这样就得到了 $t$,把它代入光线方程就能求出交点。注意,如果光线与平面平行,分母 $\mathbf{n} \cdot \mathbf{d}$ 将为零。在这种情况下,我们可以立即判定光线没有命中平面。和其他图元一样,如果光线参数 $t$ 小于可接受的最小值,我们也判定为未命中。

好了,我们已经能求出光线与包含给定四边形的平面之间的交点了。事实上,我们可以用这种方法来测试*任何*平面图元,比如三角形和圆盘(稍后会详细介绍)。

## 6.3 找到包含给定四边形的平面

我们已经解决了上面的第二步:在已知平面方程的前提下求解光线与平面的交点。为此,我们还需要解决上面的第一步:求出包含该四边形的平面的方程。我们有四边形的参数 $\mathbf{Q}$、$\mathbf{u}$ 和 $\mathbf{v}$,想要得到由这三个值所定义的四边形所在平面的对应方程。

幸运的是,这非常简单。回忆一下,在方程 $Ax + By + Cz = D$ 中,$(A,B,C)$ 表示法向量。要得到它,我们只需对两条边向量 $\mathbf{u}$ 和 $\mathbf{v}$ 做叉积:

$$
\mathbf{n} = \operatorname{unit\_vector}(\mathbf{u} \times \mathbf{v})
$$

平面被定义为满足方程 $Ax + By + Cz = D$ 的所有点 $(x,y,z)$。我们知道 $\mathbf{Q}$ 位于平面上,这就足以求出 $D$ 了:

$$
\begin{align*}
D &= n_x Q_x + n_y Q_y + n_z Q_z \\
&= \mathbf{n} \cdot \mathbf{Q} \\
\end{align*}
$$

把平面相关的值加到 `quad` 类中:

**代码清单 50**:`quad.h` 缓存平面相关的值

```cpp {6-8,19-20}
class quad : public hittable {
  public:
    quad(const point3& Q, const vec3& u, const vec3& v, shared_ptr<material> mat)
      : Q(Q), u(u), v(v), mat(mat)
    {
        auto n = cross(u, v);
        normal = unit_vector(n);
        D = dot(normal, Q);

        set_bounding_box();
    }
    ...

  private:
    point3 Q;
    vec3 u, v;
    shared_ptr<material> mat;
    aabb bbox;
    vec3 normal;
    double D;
};
```

我们将使用 `normal` 和 `D` 这两个值来求出给定光线与包含该四边形的平面之间的交点。

作为过渡的一步,我们先实现 `hit()` 方法,让它处理包含四边形的无限大平面。

**代码清单 51**:`quad.h` 针对无限大平面的 hit() 方法

```cpp {5-23}
class quad : public hittable {
    ...

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        auto denom = dot(normal, r.direction());

        // No hit if the ray is parallel to the plane.
        if (std::fabs(denom) < 1e-8)
            return false;

        // Return false if the hit point parameter t is outside the ray interval.
        auto t = (D - dot(normal, r.origin())) / denom;
        if (!ray_t.contains(t))
            return false;

        auto intersection = r.at(t);

        rec.t = t;
        rec.p = intersection;
        rec.mat = mat;
        rec.set_face_normal(r, normal);

        return true;
    }

    ...
}
```

## 6.4 在平面上定位点

到这一步,交点位于包含四边形的平面上,但它可能在平面上的*任何*位置:光线与平面的交点既可能在四边形内部,也可能在外部。我们需要检测出位于四边形内部的交点(命中),并剔除位于外部的点(未命中)。为了确定一个点相对于四边形的位置,并为交点分配纹理坐标,我们需要在平面上对交点进行定位。

为此,我们要为平面构造一个*坐标系(coordinate frame)*——一种对平面上任意点进行定位的方式。我们其实一直在为 3D 空间使用一个坐标系——它由一个原点 $\mathbf{O}$ 和三个基向量 $\mathbf{x}$、$\mathbf{y}$、$\mathbf{z}$ 定义。

由于平面是一个 2D 结构,我们只需要一个平面原点 $\mathbf{Q}$ 和*两个*基向量:$\mathbf{u}$ 和 $\mathbf{v}$。通常情况下,坐标轴彼此垂直。然而,要张成整个空间并不需要这样——你只需要两条互不平行的轴就够了。

![图 6:光线与平面求交](/raytracing/tnw/fig-2.06-ray-plane.jpg)

以图 6 为例。光线 $\mathbf{R}$ 与平面相交,得到交点 $\mathbf{P}$(不要与前面的光线原点 $\mathbf{P}$ 混淆)。用平面向量 $\mathbf{u}$ 和 $\mathbf{v}$ 来度量,上例中的交点 $\mathbf{P}$ 位于 $\mathbf{Q} + (1)\mathbf{u} + (\frac{1}{2})\mathbf{v}$。换句话说,交点 $\mathbf{P}$ 的 $\mathbf{UV}$(平面)坐标是 $(1,\frac{1}{2})$。

一般来说,给定某个任意点 $\mathbf{P}$,我们要找到两个标量 $\alpha$ 和 $\beta$,使得

$$
\mathbf{P} = \mathbf{Q} + \alpha \mathbf{u} + \beta \mathbf{v}
$$

像变戏法一样,我直接给出结果:平面坐标 $\alpha$ 和 $\beta$ 由下面的方程给出:

$$
\alpha = \mathbf{w} \cdot (\mathbf{p} \times \mathbf{v})
$$
$$
\beta  = \mathbf{w} \cdot (\mathbf{u} \times \mathbf{p})
$$

其中

$$
\mathbf{p} = \mathbf{P} - \mathbf{Q}
$$
$$
\mathbf{w} = \frac{\mathbf{n}}{\mathbf{n} \cdot (\mathbf{u} \times \mathbf{v})}
= \frac{\mathbf{n}}{\mathbf{n} \cdot \mathbf{n}}
$$

对于给定的四边形,向量 $\mathbf{w}$ 是常量,所以我们把它缓存起来。

**代码清单 52**:`quad.h` 缓存四边形的 w 值

```cpp {9,19}
class quad : public hittable {
  public:
    quad(const point3& Q, const vec3& u, const vec3& v, shared_ptr<material> mat)
      : Q(Q), u(u), v(v), mat(mat)
    {
        auto n = cross(u, v);
        normal = unit_vector(n);
        D = dot(normal, Q);
        w = n / dot(n,n);

        set_bounding_box();
    }

    ...

  private:
    point3 Q;
    vec3 u, v;
    vec3 w;
    shared_ptr<material> mat;
    aabb bbox;
    vec3 normal;
    double D;
};
```

## 6.5 推导平面坐标

(本节介绍上述方程的推导过程。如果你不感兴趣,可以直接跳到下一节。)

请回头看图 6。如果能保证平面基向量 $\mathbf{u}$ 和 $\mathbf{v}$ 彼此正交(相互之间成 90° 角),那么求解 $\alpha$ 和 $\beta$ 就很简单了,只需用点积把 $\mathbf{P}$ 分别投影到基向量 $\mathbf{u}$ 和 $\mathbf{v}$ 上即可。然而,由于我们并不限制 $\mathbf{u}$ 和 $\mathbf{v}$ 必须正交,数学上就要稍微麻烦一些。

先做些准备,考虑

$$
\mathbf{P} = \mathbf{Q} + \alpha \mathbf{u} + \beta \mathbf{v}
$$

$$
\mathbf{p} = \mathbf{P} - \mathbf{Q} = \alpha \mathbf{u} + \beta \mathbf{v}
$$

这里,$\mathbf{P}$ 是交*点*,而 $\mathbf{p}$ 是从 $\mathbf{Q}$ 指向 $\mathbf{P}$ 的*向量*。

将 $\mathbf{p}$ 的方程分别与 $\mathbf{u}$ 和 $\mathbf{v}$ 做叉积:

$$
\begin{align*}
\mathbf{u} \times \mathbf{p} &= \mathbf{u} \times (\alpha \mathbf{u} + \beta \mathbf{v}) \\
&= \mathbf{u} \times \alpha \mathbf{u} + \mathbf{u} \times \beta \mathbf{v} \\
&= \alpha(\mathbf{u} \times \mathbf{u}) + \beta(\mathbf{u} \times \mathbf{v})
\end{align*}
$$

$$
\begin{align*}
\mathbf{v} \times \mathbf{p} &= \mathbf{v} \times (\alpha \mathbf{u} + \beta \mathbf{v}) \\
&= \mathbf{v} \times \alpha \mathbf{u} + \mathbf{v} \times \beta \mathbf{v} \\
&= \alpha(\mathbf{v} \times \mathbf{u}) + \beta(\mathbf{v} \times \mathbf{v})
\end{align*}
$$

由于任何向量与自身的叉积都为零,这两个方程可以化简为

$$
\mathbf{v} \times \mathbf{p} = \alpha(\mathbf{v} \times \mathbf{u})
$$
$$
\mathbf{u} \times \mathbf{p} = \beta(\mathbf{u} \times \mathbf{v})
$$

现在来求解系数 $\alpha$ 和 $\beta$。如果你刚接触向量数学,可能会想到除以 $\mathbf{u} \times \mathbf{v}$ 和 $\mathbf{v} \times \mathbf{u}$,但向量是不能做除数的。取而代之的是,我们可以把上面两个方程的两边都与平面法线 $\mathbf{n} = \mathbf{u} \times \mathbf{v}$ 做点积,从而把两边都化为标量,而标量是*可以*做除数的。

$$
\mathbf{n} \cdot (\mathbf{v} \times \mathbf{p})
= \mathbf{n} \cdot \alpha(\mathbf{v} \times \mathbf{u})
$$

$$
\mathbf{n} \cdot (\mathbf{u} \times \mathbf{p})
= \mathbf{n} \cdot \beta(\mathbf{u} \times \mathbf{v})
$$

现在,只需做一次除法就能把系数分离出来:

$$
\alpha = \frac{\mathbf{n} \cdot (\mathbf{v} \times \mathbf{p})}
{\mathbf{n} \cdot (\mathbf{v} \times \mathbf{u})}
$$

$$
\beta  = \frac{\mathbf{n} \cdot (\mathbf{u} \times \mathbf{p})}
{\mathbf{n} \cdot (\mathbf{u} \times \mathbf{v})}
$$

把 $\alpha$ 的分子和分母中的叉积都调换顺序(回忆一下 $\mathbf{a} \times \mathbf{b} = - \mathbf{b} \times \mathbf{a}$),就能让两个系数拥有相同的分母:

$$
\alpha = \frac{\mathbf{n} \cdot (\mathbf{p} \times \mathbf{v})}
{\mathbf{n} \cdot (\mathbf{u} \times \mathbf{v})}
$$

$$
\beta  = \frac{\mathbf{n} \cdot (\mathbf{u} \times \mathbf{p})}
{\mathbf{n} \cdot (\mathbf{u} \times \mathbf{v})}
$$

现在我们可以做最后一步化简:计算一个向量 $\mathbf{w}$,对于平面上的任意点 $\mathbf{P}$,它在该平面的基坐标系下都是常量:

$$
\mathbf{w} = \frac{\mathbf{n}}{\mathbf{n} \cdot (\mathbf{u} \times \mathbf{v})}
= \frac{\mathbf{n}}{\mathbf{n} \cdot \mathbf{n}}
$$

$$
\alpha = \mathbf{w} \cdot (\mathbf{p} \times \mathbf{v})
$$
$$
\beta  = \mathbf{w} \cdot (\mathbf{u} \times \mathbf{p})
$$

## 6.6 用 UV 坐标判断交点是否在内部

既然已经有了交点的平面坐标 $\alpha$ 和 $\beta$,我们就可以很容易地用它们来判断交点是否位于四边形内部——也就是说,判断光线是否真的命中了四边形。

平面被划分为如下的坐标区域:

![图 7:四边形坐标](/raytracing/tnw/fig-2.07-quad-coords.jpg)

因此,要判断平面坐标为 $(\alpha,\beta)$ 的点是否位于四边形内部,只需要满足以下条件:

1. $ 0 \leq \alpha \leq 1 $
2. $ 0 \leq \beta \leq 1 $

这就是实现四边形图元所需的最后一块拼图。

为了让这类实验更方便一些,我们把 $(\alpha,\beta)$ 内部测试的方法从 hit 方法中提取出来。

**代码清单 53**:`quad.h` 最终的 quad 类

```cpp {17,19-26,35-46}
class quad : public hittable {
  public:
    ...

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        auto denom = dot(normal, r.direction());

        // No hit if the ray is parallel to the plane.
        if (std::fabs(denom) < 1e-8)
            return false;

        // Return false if the hit point parameter t is outside the ray interval.
        auto t = (D - dot(normal, r.origin())) / denom;
        if (!ray_t.contains(t))
            return false;

        // Determine if the hit point lies within the planar shape using its plane coordinates.
        auto intersection = r.at(t);
        vec3 planar_hitpt_vector = intersection - Q;
        auto alpha = dot(w, cross(planar_hitpt_vector, v));
        auto beta = dot(w, cross(u, planar_hitpt_vector));

        if (!is_interior(alpha, beta, rec))
            return false;

        // Ray hits the 2D shape; set the rest of the hit record and return true.
        rec.t = t;
        rec.p = intersection;
        rec.mat = mat;
        rec.set_face_normal(r, normal);

        return true;
    }

    virtual bool is_interior(double a, double b, hit_record& rec) const {
        interval unit_interval = interval(0, 1);
        // Given the hit point in plane coordinates, return false if it is outside the
        // primitive, otherwise set the hit record UV coordinates and return true.

        if (!unit_interval.contains(a) || !unit_interval.contains(b))
            return false;

        rec.u = a;
        rec.v = b;
        return true;
    }

  private:
    point3 Q;
    vec3 u, v;
    vec3 w;
    shared_ptr<material> mat;
    aabb bbox;
    vec3 normal;
    double D;
};
```

现在我们添加一个新场景来展示新的 `quad` 图元:

**代码清单 54**:`main.cc` 包含四边形的新场景

```cpp {8,14-46,49,54}
#include "rtweekend.h"

#include "bvh.h"
#include "camera.h"
#include "hittable.h"
#include "hittable_list.h"
#include "material.h"
#include "quad.h"
#include "sphere.h"
#include "texture.h"

...

void quads() {
    hittable_list world;

    // Materials
    auto left_red     = make_shared<lambertian>(color(1.0, 0.2, 0.2));
    auto back_green   = make_shared<lambertian>(color(0.2, 1.0, 0.2));
    auto right_blue   = make_shared<lambertian>(color(0.2, 0.2, 1.0));
    auto upper_orange = make_shared<lambertian>(color(1.0, 0.5, 0.0));
    auto lower_teal   = make_shared<lambertian>(color(0.2, 0.8, 0.8));

    // Quads
    world.add(make_shared<quad>(point3(-3,-2, 5), vec3(0, 0,-4), vec3(0, 4, 0), left_red));
    world.add(make_shared<quad>(point3(-2,-2, 0), vec3(4, 0, 0), vec3(0, 4, 0), back_green));
    world.add(make_shared<quad>(point3( 3,-2, 1), vec3(0, 0, 4), vec3(0, 4, 0), right_blue));
    world.add(make_shared<quad>(point3(-2, 3, 1), vec3(4, 0, 0), vec3(0, 0, 4), upper_orange));
    world.add(make_shared<quad>(point3(-2,-3, 5), vec3(4, 0, 0), vec3(0, 0,-4), lower_teal));

    camera cam;

    cam.aspect_ratio      = 1.0;
    cam.image_width       = 400;
    cam.samples_per_pixel = 100;
    cam.max_depth         = 50;

    cam.vfov     = 80;
    cam.lookfrom = point3(0,0,9);
    cam.lookat   = point3(0,0,0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0;

    cam.render(world);
}

int main() {
    switch (5) {
        case 1:  bouncing_spheres();   break;
        case 2:  checkered_spheres();  break;
        case 3:  earth();              break;
        case 4:  perlin_spheres();     break;
        case 5:  quads();              break;
    }
}
```

![图像 16:四边形](/raytracing/tnw/img-2.16-quads.png)

## 6.7 其他 2D 图元

在这里稍作停顿,想一想:既然可以用 $(\alpha,\beta)$ 坐标来判断一个点是否位于四边形(平行四边形)内部,那么不难想象,同样可以用这套 2D 坐标来判断交点是否位于*任何*其他 2D(平面)图元的内部!

例如,假设我们把 `is_interior()` 函数改成在 `sqrt(a*a + b*b) < r` 时返回 true,这样就实现了半径为 `r` 的圆盘图元。对于三角形,可以试试 `a > 0 && b > 0 && a + b < 1`。

其他 2D 形状的可能性就留给读者作为练习,看你有多大的探索兴致了。你甚至可以根据纹理贴图的像素来制作镂空模板,或者做出一个曼德博集合(Mandelbrot)的形状!作为一个小彩蛋,可以去看看源代码仓库中的 `alternate-2D-primitives` 标签。那里的 `src/TheNextWeek/quad.h` 中有三角形、椭圆和圆环(annuli)的实现。
