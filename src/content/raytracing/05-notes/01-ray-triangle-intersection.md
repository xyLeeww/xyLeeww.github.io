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

光栅化里“像素中心是否在三角形内”用的是边函数(edge function,第 2.4 节给出定义);下面会看到,光线追踪里用的重心坐标(barycentric coordinates)和边函数本质上是同一组量,只是换了个问法(第 3.3 节)。

### 为什么偏偏是三角形?

《Ray Tracing in One Weekend》里只有球,但真实场景中的人物、车辆、建筑几乎都是**三角形网格**(triangle mesh):把曲面切成成千上万个小三角形拼起来。三角形之所以成为标准图元,有几个原因:

- **三个不共线的点一定在同一个平面上**。四边形的四个顶点可能不共面(“扭曲”的四边形),三角形永远不会。
- **任何多边形都能拆成三角形**,曲面也能用足够多的小三角形逼近。
- OBJ、glTF、FBX 等模型格式,以及 GPU 的光栅化和硬件光追,都以三角形为基本单位。Vulkan 的 BLAS 里最常见的几何类型就是 `VK_GEOMETRY_TYPE_TRIANGLES_KHR`。

所以对光线追踪器来说,最核心的问题就是:**这条光线有没有打中某个三角形?打在哪里?** 而 BVH 的作用是尽量少问这个问题(见第 6 节)。

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

### 2.1 平面方程从哪里来

确定一个平面需要两样东西:**法线** $\mathbf{n}$(垂直于平面的方向)和**平面上的一个已知点** $\mathbf{p}_0$。

如果点 $\mathbf{p}$ 也在平面上,那么从 $\mathbf{p}_0$ 指向 $\mathbf{p}$ 的向量 $\mathbf{p} - \mathbf{p}_0$ 躺在平面里,一定和法线垂直,点积为 0:

$$
\mathbf{n} \cdot (\mathbf{p} - \mathbf{p}_0) = 0
\quad\Longrightarrow\quad
\mathbf{n} \cdot \mathbf{p} = \mathbf{n} \cdot \mathbf{p}_0
$$

右边 $\mathbf{n} \cdot \mathbf{p}_0$ 是一个固定的数,记作 $c$,就得到平面方程

$$
\mathbf{n} \cdot \mathbf{p} = c
$$

它的意思是:**平面上所有点和法线做点积,结果都是同一个数 $c$**;不在平面上的点,结果会比 $c$ 大(在法线指向的一侧)或比 $c$ 小(在另一侧)。

```text
            n
            ^
            |      n·p > c   (法线指向的一侧)
   ---------+-----------  平面:n·p = c
            p0     n·p < c   (另一侧)
```

举个例子:平面 $z = -2$ 的法线可以取 $\mathbf{n} = (0, 0, 1)$,平面上一点取 $\mathbf{p}_0 = (0, 0, -2)$,所以 $c = -2$。而 $\mathbf{n} \cdot \mathbf{p} = p_z$,方程 $\mathbf{n} \cdot \mathbf{p} = -2$ 正是 $z = -2$。

$\mathbf{n}$ 不必是单位向量:把 $\mathbf{n}$ 和 $c$ 同时乘以同一个非零数,描述的仍是同一个平面。

### 2.2 把光线代入

交点 $\mathbf{r}(t)$ 既在光线上,也在平面上,所以把 $\mathbf{r}(t) = \mathbf{o} + t\,\mathbf{d}$ 代入平面方程。点积对加法可以展开:

$$
\mathbf{n} \cdot (\mathbf{o} + t\,\mathbf{d}) = c
\quad\Longrightarrow\quad
\mathbf{n} \cdot \mathbf{o} + t\,(\mathbf{n} \cdot \mathbf{d}) = c
\quad\Longrightarrow\quad
t = \frac{c - \mathbf{n} \cdot \mathbf{o}}{\mathbf{n} \cdot \mathbf{d}}
$$

$\mathbf{n} \cdot \mathbf{o}$ 和 $\mathbf{n} \cdot \mathbf{d}$ 都只是普通的数,所以这其实就是解一个一元一次方程。可以这样理解这个比值:

- 分子 $c - \mathbf{n} \cdot \mathbf{o}$:起点 $\mathbf{o}$ 沿法线方向**离平面还差多少**;
- 分母 $\mathbf{n} \cdot \mathbf{d}$:光线每前进一个单位 $t$,沿法线方向**移动多少**;
- 两者相除,就是“还要走几步才能到达平面”。

求出 $t$ 之后还要检查 $t \in [t_{\min}, t_{\max}]$;例如 $t < 0$ 表示平面在光线起点的**背后**,不能算命中。

**算例。** 光线从原点出发,方向 $\mathbf{d} = (-0.25, -0.25, -1)$,与平面 $z = -2$ 求交:

$$
\mathbf{n} \cdot \mathbf{o} = 0, \qquad \mathbf{n} \cdot \mathbf{d} = -1, \qquad
t = \frac{-2 - 0}{-1} = 2, \qquad
\mathbf{r}(2) = (-0.5,\ -0.5,\ -2)
$$

后文会一直沿用这条光线和平面 $z = -2$ 上的同一个三角形,方便对照每一步的数字。

### 2.3 分母为 0 与正反面

| $\mathbf{n} \cdot \mathbf{d}$ | 含义 |
|---|---|
| $= 0$ | $\mathbf{d}$ 与法线垂直,光线**平行**于平面:要么永远碰不到,要么整条光线都在平面里。后者有无数个交点,一般也按不相交处理。同时公式的分母为 0,也没法直接计算 |
| $< 0$ | 光线与法线方向相反,从法线指向的那一侧射来,打到**正面** |
| $> 0$ | 光线与法线方向相同,从平面背后射来,打到**背面** |

这和《Ray Tracing in One Weekend》里用 `dot(r.direction(), outward_normal) < 0` 判断 `front_face` 是同一个道理。上面的算例中 $\mathbf{n} \cdot \mathbf{d} = -1 < 0$,光线打到的是法线 $(0, 0, 1)$ 指向的那一面。

### 2.4 朴素做法:先求平面交点,再判断内外

平面是无限大的,三角形只是平面上的一小块。光线打到平面,不代表打到三角形:

```text
          C
         / \
        / P \        P:在三角形内  -> 命中
       /     \
      A-------B
                  Q  Q:在平面上,但在三角形外 -> 不命中
```

所以最直接的做法分两步。

**第一步,和三角形所在平面求交。** 用两条边的叉积得到法线,再用顶点 $A$ 得到 $c$:

$$
\mathbf{N} = (B - A) \times (C - A), \qquad c = \mathbf{N} \cdot A
$$

然后用 2.2 的公式求出 $t$ 和交点 $P = \mathbf{r}(t)$。

**第二步,判断 $P$ 是否在三条边的同一侧。** 对每条边做一次叉积,看 $P$ 在这条边的左边还是右边:

$$
\big((B - A) \times (P - A)\big) \cdot \mathbf{N} \ge 0, \quad
\big((C - B) \times (P - B)\big) \cdot \mathbf{N} \ge 0, \quad
\big((A - C) \times (P - C)\big) \cdot \mathbf{N} \ge 0
$$

这三个式子左边的量,各叫做一条边的**边函数**(edge function)。以边 $AB$ 为例:

$$
E_{AB}(P) = \big((B - A) \times (P - A)\big) \cdot \mathbf{N}
$$

它回答的问题是:**$P$ 在有向边 $A \to B$ 的哪一侧?** 想象从法线 $\mathbf{N}$ 指向的那一侧往下看,站在 $A$ 面朝 $B$:

| $E_{AB}(P)$ | $P$ 的位置 |
|---|---|
| $> 0$ | 在左手边 |
| $< 0$ | 在右手边 |
| $= 0$ | 正好在直线 $AB$ 上 |

如果三角形位于 $xy$ 平面、$\mathbf{N}$ 沿 $+z$,两个叉积都只有 $z$ 分量,边函数就是熟悉的 2D 叉积:

$$
E_{AB}(P) = (B_x - A_x)(P_y - A_y) - (B_y - A_y)(P_x - A_x)
$$

因为 $\mathbf{N} = (B - A) \times (C - A)$ 由右手定则确定,从 $\mathbf{N}$ 这一侧看过去 $A \to B \to C$ 是逆时针的,三角形内部始终在每条边的左手边。所以 $A \to B \to C$ 绕一圈时,如果三个边函数都不小于 0,说明 $P$ 一直在每条边的内侧,也就在三角形内部或边上。只要有一个为负,$P$ 就跑到了某条边的外侧。GPU 光栅化判断像素是否被三角形覆盖,用的也是这个方法:对像素中心计算三条边的边函数。

**算例。** 取三角形

$$
A = (-1, -1, -2), \quad B = (1, -1, -2), \quad C = (-1, 1, -2)
$$

它在平面 $z = -2$ 上。为了方便手算,这里用单位法线 $\hat{\mathbf{n}} = (0, 0, 1)$ 代替 $\mathbf{N}$(方向相同,符号判断不变)。三个叉积都只有 $z$ 分量,点积就是这个 $z$ 分量:

| 边 | 边向量 | 到点的向量 | $P = (-0.5, -0.5, -2)$ | $Q = (1, 1, -2)$ |
|---|---|---|---|---|
| $AB$ | $(2, 0, 0)$ | $P - A = (0.5, 0.5, 0)$ | $1$ | $4$ |
| $BC$ | $(-2, 2, 0)$ | $P - B = (-1.5, 0.5, 0)$ | $2$ | $-4$ |
| $CA$ | $(0, -2, 0)$ | $P - C = (0.5, -1.5, 0)$ | $1$ | $4$ |

$P$ 的三个值都为正,在三角形内;$Q$ 在边 $BC$ 上得到负数,在三角形外。

这个方法能用,但要先算法线和平面方程,再做三次叉积和三次点积。Möller–Trumbore 把“求交点”和“判断内外”合成一步,运算更少,也不需要存储平面方程。

顺便留意上表里 $P$ 的三个边函数值 $1, 2, 1$:这里只用了它们的正负号,但第 3.3 节会看到,数值本身也有意义,它们恰好对应 $P$ 的三个重心坐标。

## 3. 重心坐标

### 3.1 用两条边当坐标轴

设三角形顶点为 $A, B, C$,记两条边 $\mathbf{e}_1 = B - A$,$\mathbf{e}_2 = C - A$。三角形所在平面上的任意点都可以写成

$$
P(u, v) = (1 - u - v)\,A + u\,B + v\,C = A + u\,\mathbf{e}_1 + v\,\mathbf{e}_2
$$

**两种写法为什么相等?** 把左边展开、重新分组即可:

$$
(1 - u - v)A + uB + vC = A + u(B - A) + v(C - A) = A + u\,\mathbf{e}_1 + v\,\mathbf{e}_2
$$

**为什么平面上的任意点都能这样写?** 可以把右边的写法看成在三角形所在平面上建了一个**斜坐标系**:以 $A$ 为原点,以 $\mathbf{e}_1$、$\mathbf{e}_2$ 为两根坐标轴。从 $A$ 出发,沿 $\mathbf{e}_1$ 走 $u$ 倍,再沿 $\mathbf{e}_2$ 走 $v$ 倍,就到了 $P$:

```text
          C
          ^
          |
       e2 |    P = A + u·e1 + v·e2
          |   /
          |  /  v·e2
          | /
          A ---------> B
            u·e1    e1
```

这和普通的平面直角坐标 $P = O + x\,(1, 0) + y\,(0, 1)$ 是一回事,只是两根轴换成了三角形的两条边,不再互相垂直、长度也不一定是 1。只要 $\mathbf{e}_1$ 和 $\mathbf{e}_2$ **不平行**,它们就能组合出这个平面上的任意方向,所以每个点都对应**唯一**的一组 $(u, v)$。如果两条边平行,说明 $A, B, C$ 共线,三角形退化成一条线段,这种三角形在相交测试中会被排除(见 4.3)。

**算例。** 沿用第 2 节的三角形,$\mathbf{e}_1 = (2, 0, 0)$,$\mathbf{e}_2 = (0, 2, 0)$,于是

$$
P(u, v) = (-1 + 2u,\ -1 + 2v,\ -2)
$$

| $(u, v)$ | $P$ | 位置 |
|---|---|---|
| $(0, 0)$ | $(-1, -1, -2)$ | 顶点 $A$ |
| $(1, 0)$ | $(1, -1, -2)$ | 顶点 $B$ |
| $(0, 1)$ | $(-1, 1, -2)$ | 顶点 $C$ |
| $(0.25, 0.25)$ | $(-0.5, -0.5, -2)$ | 内部,第 2 节光线的交点 |
| $(1/3, 1/3)$ | $(-1/3, -1/3, -2)$ | 内部,三角形的重心 |
| $(1, 1)$ | $(1, 1, -2)$ | 平面上,但在三角形外(第 2 节的 $Q$) |
| $(-0.5, 0.5)$ | $(-2, 0, -2)$ | 平面上,但在三角形外 |

### 3.2 重心坐标是三个顶点的权重

令 $w = 1 - u - v$,左边的写法就是 $P = wA + uB + vC$,并且 $w + u + v = 1$。$(w, u, v)$ 就是 $P$ 的重心坐标,可以理解为三个顶点各自对 $P$ 的“拉力”或权重:

- 在 $A$ 处,$(w, u, v) = (1, 0, 0)$,完全由 $A$ 决定;$B$、$C$ 同理;
- 在三角形的重心,三个权重都是 $1/3$;
- 越靠近某个顶点,这个顶点的权重就越大。

它们还有一个直观的几何意义:$u$ 等于三角形 $PCA$ 的面积除以 $ABC$ 的面积,$v$ 等于 $PAB$ 的面积除以 $ABC$ 的面积,即“对面那个小三角形占了多大比例”。

```text
              C
             / \
            /   \
           /  P  \      u = 面积(P,C,A) / 面积(A,B,C)   -> B 的权重
          /       \     v = 面积(P,A,B) / 面积(A,B,C)   -> C 的权重
         A---------B    w = 1-u-v                      -> A 的权重
```

为什么是“对面”的三角形?以 $u$ 为例:三角形 $PCA$ 以边 $CA$ 为底,底不变,面积就只取决于 $P$ 到直线 $CA$ 的距离。$P$ 落在边 $CA$ 上时这个面积为 0,$B$ 的权重 $u = 0$;$P$ 移到 $B$ 时面积最大,等于整个三角形,$u = 1$。也就是说,$P$ 离边 $CA$ 越远,离 $B$ 越近,$u$ 越大。

### 3.3 边函数和重心坐标是同一组量

开头提到,光栅化用的边函数和这里的重心坐标“本质上是同一组量”。现在把两者放在一起对比。

**先回顾第 2.4 节。** 三角形和交点是

$$
A = (-1, -1, -2), \quad B = (1, -1, -2), \quad C = (-1, 1, -2), \quad P = (-0.5, -0.5, -2)
$$

三条边的边函数算出来是

$$
E_{AB}(P) = 1, \qquad E_{BC}(P) = 2, \qquad E_{CA}(P) = 1
$$

当时只用正负号判断 $P$ 在三角形内,没有用到 $1, 2, 1$ 这几个数值本身。

**边函数的数值是小三角形面积的两倍。** 叉积的长度等于两个向量围成的平行四边形的面积,三角形是平行四边形的一半,所以

$$
\big|(B - A) \times (P - A)\big| = 2 \cdot \text{面积}(P, A, B)
$$

再点乘**单位**法线,只是给这个长度加上正负号(第 2.4 节的算例用的正是单位法线 $\hat{\mathbf{n}}$)。$P$ 在三角形内时符号为正,所以 $E_{AB}(P)$ 就等于三角形 $PAB$ 面积的两倍。

把三角形画在 $xy$ 平面上看($z = -2$ 省略),$P$ 把 $ABC$ 分成了三个小三角形 $PAB$、$PBC$、$PCA$:

```text
  y
  1  C
     |\
     |  \
     |    \
  0  |      \
     |        \
     |  P       \
     |  *         \
 -1  A--------------B
    -1      0       1   x
```

| 三角形 | 怎么算面积 | 面积 | 面积 × 2 | 第 2.4 节的值 |
|---|---|---:|---:|---|
| $PAB$ | 底 $AB = 2$,$P$ 到 $AB$($y = -1$)的高 $0.5$ | $0.5$ | $1$ | $E_{AB} = 1$ |
| $PCA$ | 底 $CA = 2$,$P$ 到 $CA$($x = -1$)的高 $0.5$ | $0.5$ | $1$ | $E_{CA} = 1$ |
| $PBC$ | 整个三角形减去另外两个:$2 - 0.5 - 0.5$ | $1$ | $2$ | $E_{BC} = 2$ |
| $ABC$(整个) | 两条直角边都是 $2$ | $2$ | $4$ | $\lvert \mathbf{e}_1 \times \mathbf{e}_2 \rvert = 4$ |

“面积 × 2”和“第 2.4 节的值”两列完全相同。三个边函数加起来 $1 + 2 + 1 = 4$,也正好等于 $|\mathbf{e}_1 \times \mathbf{e}_2|$,因为三个小三角形拼起来就是整个三角形。

**除以总量,就得到重心坐标。** 第 3.2 节的定义是“重心坐标 = 小三角形面积 / 整个三角形面积”。边函数和 $|\mathbf{e}_1 \times \mathbf{e}_2|$ 都是面积的**两倍**,相除时这个 2 被约掉,比值不变:

$$
\frac{E_{AB}(P)}{|\mathbf{e}_1 \times \mathbf{e}_2|}
= \frac{2 \cdot \text{面积}(P, A, B)}{2 \cdot \text{面积}(A, B, C)}
= \frac{\text{面积}(P, A, B)}{\text{面积}(A, B, C)}
= v
$$

注意,单独看每个数,$E_{AB} = 1$ 并不等于面积 $0.5$,$|\mathbf{e}_1 \times \mathbf{e}_2| = 4$ 也不等于面积 $2$;只有两者的**比值**才等于面积比 $0.5 / 2 = 0.25$。三条边都这样计算:

| 边 | 对面的顶点 | 边函数 ÷ 4 | 重心坐标 |
|---|---|---|---|
| $AB$ | $C$ | $1 / 4$ | $v = 0.25$($C$ 的权重) |
| $BC$ | $A$ | $2 / 4$ | $w = 0.5$($A$ 的权重) |
| $CA$ | $B$ | $1 / 4$ | $u = 0.25$($B$ 的权重) |

规律是:**每条边的边函数,除以总量后,就是它对面那个顶点的权重**。$P$ 离这条边越远,小三角形越大,对面顶点的权重就越大。结果 $(u, v) = (0.25, 0.25)$ 和 3.1 节表里交点的坐标完全一致,$w = 1 - u - v = 0.5$ 也对得上。

**小结:**

- **边函数**:没有除以总面积。光栅化只需要知道像素在不在三角形里,看正负号就够了,省掉一次除法。
- **重心坐标**:除以了总面积,变成和为 1 的三个权重。光线追踪命中后还要用它插值法线、UV 等属性,所以需要真正的比例。

两者只差一个公共的正数除数,所以正负号完全一致:三个边函数都 $\ge 0$,等价于三个重心坐标都 $\ge 0$。下一节的内外判断条件,说的正是这件事。

### 3.4 内外判断

$P$ 在三角形内部(含边界)当且仅当

$$
u \ge 0,\quad v \ge 0,\quad u + v \le 1
$$

最后一个条件就是 $w = 1 - u - v \ge 0$。三个条件各对应一条边:

| 条件不满足 | $P$ 跑到了哪里 |
|---|---|
| $u < 0$ | 边 $CA$ 的外侧(远离 $B$ 的一侧) |
| $v < 0$ | 边 $AB$ 的外侧(远离 $C$ 的一侧) |
| $u + v > 1$ | 边 $BC$ 的外侧(远离 $A$ 的一侧) |

例如 3.1 表中的 $(1, 1)$ 满足 $u, v \ge 0$,但 $u + v = 2 > 1$,所以在边 $BC$ 外侧,和 2.4 节 $Q$ 的边 $BC$ 测试结果为负一致。

重心坐标不只用来判断内外,命中之后还要用它来插值法线、UV、顶点颜色。在 Vulkan 里,三角形命中时 `hitAttributeEXT vec2` 拿到的正是这里的 $(u, v)$:第二个顶点的权重是 `attribs.x`,第三个顶点的权重是 `attribs.y`,第一个顶点的权重是 `1 - attribs.x - attribs.y`。例如三个顶点的法线分别为 $\mathbf{n}_A, \mathbf{n}_B, \mathbf{n}_C$,命中点的平滑法线就是 $\text{normalize}(w\,\mathbf{n}_A + u\,\mathbf{n}_B + v\,\mathbf{n}_C)$。

## 4. Möller–Trumbore:用克莱姆法则一步求出 t、u、v

### 4.1 写成线性方程组

Möller–Trumbore 的出发点很简单:交点既在光线上,又在三角形平面上,那就让两种写法相等:

$$
\mathbf{o} + t\,\mathbf{d} = A + u\,\mathbf{e}_1 + v\,\mathbf{e}_2
$$

这里 $\mathbf{o}, \mathbf{d}, A, \mathbf{e}_1, \mathbf{e}_2$ 都是已知的,未知数只有三个数:$t$(交点在光线上的位置)和 $u, v$(交点在三角形上的位置)。把未知数移到左边,令 $\mathbf{s} = \mathbf{o} - A$(从顶点 $A$ 指向光线起点):

$$
-t\,\mathbf{d} + u\,\mathbf{e}_1 + v\,\mathbf{e}_2 = \mathbf{s}
\quad\Longleftrightarrow\quad
\begin{bmatrix} -\mathbf{d} & \mathbf{e}_1 & \mathbf{e}_2 \end{bmatrix}
\begin{bmatrix} t \\ u \\ v \end{bmatrix} = \mathbf{s}
$$

这是一个 3×3 线性方程组,三列分别是 $-\mathbf{d}$、$\mathbf{e}_1$、$\mathbf{e}_2$。每个向量有 $x, y, z$ 三个分量,所以一条向量等式就是三条普通方程,三个方程正好解三个未知数。

**算例。** 用第 2、3 节的数据:$\mathbf{d} = (-0.25, -0.25, -1)$,$\mathbf{e}_1 = (2, 0, 0)$,$\mathbf{e}_2 = (0, 2, 0)$,$\mathbf{s} = \mathbf{o} - A = (1, 1, 2)$。按分量写出来:

$$
\begin{cases}
0.25\,t + 2u = 1 & (x) \\
0.25\,t + 2v = 1 & (y) \\
t = 2 & (z)
\end{cases}
\quad\Longrightarrow\quad
t = 2,\quad u = 0.25,\quad v = 0.25
$$

一次就同时得到了交点距离 $t$ 和重心坐标 $(u, v)$;再检查 $u, v \ge 0$、$u + v \le 1$,就完成了第 2.4 节那两步的全部工作。这个例子特意选得很简单,一般的三角形三条方程都会同时包含 $t, u, v$,需要一个通用的解法,这就是克莱姆法则。

### 4.2 克莱姆法则 + 三重积

**克莱姆法则**:第 $i$ 个未知数等于“把系数矩阵的第 $i$ 列替换成右端向量后的行列式”除以系数矩阵的行列式。先看一个 2×2 的例子:

$$
\begin{cases} 2x + y = 5 \\ x + 3y = 10 \end{cases}
\qquad
D = \begin{vmatrix} 2 & 1 \\ 1 & 3 \end{vmatrix} = 5, \quad
x = \frac{\begin{vmatrix} 5 & 1 \\ 10 & 3 \end{vmatrix}}{D} = \frac{5}{5} = 1, \quad
y = \frac{\begin{vmatrix} 2 & 5 \\ 1 & 10 \end{vmatrix}}{D} = \frac{15}{5} = 3
$$

求 $x$ 时把第 1 列换成右端 $(5, 10)$,求 $y$ 时把第 2 列换掉。3×3 的情况完全一样,只是行列式变成三阶。

**三重积。** 三个列向量组成的 3×3 行列式就是标量三重积:

$$
\det(\mathbf{a}, \mathbf{b}, \mathbf{c}) = \mathbf{a} \cdot (\mathbf{b} \times \mathbf{c}) = (\mathbf{a} \times \mathbf{b}) \cdot \mathbf{c}
$$

几何上,它是以 $\mathbf{a}, \mathbf{b}, \mathbf{c}$ 为棱的平行六面体的**有向体积**。由此可以直接看出两条性质:

- **轮换不变**:$\det(\mathbf{a}, \mathbf{b}, \mathbf{c}) = \det(\mathbf{b}, \mathbf{c}, \mathbf{a}) = \det(\mathbf{c}, \mathbf{a}, \mathbf{b})$,同一个六面体,体积不变;
- **交换两项变号**:例如 $\det(\mathbf{a}, \mathbf{b}, \mathbf{c}) = -\det(\mathbf{b}, \mathbf{a}, \mathbf{c})$,相当于翻转了“左右手”。

此外,某一项前面的负号可以提到外面:$\det(-\mathbf{a}, \mathbf{b}, \mathbf{c}) = -\det(\mathbf{a}, \mathbf{b}, \mathbf{c})$。

利用这些性质,引入两个辅助向量

$$
\mathbf{p} = \mathbf{d} \times \mathbf{e}_2, \qquad \mathbf{q} = \mathbf{s} \times \mathbf{e}_1
$$

逐个化简(每一行最后都写成 $\mathbf{p}$ 或 $\mathbf{q}$ 与某个向量的点积):

**系数行列式 $D$**:

$$
D = \det(-\mathbf{d}, \mathbf{e}_1, \mathbf{e}_2)
= -\det(\mathbf{d}, \mathbf{e}_1, \mathbf{e}_2)
\overset{\text{交换 } \mathbf{d}, \mathbf{e}_1}{=} \det(\mathbf{e}_1, \mathbf{d}, \mathbf{e}_2)
= \mathbf{e}_1 \cdot (\mathbf{d} \times \mathbf{e}_2) = \mathbf{p} \cdot \mathbf{e}_1
$$

**$u$**:把第 2 列换成 $\mathbf{s}$:

$$
u = \frac{\det(-\mathbf{d}, \mathbf{s}, \mathbf{e}_2)}{D}
= \frac{-\det(\mathbf{d}, \mathbf{s}, \mathbf{e}_2)}{D}
\overset{\text{交换 } \mathbf{d}, \mathbf{s}}{=} \frac{\det(\mathbf{s}, \mathbf{d}, \mathbf{e}_2)}{D}
= \frac{\mathbf{s} \cdot (\mathbf{d} \times \mathbf{e}_2)}{D} = \frac{\mathbf{p} \cdot \mathbf{s}}{D}
$$

**$v$**:把第 3 列换成 $\mathbf{s}$:

$$
v = \frac{\det(-\mathbf{d}, \mathbf{e}_1, \mathbf{s})}{D}
= \frac{-\,\mathbf{d} \cdot (\mathbf{e}_1 \times \mathbf{s})}{D}
= \frac{\mathbf{d} \cdot (\mathbf{s} \times \mathbf{e}_1)}{D} = \frac{\mathbf{q} \cdot \mathbf{d}}{D}
$$

(这里用的是叉积反交换:$\mathbf{e}_1 \times \mathbf{s} = -\,\mathbf{s} \times \mathbf{e}_1$。)

**$t$**:把第 1 列换成 $\mathbf{s}$:

$$
t = \frac{\det(\mathbf{s}, \mathbf{e}_1, \mathbf{e}_2)}{D}
\overset{\text{轮换}}{=} \frac{\det(\mathbf{e}_2, \mathbf{s}, \mathbf{e}_1)}{D}
= \frac{\mathbf{e}_2 \cdot (\mathbf{s} \times \mathbf{e}_1)}{D} = \frac{\mathbf{q} \cdot \mathbf{e}_2}{D}
$$

(建议自己在纸上验一遍。)

为什么要专门凑出 $\mathbf{p}$ 和 $\mathbf{q}$?因为它们能被**重复使用**:$\mathbf{p}$ 同时用于 $D$ 和 $u$,$\mathbf{q}$ 同时用于 $v$ 和 $t$。四个三阶行列式本来要算四次叉积,现在只要两次。

结果非常紧凑:**两次叉积($\mathbf{p}$、$\mathbf{q}$)、四次点积、一次倒数**,不需要预先算三角形法线,也不需要存平面方程。更妙的是可以“边算边退出”:先算出 $u$,如果 $u$ 已经越界,就不必再算 $\mathbf{q}$ 了。

### 4.3 D 的几何意义

$\mathbf{e}_1 \times \mathbf{e}_2$ 就是三角形的几何法线 $\mathbf{N}$(按 $A \to B \to C$ 的顺序由右手定则确定),所以

$$
D = -\mathbf{d} \cdot \mathbf{N}
$$

- $D \approx 0$:光线与三角形平面平行(或三角形退化成线段 / 点),判为不相交。
- $D > 0$:光线迎着 $\mathbf{N}$ 射来,看到的是 $\mathbf{N}$ 指向的那一面。
- $D < 0$:光线从 $\mathbf{N}$ 的背后射来。

在前面的算例中,$\mathbf{N} = \mathbf{e}_1 \times \mathbf{e}_2 = (2, 0, 0) \times (0, 2, 0) = (0, 0, 4)$,指向 $+z$,也就是朝着原点处的相机;光线沿 $-z$ 方向射去,$D = -\mathbf{d} \cdot \mathbf{N} = -(-1 \times 4) = 4 > 0$,看到的是正面。如果把顶点顺序改成 $A, C, B$,$\mathbf{N}$ 会反向,$D$ 变成 $-4$,同一条光线就打到了背面。

$D = 0$ 也可以从三重积的角度理解:$D$ 是以 $-\mathbf{d}, \mathbf{e}_1, \mathbf{e}_2$ 为棱的六面体体积。光线方向平行于三角形平面时,三个向量共面,六面体被压扁,体积为 0,方程组没有唯一解;三角形退化($\mathbf{e}_1 \parallel \mathbf{e}_2$)时同理。

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

**代码与公式的对应关系:**

| 代码 | 公式 | 作用 |
|---|---|---|
| `e1`, `e2` | $\mathbf{e}_1 = B - A$, $\mathbf{e}_2 = C - A$ | 建立 3.1 节的斜坐标系 |
| `p`, `D` | $\mathbf{p} = \mathbf{d} \times \mathbf{e}_2$, $D = \mathbf{p} \cdot \mathbf{e}_1$ | 系数行列式;为 0 表示平行或退化 |
| `invD` | $1 / D$ | 只做一次除法,后面三个未知数都乘它 |
| `s`, `u` | $\mathbf{s} = \mathbf{o} - A$, $u = \mathbf{p} \cdot \mathbf{s} / D$ | 先求 $u$,越界就提前退出 |
| `q`, `v` | $\mathbf{q} = \mathbf{s} \times \mathbf{e}_1$, $v = \mathbf{q} \cdot \mathbf{d} / D$ | 检查 $v \ge 0$ 和 $u + v \le 1$ |
| `t` | $t = \mathbf{q} \cdot \mathbf{e}_2 / D$ | 最后检查是否在 $(t_{\min}, t_{\max})$ 内 |

几处细节:

- **为什么检查 `u > 1`?** 最终要求 $v \ge 0$ 且 $u + v \le 1$,这意味着 $u \le 1$。所以只要 $u > 1$,无论 $v$ 是多少都不可能在三角形内,可以在算 $\mathbf{q}$ 之前就返回。
- **为什么最后才算 `t`?** 光线和三角形所在平面的交点大多数落在三角形外面,先用 $u$、$v$ 筛掉它们,可以省掉很多次计算。
- **为什么返回 `frontFace`?** 材质需要知道光线从哪一侧进入,例如玻璃要区分“从空气进入玻璃”和“从玻璃射出到空气”。

调用方遍历多个三角形、保留最近交点的写法:

```cpp
struct Triangle { Vec3 A, B, C; };

// 返回最近命中的三角形下标,没有命中时返回 -1
int closestHit(Vec3 o, Vec3 d, const Triangle* tris, int count,
               float tMin, float tMax, TriHit& best)
{
    int hitIndex = -1;
    float closest = tMax;
    for (int i = 0; i < count; ++i) {
        TriHit h;
        // 传入 closest 作为上限:比当前最近交点更远的命中会被直接拒绝
        if (intersectTriangle(o, d, tris[i].A, tris[i].B, tris[i].C,
                              tMin, closest, false, h)) {
            closest = h.t;
            best = h;
            hitIndex = i;
        }
    }
    return hitIndex;
}
```

这和《Ray Tracing in One Weekend》里 `hittable_list::hit` 用 `closest_so_far` 缩小区间是同一个思路;BVH 遍历也是这样不断缩小 $t_{\max}$ 的。

### 4.5 完整算例

把 4.1 节的数据代入代码,逐行计算:

$$
A = (-1, -1, -2), \quad B = (1, -1, -2), \quad C = (-1, 1, -2), \quad
\mathbf{o} = (0, 0, 0), \quad \mathbf{d} = (-0.25, -0.25, -1)
$$

| 步骤 | 计算 | 结果 |
|---|---|---|
| 边 | $\mathbf{e}_1 = B - A$, $\mathbf{e}_2 = C - A$ | $(2, 0, 0)$, $(0, 2, 0)$ |
| $\mathbf{p}$ | $\mathbf{d} \times \mathbf{e}_2 = (d_y e_{2z} - d_z e_{2y},\ d_z e_{2x} - d_x e_{2z},\ d_x e_{2y} - d_y e_{2x})$ | $(2, 0, -0.5)$ |
| $D$ | $\mathbf{p} \cdot \mathbf{e}_1 = 2 \times 2$ | $4$,不为 0,且为正面 |
| $\mathbf{s}$ | $\mathbf{o} - A$ | $(1, 1, 2)$ |
| $u$ | $\mathbf{p} \cdot \mathbf{s} / D = (2 + 0 - 1) / 4$ | $0.25$,在 $[0, 1]$ 内 |
| $\mathbf{q}$ | $\mathbf{s} \times \mathbf{e}_1 = (s_y e_{1z} - s_z e_{1y},\ s_z e_{1x} - s_x e_{1z},\ s_x e_{1y} - s_y e_{1x})$ | $(0, 4, -2)$ |
| $v$ | $\mathbf{q} \cdot \mathbf{d} / D = (0 - 1 + 2) / 4$ | $0.25$,且 $u + v = 0.5 \le 1$ |
| $t$ | $\mathbf{q} \cdot \mathbf{e}_2 / D = 8 / 4$ | $2$ |

验证:$\mathbf{r}(2) = (-0.5, -0.5, -2)$,而 $A + 0.25\,\mathbf{e}_1 + 0.25\,\mathbf{e}_2 = (-0.5, -0.5, -2)$,两边相同。这个结果也和第 2 节(平面公式)、第 3 节(面积比)、4.1 节(手解方程组)得到的数字一致。

可以试着把 $\mathbf{d}$ 改成 $(0.25, 0.25, -1)$,交点会变成 $(0.5, 0.5, -2)$,对应 $u = v = 0.75$、$u + v = 1.5 > 1$,在 `v` 那一步被拒绝。

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

直观理解:光线必须**先进入所有平板,才算进入盒子**,所以进入时间取各轴进入时间的最大值;只要**离开任意一组平板,就离开了盒子**,所以离开时间取各轴离开时间的最小值。

**算例(2D,省略 $z$ 轴)。** 盒子为 $x \in [1, 3]$、$y \in [1, 2]$,光线从原点出发,取 $t_{\min} = 0$、$t_{\max} = \infty$:

| 方向 $\mathbf{d}$ | $x$ 区间 | $y$ 区间 | $t_{\text{enter}}$ | $t_{\text{exit}}$ | 结果 |
|---|---|---|---|---|---|
| $(1, 1)$ | $[1/1,\ 3/1] = [1, 3]$ | $[1/1,\ 2/1] = [1, 2]$ | $1$ | $2$ | 命中,从 $(1, 1)$ 进入,从 $(2, 2)$ 离开 |
| $(1, 0.2)$ | $[1, 3]$ | $[1/0.2,\ 2/0.2] = [5, 10]$ | $5$ | $3$ | 未命中:在 $y$ 方向进入之前,已经从 $x$ 方向离开 |
| $(-1, 1)$ | 两个值为 $-1, -3$,取 $[-3, -1]$ | $[1, 2]$ | $1$ | $-1$ | 未命中:盒子在光线 $x$ 方向的背后 |

第三行说明了为什么要取 $\min$/$\max$:$d_x < 0$ 时,$x_{\max}$ 对应的 $t$ 反而更小。

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
- 本站:[The Next Week:包围体层次结构](/rt-docs/02-tnw/03-bvh/)(用区间(interval)的写法实现 AABB 相交)
