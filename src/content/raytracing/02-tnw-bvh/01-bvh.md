---
title: "包围体层次结构(Bounding Volume Hierarchies)"
order: 1
description: "用轴对齐包围盒和包围体层次结构(BVH)把光线与物体求交从线性搜索加速到亚线性搜索"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#boundingvolumehierarchies"
sourceTitle: "Ray Tracing: The Next Week · Bounding Volume Hierarchies"
license: "CC0 1.0"
---

> **译注**:本页是系列第二本书《Ray Tracing: The Next Week》的第 3 章。它建立在《Ray Tracing in One Weekend》的代码之上(中文译文见 [/raytracing/01-rtiow/01-overview/](/raytracing/01-rtiow/01-overview/)),并且用到了本书第 2 章“运动模糊(Motion Blur)”中加入的代码(该章未翻译,见[原文](https://raytracing.github.io/books/RayTracingTheNextWeek.html#motionblur)),因此文中出现的 `time`、运动中的球体、`ray center` 等内容都来自那一章。原书用高亮标出每个代码清单中新增或修改的行,这里无法显示高亮,请结合正文对照阅读。

这一部分是到目前为止,我们正在编写的光线追踪器(ray tracer)中最难、最复杂的部分。我之所以把它放在这一章,一是为了让代码运行得更快,二是因为它会对 `hittable` 做一点重构,这样以后我加入矩形和长方体时,就不必再回头重构它们了。

光线与物体的求交是光线追踪器中主要的时间瓶颈,而运行时间与物体数量成线性关系。但由于这是在同一个场景上反复进行的搜索,我们应该能本着二分查找的思路,把它变成对数级的搜索。因为我们要向同一个场景发射数百万到数十亿条光线,所以可以先对场景中的物体进行排序,之后每次光线求交都可以是一次亚线性的搜索。最常见的两种排序方法是:1)划分空间;2)划分物体。后者通常更容易编写,而且对大多数模型来说运行速度也一样快。

## 3.1 核心思想

为一组图元创建包围体(bounding volume)的核心思想,是找到一个能完全包住(包围)所有物体的体积。例如,假设你计算出了一个包围 10 个物体的球体。任何没有命中这个包围球的光线,一定也不会命中其中的十个物体。如果光线命中了包围球,那么它可能会命中这十个物体中的某一个。所以包围相关的代码总是如下形式:

```text
if (ray hits bounding object)
    return whether ray hits bounded objects
else
    return false
```

注意,我们会用这些包围体把场景中的物体分组为若干子组。我们*并不是*在划分屏幕或场景空间。我们希望任何一个物体只属于一个包围体,不过包围体之间可以相互重叠。

## 3.2 包围体的层次结构

为了做到亚线性,我们需要让包围体形成层次结构。例如,如果我们把一组物体分成红、蓝两组,并使用矩形包围体,就会得到:

![图 1:包围体层次结构](/raytracing/tnw/fig-2.01-bvol-hierarchy.jpg)

注意,蓝色和红色包围体都包含在紫色包围体之内,但它们可能相互重叠,而且它们之间没有顺序——它们只是都在紫色包围体里面而已。所以右侧所示的树,其左右子节点之间并没有顺序的概念;它们只是位于父节点之内。对应的代码是:

```text
if (hits purple)
    hit0 = hits blue enclosed objects
    hit1 = hits red enclosed objects
    if (hit0 or hit1)
        return true and info of closer hit
return false
```

## 3.3 轴对齐包围盒(AABB)

为了让这一切正常工作,我们需要一种做出好的划分(而不是坏的划分)的方法,以及一种让光线与包围体求交的方法。光线与包围体的求交必须要快,而且包围体需要相当紧凑。在实践中,对大多数模型而言,轴对齐的盒子比其他方案(例如上面提到的球形包围体)效果更好,但如果你遇到其他类型的包围模型,也要始终记得这是一个可以权衡的设计选择。

从现在起,我们把轴对齐的包围长方体(axis-aligned bounding rectangular parallelepiped,严格来说确实应该这样称呼)叫作*轴对齐包围盒(axis-aligned bounding box)*,简称 AABB。(在代码中,你还会遇到 “bbox” 这个缩写,意思是 “bounding box”。)你想用任何方法来求光线与 AABB 的交都可以。而且我们只需要知道是否命中了它;我们不需要交点、法线,也不需要任何显示该物体时才用到的信息。

大多数人使用“平板(slab)”方法。它基于这样一个观察:一个 n 维 AABB 就是 $n$ 个轴对齐区间的交集,这些区间通常被称为“平板(slab)”。回忆一下,区间(interval)就是两个端点之间的所有点,例如满足 $3 \leq x \leq 5$ 的 $x$,或者更简洁地写成 $x$ 属于 $[3,5]$。在 2D 中,一个 AABB(即一个矩形)由两个区间的重叠部分定义:

![图 2:2D 轴对齐包围盒](/raytracing/tnw/fig-2.02-2d-aabb.jpg)

要判断一条光线是否命中某个区间,我们首先要弄清楚光线是否命中区间的边界。例如在 1D 中,光线与两个平面求交,会得到光线参数 $t_0$ 和 $t_1$。(如果光线与平面平行,那么它与任何一个平面的交点都是未定义的。)

![图 3:光线与平板求交](/raytracing/tnw/fig-2.03-ray-slab.jpg)

如何求光线与平面的交点呢?回忆一下,光线就是由一个函数定义的——给定参数 $t$,它返回一个位置 $\mathbf{P}(t)$:

$$
\mathbf{P}(t) = \mathbf{Q} + t \mathbf{d}
$$

这个方程对 x/y/z 三个坐标都适用。例如,$x(t) = Q_x + t d_x$。这条光线在满足下面方程的参数 $t$ 处命中平面 $x = x_0$:

$$
x_0 = Q_x + t_0 d_x
$$

所以交点处的 $t$ 为

$$
t_0 = \frac{x_0 - Q_x}{d_x}
$$

对于 $x_1$ 我们也得到类似的表达式:

$$
t_1 = \frac{x_1 - Q_x}{d_x}
$$

把这种 1D 数学推广为 2D 或 3D 命中测试的关键观察是:如果一条光线与由所有平面对所围成的盒子相交,那么所有的 $t$ 区间都会重叠。例如在 2D 中,只有当光线与所围成的盒子相交时,绿色区间和蓝色区间才会重叠:

![图 4:光线与平板的 t 区间重叠](/raytracing/tnw/fig-2.04-ray-slab-interval.jpg)

在这张图中,上面那条光线的区间没有重叠,所以我们知道这条光线*没有*命中由绿色和蓝色平面围成的 2D 盒子。下面那条光线的区间*确实*重叠了,所以我们知道下面那条光线*确实*命中了这个盒子。

## 3.4 光线与 AABB 求交

下面的伪代码用于判断各个平板中的 $t$ 区间是否重叠:

```text
interval_x ← compute_intersection_x (ray, x0, x1)
interval_y ← compute_intersection_y (ray, y0, y1)
return overlaps(interval_x, interval_y)
```

这真是简单得惊人,而且 3D 版本只是上面代码的简单扩展,这正是人们喜爱平板方法的原因:

```text
interval_x ← compute_intersection_x (ray, x0, x1)
interval_y ← compute_intersection_y (ray, y0, y1)
interval_z ← compute_intersection_z (ray, z0, z1)
return overlaps(interval_x, interval_y, interval_z)
```

不过有一些需要注意的地方,让它不像乍看起来那么漂亮。再来看一下 $t_0$ 和 $t_1$ 的 1D 方程:

$$
t_0 = \frac{x_0 - Q_x}{d_x}
$$

$$
t_1 = \frac{x_1 - Q_x}{d_x}
$$

首先,假设光线沿 $\mathbf{x}$ 的负方向传播。上面算出的区间 $(t_{x0}, t_{x1})$ 可能是反过来的,比如 $(7, 3)$。其次,分母 $d_x$ 可能为零,从而得到无穷大的值。而如果光线原点恰好位于某个平板的边界上,我们可能会得到 `NaN`,因为此时分子和分母都可能为零。另外,在使用 IEEE 浮点数时,零还带有 ± 符号。

对于 $d_x = 0$ 的情况,好消息是:如果原点不在 $x_0$ 和 $x_1$ 之间,那么 $t_{x0}$ 和 $t_{x1}$ 将会相等:都是 +∞ 或都是 -∞。所以,使用 min 和 max 应该就能得到正确的结果:

$$
t_{x0} = \min\left(\frac{x_0 - Q_x}{d_x}, \frac{x_1 - Q_x}{d_x}\right)
$$

$$
t_{x1} = \max\left(\frac{x_0 - Q_x}{d_x}, \frac{x_1 - Q_x}{d_x}\right)
$$

这样做之后,剩下的麻烦情况是 $d_x = 0$ 并且 $x_0 - Q_x = 0$ 或 $x_1 - Q_x = 0$,此时我们会得到 `NaN`。在这种情况下,我们可以随意地把它解释为命中或未命中,不过我们稍后还会再讨论这个问题。

现在来看一下伪函数 `overlaps`。假设我们可以认定区间没有反向,并且希望在区间重叠时返回 true。布尔函数 `overlaps()` 计算 $t$ 区间 `t_interval1` 和 `t_interval2` 的重叠部分,并据此判断该重叠部分是否非空:

```text
bool overlaps(t_interval1, t_interval2)
    t_min ← max(t_interval1.min, t_interval2.min)
    t_max ← min(t_interval1.max, t_interval2.max)
    return t_min < t_max
```

如果其中出现了任何 `NaN`,比较运算都会返回 false。所以如果我们在意擦边(grazing)的情况,就需要确保包围盒带有一点填充(padding)。(而我们大概*应该*在意,因为在光线追踪器中,所有情况最终都会出现。)

为此,我们先给 `interval` 添加一个新函数 `expand`,它按给定的量对区间进行填充(扩展):

**代码清单 7**:`interval.h` `interval::expand()` 方法

```cpp
class interval {
  public:
    ...
    double clamp(double x) const {
        if (x < min) return min;
        if (x > max) return max;
        return x;
    }

    interval expand(double delta) const {
        auto padding = delta/2;
        return interval(min - padding, max + padding);
    }

    static const interval empty, universe;
};
```

现在,我们已经具备了实现新的 AABB 类所需的一切。

**代码清单 8**:`aabb.h` 轴对齐包围盒类

```cpp
#ifndef AABB_H
#define AABB_H

class aabb {
  public:
    interval x, y, z;

    aabb() {} // The default AABB is empty, since intervals are empty by default.

    aabb(const interval& x, const interval& y, const interval& z)
      : x(x), y(y), z(z) {}

    aabb(const point3& a, const point3& b) {
        // Treat the two points a and b as extrema for the bounding box, so we don't require a
        // particular minimum/maximum coordinate order.

        x = (a[0] <= b[0]) ? interval(a[0], b[0]) : interval(b[0], a[0]);
        y = (a[1] <= b[1]) ? interval(a[1], b[1]) : interval(b[1], a[1]);
        z = (a[2] <= b[2]) ? interval(a[2], b[2]) : interval(b[2], a[2]);
    }

    const interval& axis_interval(int n) const {
        if (n == 1) return y;
        if (n == 2) return z;
        return x;
    }

    bool hit(const ray& r, interval ray_t) const {
        const point3& ray_orig = r.origin();
        const vec3&   ray_dir  = r.direction();

        for (int axis = 0; axis < 3; axis++) {
            const interval& ax = axis_interval(axis);
            const double adinv = 1.0 / ray_dir[axis];

            auto t0 = (ax.min - ray_orig[axis]) * adinv;
            auto t1 = (ax.max - ray_orig[axis]) * adinv;

            if (t0 < t1) {
                if (t0 > ray_t.min) ray_t.min = t0;
                if (t1 < ray_t.max) ray_t.max = t1;
            } else {
                if (t1 > ray_t.min) ray_t.min = t1;
                if (t0 < ray_t.max) ray_t.max = t0;
            }

            if (ray_t.max <= ray_t.min)
                return false;
        }
        return true;
    }
};

#endif
```

## 3.5 为可命中物体构造包围盒

现在我们需要添加一个函数,用来计算所有可命中物体(hittable)的包围盒。然后我们会在所有图元之上建立一个盒子的层次结构,而各个单独的图元——比如球体——将位于叶子节点上。

回忆一下,不带参数构造的 `interval` 值默认是空的。由于一个 `aabb` 对象在三个维度上各有一个区间,所以这些区间默认都是空的,因此 `aabb` 对象默认也是空的。这样一来,有些物体的包围体可能是空的。例如,考虑一个没有任何子物体的 `hittable_list` 对象。幸运的是,按照我们设计 interval 类的方式,所有数学运算都能正确处理这种情况。

最后,回忆一下,有些物体可能是运动的。这样的物体应该返回它在整个运动范围内(从 time=0 到 time=1)的包围盒。

**代码清单 9**:`hittable.h` 带包围盒的 hittable 类

```cpp
#include "aabb.h"

class material;

...

class hittable {
  public:
    virtual ~hittable() = default;

    virtual bool hit(const ray& r, interval ray_t, hit_record& rec) const = 0;

    virtual aabb bounding_box() const = 0;
};
```

对于静止的球体,`bounding_box` 函数很简单:

**代码清单 10**:`sphere.h` 带包围盒的球体

```cpp
class sphere : public hittable {
  public:
    // Stationary Sphere
    sphere(const point3& static_center, double radius, shared_ptr<material> mat)
      : center(static_center, vec3(0,0,0)), radius(std::fmax(0,radius)), mat(mat)
    {
        auto rvec = vec3(radius, radius, radius);
        bbox = aabb(static_center - rvec, static_center + rvec);
    }

    ...

    aabb bounding_box() const override { return bbox; }

  private:
    ray center;
    double radius;
    shared_ptr<material> mat;
    aabb bbox;

    ...
};
```

对于运动的球体,我们需要的是它整个运动范围的包围盒。为此,我们可以取球体在 time=0 时的包围盒和在 time=1 时的包围盒,再计算包住这两个盒子的盒子。

**代码清单 11**:`sphere.h` 带包围盒的运动球体

```cpp
class sphere : public hittable {
  public:
    ...

    // Moving Sphere
    sphere(const point3& center1, const point3& center2, double radius,
           shared_ptr<material> mat)
      : center(center1, center2 - center1), radius(std::fmax(0,radius)), mat(mat)
    {
        auto rvec = vec3(radius, radius, radius);
        aabb box1(center.at(0) - rvec, center.at(0) + rvec);
        aabb box2(center.at(1) - rvec, center.at(1) + rvec);
        bbox = aabb(box1, box2);
    }

    ...
};
```

现在我们需要一个以两个盒子为输入的新 `aabb` 构造函数。首先,我们为此添加一个新的 interval 构造函数:

**代码清单 12**:`interval.h` 由两个区间构造区间的构造函数

```cpp
class interval {
  public:
    double min, max;

    interval() : min(+infinity), max(-infinity) {} // Default interval is empty

    interval(double _min, double _max) : min(_min), max(_max) {}

    interval(const interval& a, const interval& b) {
        // Create the interval tightly enclosing the two input intervals.
        min = a.min <= b.min ? a.min : b.min;
        max = a.max >= b.max ? a.max : b.max;
    }

    double size() const {
    ...
```

现在我们可以用它从两个输入盒子构造一个轴对齐包围盒。

**代码清单 13**:`aabb.h` 由两个 AABB 构造 AABB 的构造函数

```cpp
class aabb {
  public:
    ...

    aabb(const point3& a, const point3& b) {
        ...
    }

    aabb(const aabb& box0, const aabb& box1) {
        x = interval(box0.x, box1.x);
        y = interval(box0.y, box1.y);
        z = interval(box0.z, box1.z);
    }

    ...
};
```

## 3.6 为物体列表创建包围盒

现在我们来更新 `hittable_list` 对象,让它计算其子物体的包围盒。每添加一个新的子物体,我们就增量地更新一次包围盒。

**代码清单 14**:`hittable_list.h` 带包围盒的 hittable 列表

```cpp
#include "aabb.h"
#include "hittable.h"

#include <vector>

class hittable_list : public hittable {
  public:
    std::vector<shared_ptr<hittable>> objects;

    ...
    void add(shared_ptr<hittable> object) {
        objects.push_back(object);
        bbox = aabb(bbox, object->bounding_box());
    }

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        ...
    }

    aabb bounding_box() const override { return bbox; }

  private:
    aabb bbox;
};
```

## 3.7 BVH 节点类

BVH 也将是一个 `hittable`——就像 `hittable` 列表一样。它实际上是一个容器,但它能够回答“这条光线命中你了吗?”这个问题。一个设计上的问题是:我们是用两个类,一个表示树、一个表示树中的节点;还是只用一个类,让根节点就是我们所指向的一个普通节点。`hit` 函数相当直接:检查该节点的包围盒是否被命中,如果命中,就检查子节点并处理相关细节。

只要可行,我更喜欢单个类的设计。下面就是这样一个类:

**代码清单 15**:`bvh.h` 包围体层次结构

```cpp
#ifndef BVH_H
#define BVH_H

#include "aabb.h"
#include "hittable.h"
#include "hittable_list.h"

class bvh_node : public hittable {
  public:
    bvh_node(hittable_list list) : bvh_node(list.objects, 0, list.objects.size()) {
        // There's a C++ subtlety here. This constructor (without span indices) creates an
        // implicit copy of the hittable list, which we will modify. The lifetime of the copied
        // list only extends until this constructor exits. That's OK, because we only need to
        // persist the resulting bounding volume hierarchy.
    }

    bvh_node(std::vector<shared_ptr<hittable>>& objects, size_t start, size_t end) {
        // To be implemented later.
    }

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        if (!bbox.hit(r, ray_t))
            return false;

        bool hit_left = left->hit(r, ray_t, rec);
        bool hit_right = right->hit(r, interval(ray_t.min, hit_left ? rec.t : ray_t.max), rec);

        return hit_left || hit_right;
    }

    aabb bounding_box() const override { return bbox; }

  private:
    shared_ptr<hittable> left;
    shared_ptr<hittable> right;
    aabb bbox;
};

#endif
```

## 3.8 划分 BVH 包围体

任何加速结构(包括 BVH)最复杂的部分都是构建它。我们在构造函数中完成构建。BVH 的一个很棒的特点是:只要 `bvh_node` 中的物体列表被分成两个子列表,hit 函数就能正常工作。如果划分得好,让两个子节点的包围盒都比父节点的包围盒小,效果会最好,但这只关乎速度,而不关乎正确性。我会采取折中的做法,在每个节点处沿着一根轴来划分列表。我会追求简单:

1. 随机选择一根轴
2. 对图元进行排序(`using std::sort`)
3. 每棵子树各放一半

当传入的列表只有两个元素时,我在每棵子树中各放一个,并结束递归。遍历(traversal)算法应该流畅,不必检查空指针,所以如果只有一个元素,我就把它复制到两棵子树中。显式地检查三个元素的情况并只进行一次递归,可能会有一点帮助,但我估计整个方法以后还会被优化。下面的代码用到了三个我们还没有定义的方法——`box_x_compare`、`box_y_compare` 和 `box_z_compare`。

**代码清单 16**:`bvh.h` 包围体层次结构节点

```cpp
#include "aabb.h"
#include "hittable.h"
#include "hittable_list.h"

#include <algorithm>

class bvh_node : public hittable {
  public:
    ...

    bvh_node(std::vector<shared_ptr<hittable>>& objects, size_t start, size_t end) {
        int axis = random_int(0,2);

        auto comparator = (axis == 0) ? box_x_compare
                        : (axis == 1) ? box_y_compare
                                      : box_z_compare;

        size_t object_span = end - start;

        if (object_span == 1) {
            left = right = objects[start];
        } else if (object_span == 2) {
            left = objects[start];
            right = objects[start+1];
        } else {
            std::sort(std::begin(objects) + start, std::begin(objects) + end, comparator);

            auto mid = start + object_span/2;
            left = make_shared<bvh_node>(objects, start, mid);
            right = make_shared<bvh_node>(objects, mid, end);
        }

        bbox = aabb(left->bounding_box(), right->bounding_box());
    }

    ...
};
```

这里用到了一个新函数:`random_int()`:

**代码清单 17**:`rtweekend.h` 返回某个范围内随机整数的函数

```cpp
...

inline double random_double(double min, double max) {
    // Returns a random real in [min,max).
    return min + (max-min)*random_double();
}

inline int random_int(int min, int max) {
    // Returns a random integer in [min,max].
    return int(random_double(min, max+1));
}

...
```

检查是否存在包围盒,是为了应对你传入了诸如无限大平面这类没有包围盒的东西。我们目前没有任何这样的图元,所以在你加入这类东西之前,这种情况不应该发生。

> **译注**:上面这段话沿用自原书的早期版本。在当前版本的代码中,`bounding_box()` 总是返回一个 `aabb`(可能为空),上面的代码里已经没有“是否存在包围盒”的检查了。

## 3.9 包围盒比较函数

现在我们需要实现供 `std::sort()` 使用的包围盒比较函数。为此,先创建一个通用的比较函数:它额外接受一个轴索引参数,当第一个参数小于第二个参数时返回 true。然后再定义针对各个轴的比较函数,它们都调用这个通用比较函数。

**代码清单 18**:`bvh.h` BVH 比较函数,X 轴

```cpp
class bvh_node : public hittable {
  ...

  private:
    shared_ptr<hittable> left;
    shared_ptr<hittable> right;
    aabb bbox;

    static bool box_compare(
        const shared_ptr<hittable> a, const shared_ptr<hittable> b, int axis_index
    ) {
        auto a_axis_interval = a->bounding_box().axis_interval(axis_index);
        auto b_axis_interval = b->bounding_box().axis_interval(axis_index);
        return a_axis_interval.min < b_axis_interval.min;
    }

    static bool box_x_compare (const shared_ptr<hittable> a, const shared_ptr<hittable> b) {
        return box_compare(a, b, 0);
    }

    static bool box_y_compare (const shared_ptr<hittable> a, const shared_ptr<hittable> b) {
        return box_compare(a, b, 1);
    }

    static bool box_z_compare (const shared_ptr<hittable> a, const shared_ptr<hittable> b) {
        return box_compare(a, b, 2);
    }
};
```

到这里,我们已经可以使用新的 BVH 代码了。让我们把它用在随机球体场景上。

**代码清单 19**:`main.cc` 使用 BVH 的随机球体场景

```cpp
#include "rtweekend.h"

#include "bvh.h"
#include "camera.h"
#include "hittable.h"
#include "hittable_list.h"
#include "material.h"
#include "sphere.h"

int main() {
    ...

    auto material2 = make_shared<lambertian>(color(0.4, 0.2, 0.1));
    world.add(make_shared<sphere>(point3(-4, 1, 0), 1.0, material2));

    auto material3 = make_shared<metal>(color(0.7, 0.6, 0.5), 0.0);
    world.add(make_shared<sphere>(point3(4, 1, 0), 1.0, material3));

    world = hittable_list(make_shared<bvh_node>(world));

    camera cam;

    ...
}
```

渲染出的图像应该与[图像 1](https://raytracing.github.io/books/RayTracingTheNextWeek.html#image-bouncing-spheres)所示的非 BVH 版本完全相同。不过,如果你给两个版本计时,BVH 版本应该会更快。在我这里,速度提升了将近*六倍半*。

## 3.10 另一项 BVH 优化

我们还可以让 BVH 优化再快一点。与其随机选择划分轴,不如沿着外围包围盒最长的那根轴来划分,以获得最大程度的细分。这个改动很直接,但在这个过程中我们会给 `aabb` 类添加一些东西。

第一项任务是在 BVH 构造函数中,为这一段(span)物体构造一个轴对齐包围盒。基本做法是:先把 `bvh_node` 的包围盒初始化为空(我们稍后会定义 `aabb::empty`),然后用这一段物体中每个物体的包围盒逐一扩充它,从而得到 `bvh_node` 的包围盒。

有了包围盒之后,就把划分轴设为最长边所在的那根轴。我们先假设有一个函数能替我们完成这件事:`aabb::longest_axis()`。最后,由于我们已经预先计算了这一段物体的包围盒,就可以删掉原来那行把包围盒计算为左右两侧并集的代码。

**代码清单 20**:`bvh.h` 为 BVH 中的一段物体构建包围盒(删去末尾的 `bbox = aabb(left->bounding_box(), right->bounding_box());` 一行)

```cpp
class bvh_node : public hittable {
  public:
    ...
    bvh_node(std::vector<shared_ptr<hittable>>& objects, size_t start, size_t end) {
        // Build the bounding box of the span of source objects.
        bbox = aabb::empty;
        for (size_t object_index=start; object_index < end; object_index++)
            bbox = aabb(bbox, objects[object_index]->bounding_box());

        int axis = bbox.longest_axis();

        auto comparator = (axis == 0) ? box_x_compare
                        : (axis == 1) ? box_y_compare
                                      : box_z_compare;

        ...

        bbox = aabb(left->bounding_box(), right->bounding_box());
    }

    ...
```

现在来实现空 `aabb` 的代码和新的 `aabb::longest_axis()` 函数:

**代码清单 21**:`aabb.h` 新的 aabb 常量和 `longest_axis()` 函数

```cpp
class aabb {
  public:
    ...

    bool hit(const ray& r, interval ray_t) const {
        ...
    }

    int longest_axis() const {
        // Returns the index of the longest axis of the bounding box.

        if (x.size() > y.size())
            return x.size() > z.size() ? 0 : 2;
        else
            return y.size() > z.size() ? 1 : 2;
    }

    static const aabb empty, universe;
};

const aabb aabb::empty    = aabb(interval::empty,    interval::empty,    interval::empty);
const aabb aabb::universe = aabb(interval::universe, interval::universe, interval::universe);
```

和之前一样,你应该会看到与[图像 1](https://raytracing.github.io/books/RayTracingTheNextWeek.html#image-bouncing-spheres)完全相同的结果,但渲染速度会稍快一些。在我的系统上,这大约又带来了 18% 的渲染提速。只多花这么一点功夫,效果还不错。
