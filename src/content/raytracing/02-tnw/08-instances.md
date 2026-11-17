---
title: "8. 实例(Instances)"
order: 8
description: "用六个四边形拼出长方体,并通过实例化实现物体的平移和绕 y 轴旋转,搭建出标准的康奈尔盒场景"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#instances"
sourceTitle: "Ray Tracing: The Next Week · Instances"
license: "CC0 1.0"
---

康奈尔盒里通常有两个方块。它们相对于墙壁是旋转过的。首先,我们来创建一个返回长方体的函数,它会创建一个由六个矩形组成的 `hittable_list`:

**代码清单 62**:`quad.h` 长方体物体

```cpp {2,8-30}
#include "hittable.h"
#include "hittable_list.h"

class quad : public hittable {
    ...
};

inline shared_ptr<hittable_list> box(const point3& a, const point3& b, shared_ptr<material> mat)
{
    // Returns the 3D box (six sides) that contains the two opposite vertices a & b.

    auto sides = make_shared<hittable_list>();

    // Construct the two opposite vertices with the minimum and maximum coordinates.
    auto min = point3(std::fmin(a.x(),b.x()), std::fmin(a.y(),b.y()), std::fmin(a.z(),b.z()));
    auto max = point3(std::fmax(a.x(),b.x()), std::fmax(a.y(),b.y()), std::fmax(a.z(),b.z()));

    auto dx = vec3(max.x() - min.x(), 0, 0);
    auto dy = vec3(0, max.y() - min.y(), 0);
    auto dz = vec3(0, 0, max.z() - min.z());

    sides->add(make_shared<quad>(point3(min.x(), min.y(), max.z()),  dx,  dy, mat)); // front
    sides->add(make_shared<quad>(point3(max.x(), min.y(), max.z()), -dz,  dy, mat)); // right
    sides->add(make_shared<quad>(point3(max.x(), min.y(), min.z()), -dx,  dy, mat)); // back
    sides->add(make_shared<quad>(point3(min.x(), min.y(), min.z()),  dz,  dy, mat)); // left
    sides->add(make_shared<quad>(point3(min.x(), max.y(), max.z()),  dx, -dz, mat)); // top
    sides->add(make_shared<quad>(point3(min.x(), min.y(), min.z()),  dx,  dz, mat)); // bottom

    return sides;
}
```

现在我们可以添加两个方块了(不过还没有旋转)。

**代码清单 63**:`main.cc` 添加长方体物体

```cpp {10-11}
void cornell_box() {
    ...
    world.add(make_shared<quad>(point3(555,0,0), vec3(0,555,0), vec3(0,0,555), green));
    world.add(make_shared<quad>(point3(0,0,0), vec3(0,555,0), vec3(0,0,555), red));
    world.add(make_shared<quad>(point3(343, 554, 332), vec3(-130,0,0), vec3(0,0,-105), light));
    world.add(make_shared<quad>(point3(0,0,0), vec3(555,0,0), vec3(0,0,555), white));
    world.add(make_shared<quad>(point3(555,555,555), vec3(-555,0,0), vec3(0,0,-555), white));
    world.add(make_shared<quad>(point3(0,0,555), vec3(555,0,0), vec3(0,555,0), white));

    world.add(box(point3(130, 0, 65), point3(295, 165, 230), white));
    world.add(box(point3(265, 0, 295), point3(430, 330, 460), white));

    camera cam;
    ...
}
```

结果如下:

![图像 20:带有两个方块的康奈尔盒](/raytracing/tnw/img-2.20-cornell-blocks.png)

有了长方体之后,我们需要把它们稍微旋转一下,让它们和*真实*的康奈尔盒一致。在光线追踪中,这通常是通过*实例(instance)*来完成的。实例是放置到场景中的某个几何图元的一份副本。这个实例完全独立于该图元的其他副本,可以被移动或旋转。在这里,我们的几何图元就是可命中的 `box` 物体,而我们想要旋转它。这在光线追踪中尤其容易,因为我们实际上并不需要移动场景中的物体;相反,我们把光线朝相反的方向移动。例如,考虑一次*平移(translation)*(通常也叫作*移动(move)*)。我们可以把位于原点的粉色长方体的所有 x 分量都加上 2,或者(就像我们在光线追踪中几乎总是做的那样)让长方体保持原位,而在它的求交例程中把光线起点的 x 分量减去 2。

![图 8:移动光线与移动长方体两种方式下的光线-长方体求交](/raytracing/tnw/fig-2.08-ray-box.jpg)

## 8.1 实例平移

你可以把它看作一次移动,也可以把它看作坐标的变换,这取决于你自己。思考这个问题的方式是:把入射光线向后移动偏移量那么多,判断是否发生相交,然后再把交点向前移动偏移量那么多。

我们需要把交点向前移动偏移量,这样交点才真正位于入射光线的路径上。如果忘了把交点向前移动,那么交点就会位于偏移后光线的路径上,这是不正确的。我们来添加实现这一点的代码。

**代码清单 64**:`hittable.h` 可命中物体平移的 hit 函数

```cpp {5-24}
class hittable {
    ...
};

class translate : public hittable {
  public:
    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        // Move the ray backwards by the offset
        ray offset_r(r.origin() - offset, r.direction(), r.time());

        // Determine whether an intersection exists along the offset ray (and if so, where)
        if (!object->hit(offset_r, ray_t, rec))
            return false;

        // Move the intersection point forwards by the offset
        rec.p += offset;

        return true;
    }

  private:
    shared_ptr<hittable> object;
    vec3 offset;
};
```

……然后补全 `translate` 类的其余部分:

**代码清单 65**:`hittable.h` 可命中物体平移类

```cpp {3-7,13,18}
class translate : public hittable {
  public:
    translate(shared_ptr<hittable> object, const vec3& offset)
      : object(object), offset(offset)
    {
        bbox = object->bounding_box() + offset;
    }

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        ...
    }

    aabb bounding_box() const override { return bbox; }

  private:
    shared_ptr<hittable> object;
    vec3 offset;
    aabb bbox;
};
```

我们还需要记得对包围盒进行偏移,否则入射光线可能会在错误的地方查找,从而直接排除这次相交。上面的表达式 `object->bounding_box() + offset` 需要一些额外的支持。

**代码清单 66**:`aabb.h` aabb + 偏移量运算符

```cpp {8-14}
class aabb {
    ...
};

const aabb aabb::empty    = aabb(interval::empty,    interval::empty,    interval::empty);
const aabb aabb::universe = aabb(interval::universe, interval::universe, interval::universe);

aabb operator+(const aabb& bbox, const vec3& offset) {
    return aabb(bbox.x + offset.x(), bbox.y + offset.y(), bbox.z + offset.z());
}

aabb operator+(const vec3& offset, const aabb& bbox) {
    return bbox + offset;
}
```

由于 `aabb` 的每个维度都用一个区间表示,我们还需要为 `interval` 扩展一个加法运算符。

**代码清单 67**:`interval.h` interval + 位移量运算符

```cpp {8-14}
class interval {
    ...
};

const interval interval::empty    = interval(+infinity, -infinity);
const interval interval::universe = interval(-infinity, +infinity);

interval operator+(const interval& ival, double displacement) {
    return interval(ival.min + displacement, ival.max + displacement);
}

interval operator+(double displacement, const interval& ival) {
    return ival + displacement;
}
```

## 8.2 实例旋转

旋转就没那么容易理解了,推导它的公式也没那么容易。图形学中一个常见的策略是把所有旋转都分解为绕 x、y、z 轴的旋转。这些旋转在某种意义上是轴对齐的。首先,我们来绕 z 轴旋转 theta 角。这只会改变 x 和 y,并且改变的方式与 z 无关。

![图 9:绕 Z 轴旋转](/raytracing/tnw/fig-2.09-rot-z.jpg)

这需要用到一些基本的三角学公式,我不打算在这里展开讲。它稍微有点繁琐,但很直接,你可以在任何一本图形学教材和许多课程讲义中找到它。绕 z 轴逆时针旋转的结果是:

$$
x' = \cos(\theta) \cdot x - \sin(\theta) \cdot y
$$
$$
y' = \sin(\theta) \cdot x + \cos(\theta) \cdot y
$$

它的妙处在于对任意 $\theta$ 都成立,不需要针对象限之类的情况分别处理。逆变换就是相反的几何操作:旋转 $-\theta$。这里回忆一下,$\cos(\theta) = \cos(-\theta)$,而 $\sin(-\theta) = -\sin(\theta)$,所以公式非常简单。

类似地,绕 y 轴旋转(也就是我们要对盒子里的方块做的旋转)的公式是:

$$
x' =  \cos(\theta) \cdot x + \sin(\theta) \cdot z
$$
$$
z' = -\sin(\theta) \cdot x + \cos(\theta) \cdot z
$$

而如果我们想绕 x 轴旋转:

$$
y' = \cos(\theta) \cdot y - \sin(\theta) \cdot z
$$
$$
z' = \sin(\theta) \cdot y + \cos(\theta) \cdot z
$$

把平移看作对初始光线的简单移动,是理解其中原理的一种不错的方式。但对于旋转这样更复杂的操作,很容易不小心把各项弄混(或者漏掉一个负号),所以最好把旋转看作一次坐标变换。

上面 `translate::hit` 函数的伪代码是用*移动*的方式来描述这个函数的:

1. 把光线向后移动偏移量
2. 判断偏移后的光线上是否存在交点(如果存在,在哪里)
3. 把交点向前移动偏移量

但它也可以用*坐标变换*的方式来理解:

1. 把光线从世界空间变换到物体空间
2. 判断在物体空间中是否存在交点(如果存在,在哪里)
3. 把交点从物体空间变换到世界空间

旋转一个物体不仅会改变交点,还会改变表面法向量,进而改变反射和折射的方向。所以我们也需要变换法线。幸运的是,法线的旋转方式与向量类似,因此我们可以使用和上面相同的公式。虽然对于只经历旋转和平移的物体来说,法线和向量看起来可以同样处理,但对于经历缩放的物体,则需要特别注意,才能让法线保持与表面垂直。我们在这里不讨论这个问题,但如果你要实现缩放,应该去研究一下表面法线的变换。

我们首先需要把光线从世界空间变换到物体空间,对于旋转来说,这意味着旋转 $-\theta$。

$$
x' = \cos(\theta) \cdot x - \sin(\theta) \cdot z
$$
$$
z' = \sin(\theta) \cdot x + \cos(\theta) \cdot z
$$

现在我们可以创建一个绕 y 轴旋转的类了。先来处理 hit 函数:

**代码清单 68**:`hittable.h` 可命中物体绕 Y 轴旋转的 hit 函数

```cpp {5-47}
class translate : public hittable {
    ...
};

class rotate_y : public hittable {
  public:

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {

        // Transform the ray from world space to object space.

        auto origin = point3(
            (cos_theta * r.origin().x()) - (sin_theta * r.origin().z()),
            r.origin().y(),
            (sin_theta * r.origin().x()) + (cos_theta * r.origin().z())
        );

        auto direction = vec3(
            (cos_theta * r.direction().x()) - (sin_theta * r.direction().z()),
            r.direction().y(),
            (sin_theta * r.direction().x()) + (cos_theta * r.direction().z())
        );

        ray rotated_r(origin, direction, r.time());

        // Determine whether an intersection exists in object space (and if so, where).

        if (!object->hit(rotated_r, ray_t, rec))
            return false;

        // Transform the intersection from object space back to world space.

        rec.p = point3(
            (cos_theta * rec.p.x()) + (sin_theta * rec.p.z()),
            rec.p.y(),
            (-sin_theta * rec.p.x()) + (cos_theta * rec.p.z())
        );

        rec.normal = vec3(
            (cos_theta * rec.normal.x()) + (sin_theta * rec.normal.z()),
            rec.normal.y(),
            (-sin_theta * rec.normal.x()) + (cos_theta * rec.normal.z())
        );

        return true;
    }
};
```

……接下来是这个类的其余部分:

**代码清单 69**:`hittable.h` 可命中物体绕 Y 轴旋转类

```cpp {3-33,39-45}
class rotate_y : public hittable {
  public:
    rotate_y(shared_ptr<hittable> object, double angle) : object(object) {
        auto radians = degrees_to_radians(angle);
        sin_theta = std::sin(radians);
        cos_theta = std::cos(radians);
        bbox = object->bounding_box();

        point3 min( infinity,  infinity,  infinity);
        point3 max(-infinity, -infinity, -infinity);

        for (int i = 0; i < 2; i++) {
            for (int j = 0; j < 2; j++) {
                for (int k = 0; k < 2; k++) {
                    auto x = i*bbox.x.max + (1-i)*bbox.x.min;
                    auto y = j*bbox.y.max + (1-j)*bbox.y.min;
                    auto z = k*bbox.z.max + (1-k)*bbox.z.min;

                    auto newx =  cos_theta*x + sin_theta*z;
                    auto newz = -sin_theta*x + cos_theta*z;

                    vec3 tester(newx, y, newz);

                    for (int c = 0; c < 3; c++) {
                        min[c] = std::fmin(min[c], tester[c]);
                        max[c] = std::fmax(max[c], tester[c]);
                    }
                }
            }
        }

        bbox = aabb(min, max);
    }

    bool hit(const ray& r, interval ray_t, hit_record& rec) const override {
        ...
    }

    aabb bounding_box() const override { return bbox; }

  private:
    shared_ptr<hittable> object;
    double sin_theta;
    double cos_theta;
    aabb bbox;
};
```

对康奈尔盒场景的修改如下:

**代码清单 70**:`main.cc` 带有绕 Y 轴旋转长方体的康奈尔盒场景

```cpp {5-13}
void cornell_box() {
    ...
    world.add(make_shared<quad>(point3(0,0,555), vec3(555,0,0), vec3(0,555,0), white));

    shared_ptr<hittable> box1 = box(point3(0,0,0), point3(165,330,165), white);
    box1 = make_shared<rotate_y>(box1, 15);
    box1 = make_shared<translate>(box1, vec3(265,0,295));
    world.add(box1);

    shared_ptr<hittable> box2 = box(point3(0,0,0), point3(165,165,165), white);
    box2 = make_shared<rotate_y>(box2, -18);
    box2 = make_shared<translate>(box2, vec3(130,0,65));
    world.add(box2);

    camera cam;
    ...
}
```

得到的结果是:

![图像 21:标准的康奈尔盒场景](/raytracing/tnw/img-2.21-cornell-standard.png)
