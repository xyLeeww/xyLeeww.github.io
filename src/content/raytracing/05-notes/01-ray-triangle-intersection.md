---
title: "光线与三角形 / AABB 相交"
order: 1
description: "从参数化光线出发,推导 Möller–Trumbore 三角形相交和 AABB 平板(slab)测试,并讨论数值稳健性"
kind: original
---

光线追踪器里有两段代码几乎决定了性能:**光线与包围盒相交**(在 BVH 遍历中被调用几十次)和**光线与三角形相交**(在叶子节点里被调用几次)。这篇笔记把两者从头推一遍,并给出可以直接用的代码。

先用光栅化的视角做个对比:

```text
光栅化:  对每个三角形 -> 找出它覆盖了哪些像素      (三角形 -> 像素)
光线追踪:对每个像素的光线 -> 找出最先碰到哪个三角形  (像素 -> 三角形)
```

光栅化里“像素中心是否在三角形内”用的是边函数(edge function);下面会看到,光线追踪里用的重心坐标(barycentric coordinates)和边函数本质上是同一组量,只是换了个问法。

## 1. 参数化光线

一条光线由起点 $\mathbf{o}$ 和方向 $\mathbf{d}$ 决定,光线上的点写成参数 $t$ 的函数:

$$
\mathbf{r}(t) = \mathbf{o} + t\,\mathbf{d}, \qquad t \in [t_{\min},\, t_{\max}]
$$

几个要点:

- **区间很重要**。$t_{\min}$ 通常取一个很小的正数,用来避免光线从表面出发时又打中自己(阴影痤疮(shadow acne));$t_{\max}$ 在找最近交点时会不断缩小成“当前最近命中的 $t$”。Vulkan 的 `traceRayEXT` 和 `rayQueryInitializeEXT` 都直接接收 `tMin` / `tMax`,含义完全一样。
- **方向不必归一化**。如果 $\mathbf{d}$ 不是单位向量,$t$ 只是不再等于欧氏距离。仿射变换(比如把光线从世界空间变到实例的物体空间)会改变 $\mathbf{d}$ 的长度,但同一个交点在两个空间里的 $t$ 相同。这就是硬件光追在物体空间做相交、却能直接把 $t$ 当作世界空间命中距离(`gl_HitTEXT`)的原因。
- **“最近命中”就是最小的合法 $t$**。整个相交问题可以概括为:在 $[t_{\min}, t_{\max}]$ 中找最小的 $t$,使 $\mathbf{r}(t)$ 落在某个图元上。

## 2. 光线与平面

平面可以写成 $\mathbf{n} \cdot \mathbf{p} = c$($\mathbf{n}$ 为法线)。把光线代入:

$$
\mathbf{n} \cdot (\mathbf{o} + t\,\mathbf{d}) = c
\quad\Longrightarrow\quad
t = \frac{c - \mathbf{n} \cdot \mathbf{o}}{\mathbf{n} \cdot \mathbf{d}}
$$

- 分母 $\mathbf{n} \cdot \mathbf{d} = 0$:光线与平面平行,没有交点(或整条光线在平面内,一般也按不相交处理)。
- 分母的符号告诉我们光线是从平面的哪一侧射来的,这就是“正面 / 背面”判断的来源。

三角形相交最朴素的做法就是两步:先求与三角形所在平面的交点,再判断交点是否在三角形内。它能工作,但需要先算法线、再做三次叉积判断,运算量偏大。Möller–Trumbore 把两步合成一步。

## 3. 重心坐标

设三角形顶点为 $A, B, C$,记两条边 $\mathbf{e}_1 = B - A$,$\mathbf{e}_2 = C - A$。三角形所在平面上的任意点都可以写成

$$
P(u, v) = (1 - u - v)\,A + u\,B + v\,C = A + u\,\mathbf{e}_1 + v\,\mathbf{e}_2
$$

$(1-u-v,\ u,\ v)$ 就是 $P$ 的重心坐标。它们有一个直观的几何意义:$u$ 等于三角形 $PCA$ 的面积除以 $ABC$ 的面积,$v$ 等于 $PAB$ 的面积除以 $ABC$ 的面积,即“对面那个小三角形占了多大比例”。

```text
              C
             / \
            /   \
           /  P  \      u = 面积(P,C,A) / 面积(A,B,C)   -> B 的权重
          /       \     v = 面积(P,A,B) / 面积(A,B,C)   -> C 的权重
         A---------B    w = 1-u-v                      -> A 的权重
```

$P$ 在三角形内部(含边界)当且仅当

$$
u \ge 0,\quad v \ge 0,\quad u + v \le 1
$$

重心坐标不只用来判断内外,命中之后还要用它来插值法线、UV、顶点颜色。在 Vulkan 里,三角形命中时 `hitAttributeEXT vec2` 拿到的正是这里的 $(u, v)$:第二个顶点的权重是 `attribs.x`,第三个顶点的权重是 `attribs.y`,第一个顶点的权重是 `1 - attribs.x - attribs.y`。

## 4. Möller–Trumbore:用克莱姆法则一步求出 t、u、v

### 4.1 写成线性方程组

交点既在光线上,又在三角形平面上:

$$
\mathbf{o} + t\,\mathbf{d} = A + u\,\mathbf{e}_1 + v\,\mathbf{e}_2
$$

把未知数移到左边,令 $\mathbf{s} = \mathbf{o} - A$:

$$
-t\,\mathbf{d} + u\,\mathbf{e}_1 + v\,\mathbf{e}_2 = \mathbf{s}
\quad\Longleftrightarrow\quad
\begin{bmatrix} -\mathbf{d} & \mathbf{e}_1 & \mathbf{e}_2 \end{bmatrix}
\begin{bmatrix} t \\ u \\ v \end{bmatrix} = \mathbf{s}
$$

这是一个 3×3 线性方程组,三列分别是 $-\mathbf{d}$、$\mathbf{e}_1$、$\mathbf{e}_2$。

### 4.2 克莱姆法则 + 三重积

克莱姆法则:第 $i$ 个未知数等于“把第 $i$ 列替换成右端向量后的行列式”除以系数矩阵的行列式。而三个列向量组成的 3×3 行列式就是标量三重积:

$$
\det(\mathbf{a}, \mathbf{b}, \mathbf{c}) = \mathbf{a} \cdot (\mathbf{b} \times \mathbf{c}) = (\mathbf{a} \times \mathbf{b}) \cdot \mathbf{c}
$$

并且三重积在轮换下不变、交换两项变号。利用这些性质,引入两个辅助向量

$$
\mathbf{p} = \mathbf{d} \times \mathbf{e}_2, \qquad \mathbf{q} = \mathbf{s} \times \mathbf{e}_1
$$

逐个化简:

$$
D = \det(-\mathbf{d}, \mathbf{e}_1, \mathbf{e}_2) = -\mathbf{d} \cdot (\mathbf{e}_1 \times \mathbf{e}_2) = \mathbf{e}_1 \cdot (\mathbf{d} \times \mathbf{e}_2) = \mathbf{p} \cdot \mathbf{e}_1
$$

$$
u = \frac{\det(-\mathbf{d}, \mathbf{s}, \mathbf{e}_2)}{D} = \frac{\mathbf{s} \cdot (\mathbf{d} \times \mathbf{e}_2)}{D} = \frac{\mathbf{p} \cdot \mathbf{s}}{D}
$$

$$
v = \frac{\det(-\mathbf{d}, \mathbf{e}_1, \mathbf{s})}{D} = \frac{\mathbf{d} \cdot (\mathbf{s} \times \mathbf{e}_1)}{D} = \frac{\mathbf{q} \cdot \mathbf{d}}{D}
$$

$$
t = \frac{\det(\mathbf{s}, \mathbf{e}_1, \mathbf{e}_2)}{D} = \frac{\mathbf{e}_2 \cdot (\mathbf{s} \times \mathbf{e}_1)}{D} = \frac{\mathbf{q} \cdot \mathbf{e}_2}{D}
$$

(每一步都只用了“轮换不变、交换变号”,建议自己在纸上验一遍。)

结果非常紧凑:**两次叉积($\mathbf{p}$、$\mathbf{q}$)、四次点积、一次倒数**,不需要预先算三角形法线,也不需要存平面方程。更妙的是可以“边算边退出”:先算出 $u$,如果 $u$ 已经越界,就不必再算 $\mathbf{q}$ 了。

### 4.3 D 的几何意义

$\mathbf{e}_1 \times \mathbf{e}_2$ 就是三角形的几何法线 $\mathbf{N}$(按 $A \to B \to C$ 的顺序由右手定则确定),所以

$$
D = -\mathbf{d} \cdot \mathbf{N}
$$

- $D \approx 0$:光线与三角形平面平行(或三角形退化成线段 / 点),判为不相交。
- $D > 0$:光线迎着 $\mathbf{N}$ 射来,看到的是 $\mathbf{N}$ 指向的那一面。
- $D < 0$:光线从 $\mathbf{N}$ 的背后射来。

所以背面剔除只需要看 $D$ 的符号,几乎不花额外开销。至于“哪一面算正面”,这只是约定:Vulkan 规范规定在默认情况下,从光线的视角看顶点按索引顺序呈**顺时针**时为正面(规范用左手坐标系描述),实例上可以用 `VK_GEOMETRY_INSTANCE_TRIANGLE_FLIP_FACING_BIT_KHR` 翻转;它与光栅化管线里 `VkPipelineRasterizationStateCreateInfo::frontFace` 的设置无关。

### 4.4 代码

下面是一个自包含的 C++ 版本。`cullBackFace` 为真时只接受 $D > 0$ 的命中。

```cpp
#include <cmath>

struct Vec3 { float x, y, z; };
inline Vec3  operator-(Vec3 a, Vec3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline float dot(Vec3 a, Vec3 b)       { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline Vec3  cross(Vec3 a, Vec3 b) {
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

struct TriHit { float t, u, v; bool frontFace; };

// 返回 true 表示在 (tMin, tMax) 内命中;结果写到 hit
bool intersectTriangle(Vec3 o, Vec3 d, Vec3 A, Vec3 B, Vec3 C,
                       float tMin, float tMax, bool cullBackFace, TriHit& hit)
{
    const Vec3 e1 = B - A;
    const Vec3 e2 = C - A;
    const Vec3 p  = cross(d, e2);
    const float D = dot(p, e1);

    if (cullBackFace ? (D <= 0.0f) : (D == 0.0f))   // 平行、退化或被剔除
        return false;
    const float invD = 1.0f / D;

    const Vec3 s = o - A;
    const float u = dot(p, s) * invD;
    if (u < 0.0f || u > 1.0f) return false;        // 提前退出:不用再算 q

    const Vec3 q = cross(s, e1);
    const float v = dot(q, d) * invD;
    if (v < 0.0f || u + v > 1.0f) return false;

    const float t = dot(q, e2) * invD;
    if (t <= tMin || t >= tMax) return false;

    hit = {t, u, v, D > 0.0f};
    return true;
}
```

找最近交点时,调用方在每次命中后把 `tMax` 更新为 `hit.t`,后面的三角形自然只会接受更近的交点。

## 5. 数值问题:epsilon、平行和“漏光”

浮点数会让上面这套干净的推导出现几类典型问题。

**(1)平行判断用什么阈值?** 很多教程写 `fabs(D) < 1e-8`。问题是 $D$ 的量级与三角形边长的平方、方向长度成正比,一个固定的绝对阈值在大场景里可能误杀正常三角形,在毫米级模型上又形同虚设。上面的代码只排除 $D = 0$:真正接近平行时,$u$、$v$ 会变得极大从而被范围检查拒绝,结果通常已经足够好。如果确实需要阈值,应当按三角形尺度做相对比较。

**(2)自相交。** 从命中点发出的次级光线(阴影、反射)由于舍入误差,可能又在 $t \approx 0$ 处打中原来的三角形,画面上出现黑色斑点。常见对策:

- 设一个小的 $t_{\min}$(例如 `1e-3`,与场景尺度相关);
- 或者把起点沿几何法线偏移一点,偏移量随坐标大小缩放(Ray Tracing Gems 第 6 章介绍过一种基于浮点表示的稳健做法)。

**(3)缝隙与重复命中(watertightness,水密性)。** 两个相邻三角形共享一条边。理想情况下,恰好打在这条边上的光线应该**恰好命中其中一个**。但 Möller–Trumbore 对每个三角形独立计算 $u$、$v$,两边的舍入误差互不相关,于是可能出现:

```text
       A                 光线恰好穿过共享边 AB:
      / \                 - 三角形 1 算出 v = -1e-8  -> 拒绝
     / 1 \                - 三角形 2 算出 u' = -2e-8 -> 也拒绝
    B-----A'              => 光线从缝里“漏”过去(背景色像素点)
     \ 2 /                反过来也可能两边都接受,造成重复命中
      \ /                 (对 any-hit 和透明累加很致命)
       C
```

Woop、Benthin、Wald 在 2013 年提出的水密算法的思路是:先把坐标系平移到光线起点,并按方向的最大分量重排坐标轴,再做剪切变换,让光线变成沿 $+z$ 轴、穿过原点的直线。这样相交测试就退化成 2D 的边函数符号判断;共享边在两个三角形里用同样的输入、同样的运算顺序求值,结果恰好互为相反数,所以不会两边都漏。边函数恰好为 0 时再退回双精度重算。

对 Vulkan 使用者来说,这件事主要由驱动和硬件负责。规范在 Watertightness 一节要求实现“不应在共享边或闭合扇形的共享顶点上重复命中或漏掉”,并注明虽然措辞不是 must,但会被测试。自己写软件光追器(或在 compute shader 里实现)时才需要操心。

## 6. 光线与 AABB:平板测试

### 6.1 思路

轴对齐包围盒(AABB)由 $\mathbf{b}_{\min}$ 和 $\mathbf{b}_{\max}$ 给出,可以看成三组平行平板(slab)的交集:$x \in [x_{\min}, x_{\max}]$、$y \in \dots$、$z \in \dots$。光线穿过每组平板时都对应一个 $t$ 区间,光线与盒子相交当且仅当**三个区间(再加上光线自己的 $[t_{\min}, t_{\max}]$)有公共部分**。

以 $x$ 轴为例,光线到达两个平面的参数是

$$
t_{x,1} = \frac{x_{\min} - o_x}{d_x}, \qquad t_{x,2} = \frac{x_{\max} - o_x}{d_x}
$$

若 $d_x \lt 0$,两个值的大小会颠倒,所以取 $t_{x,\text{near}} = \min(t_{x,1}, t_{x,2})$、$t_{x,\text{far}} = \max(t_{x,1}, t_{x,2})$。最后

$$
t_{\text{enter}} = \max(t_{\min},\ t_{x,\text{near}},\ t_{y,\text{near}},\ t_{z,\text{near}}), \qquad
t_{\text{exit}} = \min(t_{\max},\ t_{x,\text{far}},\ t_{y,\text{far}},\ t_{z,\text{far}})
$$

相交条件是 $t_{\text{enter}} \le t_{\text{exit}}$。

```text
 y                                 t 轴上的三个区间:
 ^      +---------+                x 区间:   [====x====]
 |      |   box   |                y 区间:        [=====y=====]
 |  o-------------------> d        交集:          [==]   非空 => 命中
 |      |         |
 |      +---------+                若 x 区间与 y 区间不重叠 => 未命中
 +---------------------> x
```

### 6.2 用倒数代替除法

一条光线要和成百上千个盒子测试,而 $1/\mathbf{d}$ 对这条光线是常量,所以在遍历开始前算一次 `invDir`,之后每个盒子只做乘法。再进一步把 $-\mathbf{o} \cdot \text{invDir}$ 也预先算好,每个平面就只剩一次乘加(FMA)。

```cpp
#include <algorithm>

struct Ray {
    Vec3 o, d;
    Vec3 invD;          // 1/d,遍历前算好
    float tMin, tMax;   // tMax 随找到更近的命中而缩小
};

// 命中时返回进入盒子的 t,未命中返回 +inf(方便遍历时按距离排序)
inline float intersectAABB(const Ray& r, Vec3 bmin, Vec3 bmax)
{
    float tEnter = r.tMin, tExit = r.tMax;   // 从光线自身的区间开始收缩

    float tx1 = (bmin.x - r.o.x) * r.invD.x, tx2 = (bmax.x - r.o.x) * r.invD.x;
    tEnter = std::max(tEnter, std::min(tx1, tx2));
    tExit  = std::min(tExit,  std::max(tx1, tx2));
    float ty1 = (bmin.y - r.o.y) * r.invD.y, ty2 = (bmax.y - r.o.y) * r.invD.y;
    tEnter = std::max(tEnter, std::min(ty1, ty2));
    tExit  = std::min(tExit,  std::max(ty1, ty2));
    float tz1 = (bmin.z - r.o.z) * r.invD.z, tz2 = (bmax.z - r.o.z) * r.invD.z;
    tEnter = std::max(tEnter, std::min(tz1, tz2));
    tExit  = std::min(tExit,  std::max(tz1, tz2));

    return (tEnter <= tExit) ? tEnter : INFINITY;
}
```

GLSL 里可以用向量运算把三个轴一起算:

```glsl
// 返回 (tEnter, tExit);tEnter > tExit 表示未命中
vec2 slabTest(vec3 orig, vec3 invDir, vec3 bmin, vec3 bmax, float tMin, float tMax)
{
    vec3 t1 = (bmin - orig) * invDir;
    vec3 t2 = (bmax - orig) * invDir;
    vec3 tNear = min(t1, t2);
    vec3 tFar  = max(t1, t2);
    float tEnter = max(max(tNear.x, tNear.y), max(tNear.z, tMin));
    float tExit  = min(min(tFar.x,  tFar.y),  min(tFar.z,  tMax));
    return vec2(tEnter, tExit);
}
```

### 6.3 方向分量为 0 与 NaN

当 $d_x = 0$ 时,`invD.x` 是 $\pm\infty$(IEEE 754 下 `1.0f / 0.0f = +inf`,`1.0f / -0.0f = -inf`,符号恰好有意义):

- 起点严格在 $x$ 平板**内部**:$(x_{\min} - o_x)$ 为负、$(x_{\max} - o_x)$ 为正,得到 $(-\infty, +\infty)$,这个轴不施加任何约束。正确。
- 起点严格在平板**外部**:两个值同号,得到 $(+\infty, +\infty)$ 或 $(-\infty, -\infty)$,最终区间为空。正确。
- 起点**恰好落在**平板边界上:$(x_{\min} - o_x) = 0$,于是 $0 \times \infty = \text{NaN}$。

NaN 是麻烦所在:所有与 NaN 的比较都返回 false,而不同 `min`/`max` 实现遇到 NaN 的行为也不同(`std::min(a, b)` 写作 `b < a ? b : a`,结果取决于 NaN 在哪个参数位置;SSE 的 `minps` 返回第二个操作数;C 的 `fminf` 和 GLSL 的 `min` 规则又各不相同)。常见处理方式:

1. **安排参数顺序**,让 NaN 总是被丢掉。上面的 C++ 代码从 `r.tMin` / `r.tMax` 开始累积,并且始终把累积值放在第一个参数:`std::max(a, b)` 的实现是 `a < b ? b : a`,当 `b` 是 NaN 时比较为 false,返回 `a`;`std::min(a, b)` 是 `b < a ? b : a`,同理返回 `a`。于是某个轴算出的 NaN 会被直接忽略,这个轴相当于不施加约束。如果一开始就用 `std::min(tx1, tx2)` 初始化 `tEnter`,NaN 就可能一路传到最后,把本该命中的盒子判成未命中。这类写法依赖具体实现,写完要测。
2. **不让 $d$ 的分量为 0**:构造光线时把绝对值很小的分量替换成带符号的极小值(如 `1e-20f`),从源头消除 $0 \times \infty$。实现简单,GPU 上常用。
3. 擦边命中本身影响不大:光线恰好擦过盒子的一个面时,判为命中或未命中都不会改变最终图像,因为盒子只是保守的包围体。真正要保证的是“不会因 NaN 漏掉盒子内部的三角形”。

此外还有一个更隐蔽的问题:浮点舍入可能让 $t_{\text{exit}}$ 比真实值略小,导致光线擦着三角形边缘时盒子测试先判了未命中。稳健的实现会把 $t_{\text{exit}}$ 乘上一个略大于 1 的因子(Ize 2013《Robust BVH Ray Traversal》给出了误差界),让盒子测试变得保守。

### 6.4 为什么它是 BVH 遍历的热循环

一条光线在 BVH 里通常要访问几十个内部节点,每个节点都要做一到两次(二叉树)或更多次(宽 BVH)盒子测试,而真正落到叶子里的三角形测试只有个位数。因此:

- 盒子测试的条数远多于三角形测试,它的指令数、分支和内存访问直接决定遍历速度;
- 这也是硬件把“光线–盒子”和“光线–三角形”测试做成固定功能单元的原因。以 AMD RDNA2 为例,着色器发出 `image_bvh_intersect_ray` 类指令,由每个 CU 中的 Ray Accelerator 对一个 BVH4 节点的 4 个子盒子(或 1 个三角形)做相交,遍历的栈管理和循环仍由着色器代码完成;NVIDIA 的 RT Core 则把整个遍历循环也放进了固定功能单元。
- 不少实现会用低精度(如 16 位浮点或量化坐标)保守地存储子盒子以节省带宽——又一次说明对盒子而言“保守”比“精确”更重要。

## 自测问题

1. 推导中引入的 $\mathbf{p} = \mathbf{d} \times \mathbf{e}_2$ 在 $u$ 和 $D$ 两处都被使用。如果光线方向不变、只换三角形,哪些量可以在多个三角形之间共享?哪些不行?
2. 为什么用 $D$ 的符号就能做背面剔除?在 Vulkan 中,哪个标志可以翻转默认的正面定义?
3. 两个共享一条边的三角形,为什么用 Möller–Trumbore 可能出现“漏光”?水密算法是怎样避免的?
4. 在平板测试中,当 $d_x = 0$ 且光线起点正好落在 $x = x_{\min}$ 平面上时,会发生什么?给出两种处理方法。
5. 为什么说盒子测试比三角形测试更“热”?

<details>
<summary>参考答案</summary>

1. $\mathbf{p}$ 依赖 $\mathbf{e}_2$,所以换三角形后必须重算;只有光线本身的量(起点、方向、`invDir`)可以共享。$\mathbf{s} = \mathbf{o} - A$ 和 $\mathbf{q}$ 也都与三角形有关。另一种思路是为每个三角形预计算一些量(例如法线或变换矩阵),用内存换计算,这是另一类相交算法的出发点。
2. $D = -\mathbf{d} \cdot (\mathbf{e}_1 \times \mathbf{e}_2)$,而 $\mathbf{e}_1 \times \mathbf{e}_2$ 是由顶点顺序决定的几何法线,所以 $D$ 的符号表示光线从法线的哪一侧射来。Vulkan 中用实例标志 `VK_GEOMETRY_INSTANCE_TRIANGLE_FLIP_FACING_BIT_KHR` 翻转。
3. 每个三角形独立计算重心坐标,两边的舍入误差不相关,可能都略小于 0(漏掉),也可能都略大于 0(重复命中)。水密算法把问题变换到以光线为 $z$ 轴的空间,用 2D 边函数判断;共享边在两个三角形中的计算完全相同、结果互为相反数,恰好为 0 时再用双精度重算。
4. $(x_{\min} - o_x) \cdot \text{invD}_x = 0 \times \infty = \text{NaN}$,后续比较全部为 false,结果取决于 `min`/`max` 的实现。处理方法:让累积值作为 `max`/`min` 的保留参数,使 NaN 被丢弃;或者构造光线时把为 0 的方向分量替换成极小的非零值。
5. 一条光线要穿过几十个内部节点,每个节点都要测盒子;只有少数到达叶子的情况才测三角形。所以盒子测试次数多一个数量级,也是硬件优先加速的对象。

</details>

## 延伸阅读

- Scratchapixel:[Ray-Triangle Intersection: Möller-Trumbore](https://www.scratchapixel.com/lessons/3d-basic-rendering/ray-tracing-rendering-a-triangle/moller-trumbore-ray-triangle-intersection.html)(配有详细图解,可与本文的推导对照)
- Tomas Möller, Ben Trumbore,《Fast, Minimum Storage Ray/Triangle Intersection》,Journal of Graphics Tools, 1997(算法原始论文)
- Sven Woop, Carsten Benthin, Ingo Wald,[《Watertight Ray/Triangle Intersection》](https://jcgt.org/published/0002/01/05/),JCGT 2013
- 本站:[The Next Week:BVH](/rt-docs/02-tnw-bvh/01-bvh/)(用区间(interval)的写法实现 AABB 相交)
