---
title: "BVH 构建与 SAH"
order: 2
description: "从零理解包围体层次结构:自顶向下构建、表面积启发式(SAH)与分桶 SAH、扁平化布局、栈式遍历,以及它们与 Vulkan BLAS 的关系"
kind: original
---

上一篇解决了“一条光线和一个三角形 / 一个盒子怎么求交”。这一篇解决“场景里有一百万个三角形时,怎样只测其中几十个”。

## 1. 为什么需要加速结构

假设一帧 1920×1080,每像素 1 条主光线加 2 次反弹,就是约 600 万条光线。如果每条光线都和 100 万个三角形逐一求交,就是 $6 \times 10^{12}$ 次三角形测试,完全不可行。

加速结构的作用是**把“和所有物体求交”变成“和少数几个候选求交”**。思路和光栅化里的视锥剔除、层次 Z 很像:先用便宜的保守测试一次排除一大批物体。

常见的三类结构:

| 结构 | 划分对象 | 优点 | 缺点 |
|---|---|---|---|
| 均匀网格(grid) | 空间 | 构建极快,O(N) | 场景疏密不均时效果差(“体育场里的茶壶”:大部分格子是空的,茶壶全挤在一个格子里) |
| kd 树 | 空间 | 节点不重叠,可严格由近到远遍历 | 一个三角形可能出现在多个叶子里;构建和更新代价高 |
| BVH | 物体 | 每个图元只属于一个叶子;节点数有上界($2N-1$);容易局部更新(refit) | 兄弟节点的盒子可能重叠,遍历时不能完全按顺序提前停止 |

BVH 在内存可控、构建可并行、便于动态更新这几方面最适合 GPU,所以 DXR 和 Vulkan 的硬件加速结构实际上都是 BVH(具体格式由驱动决定)。

## 2. 自顶向下构建的骨架

```text
build(图元集合 S):
    box = S 中所有图元的包围盒
    if S 足够小,或继续划分不划算:
        生成叶子(记录 S)
        return
    选择一个划分,把 S 分成 L 和 R      <- 关键:怎么分
    build(L);  build(R)
```

划分步骤通常像快速排序的 partition 一样**原地重排**一个图元下标数组,这样每个节点只需要记录“从第几个开始、有几个”。

### 2.1 三种划分策略

都先求出图元**质心**的包围盒,选它最长的轴作为划分轴(SAH 会尝试所有轴),然后:

- **中点划分(midpoint)**:在质心包围盒的中点切一刀。实现最简单,但如果图元都挤在一侧,会得到一边很多、一边很少的划分。
- **中位数划分(median)**:按质心排序,前一半放左边、后一半放右边。树是平衡的,但“平衡”不等于“好”:它可能把一个大三角形和一群小三角形放在一起,产生一个大而空的盒子。
- **SAH**:估计每种划分的期望求交代价,选代价最小的。这是质量最好的通用方法,下面详细讲。

```text
质心分布:  ●●●●●●●●                              ●
中点划分:  |●●●●●●●●            |              ●|   左 8 个,右 1 个,但右边盒子很小
中位数划分:|●●●●|●●●●                         ●|   右边盒子横跨大片空区域,很多光线白白进入
```

## 3. 表面积启发式(SAH)

### 3.1 代价模型

设当前节点的包围盒为 $P$,一种划分把图元分成 $N_L$ 个和 $N_R$ 个,对应的包围盒是 $L$ 和 $R$。一条已经进入 $P$ 的光线,做完这一层的期望代价是

$$
C_{\text{split}} = C_{\text{trav}} + \frac{SA(L)}{SA(P)}\, N_L\, C_{\text{isect}} + \frac{SA(R)}{SA(P)}\, N_R\, C_{\text{isect}}
$$

而不划分、直接做叶子的代价是

$$
C_{\text{leaf}} = N\, C_{\text{isect}}
$$

其中 $C_{\text{trav}}$ 是访问一个内部节点(做盒子测试、取数据)的代价,$C_{\text{isect}}$ 是一次图元测试的代价,$SA(\cdot)$ 是包围盒的表面积。

### 3.2 为什么是“表面积之比”

关键在于 $\frac{SA(L)}{SA(P)}$ 这个比值:它是**已知光线穿过 $P$ 的前提下,光线也穿过 $L$ 的条件概率**。

这来自积分几何里的一个经典结论(Cauchy 公式):对一个凸体,从所有方向看过去的平均投影面积等于它表面积的 $1/4$。如果光线的方向和位置在空间中均匀随机分布,那么一条光线打中某个凸体的概率就正比于它的平均投影面积,也就正比于表面积。$L$ 在 $P$ 内部,所以

$$
\Pr(\text{穿过 } L \mid \text{穿过 } P) = \frac{SA(L)}{SA(P)}
$$

直观理解:**盒子越“大”(表面积越大),越容易被光线碰到,里面的图元越可能被测试**。所以 SAH 喜欢的划分是“把很多图元装进一个小盒子,把少量图元留在大盒子里”,或者“尽量切掉空白区域”。

对 AABB,表面积是

$$
SA = 2\,(e_x e_y + e_y e_z + e_z e_x)
$$

其中 $e_x, e_y, e_z$ 为三边长。

### 3.3 这个模型的假设

SAH 是一个**贪心**的局部估计,它假设:光线在空间中均匀分布、光线不会被中途挡住、左右子树都直接做成叶子。这些假设都不严格成立(主光线集中在视锥里,遮挡也很普遍),但实践证明,按它构建的树在各种场景下都很稳定。$C_{\text{trav}}$ 和 $C_{\text{isect}}$ 的比值则要根据平台调整,硬件上盒子测试相对更便宜。

## 4. 分桶 SAH(binned SAH)

精确 SAH 要在每个轴上把每个图元的边界都当作候选切分位置,并计算两侧的包围盒,朴素实现是 $O(N^2)$,排序加扫描也要 $O(N \log N)$ 每层。Wald 在 2007 年提出的**分桶**做法把候选位置限制为固定的 $K$ 个(通常 8–32),每层只需 $O(N)$:

```text
质心包围盒沿 x 轴:  lo |-----|-----|-----|-----|-----|-----|-----|-----| hi
                       bin0  bin1  bin2  bin3  bin4  bin5  bin6  bin7
1) 扫一遍图元:按质心落入的桶,累加每个桶的 计数 和 包围盒
2) 从左往右扫:得到 “前 i 个桶” 的计数和包围盒(前缀)
3) 从右往左扫:得到 “后 K-i 个桶” 的计数和包围盒(后缀)
4) K-1 个切分位置逐个代入 SAH 公式,取最小
```

图元 $i$ 落入的桶号为

$$
b_i = \min\!\left(K - 1,\ \left\lfloor K \cdot \frac{c_i - lo}{hi - lo} \right\rfloor\right)
$$

$c_i$ 是质心在该轴上的坐标。下面是一个完整的 C++ 实现,构建时直接把节点写成扁平数组(布局见第 5 节)。

```cpp
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

struct Vec3 {
    float x, y, z;
    float operator[](int i) const { return (&x)[i]; }
};
inline Vec3 vmin(Vec3 a, Vec3 b) { return {std::min(a.x, b.x), std::min(a.y, b.y), std::min(a.z, b.z)}; }
inline Vec3 vmax(Vec3 a, Vec3 b) { return {std::max(a.x, b.x), std::max(a.y, b.y), std::max(a.z, b.z)}; }

struct AABB {
    Vec3 mn{ INFINITY,  INFINITY,  INFINITY};
    Vec3 mx{-INFINITY, -INFINITY, -INFINITY};
    void grow(Vec3 p)        { mn = vmin(mn, p); mx = vmax(mx, p); }
    void grow(const AABB& b) { mn = vmin(mn, b.mn); mx = vmax(mx, b.mx); }
    float area() const {
        float ex = mx.x - mn.x, ey = mx.y - mn.y, ez = mx.z - mn.z;
        return 2.0f * (ex * ey + ey * ez + ez * ex);
    }
};

struct BVHNode {                // 32 字节,GPU 上可直接用 std430 读取
    Vec3     bmin;
    uint32_t rightOrFirst;      // 内部节点:右孩子下标;叶子:triIdx 中的起始位置
    Vec3     bmax;
    uint32_t count;             // 0 = 内部节点(左孩子固定是 self+1);>0 = 叶子中的图元数
};

constexpr int   kBins  = 16;
constexpr float kTrav  = 1.0f;   // C_trav
constexpr float kIsect = 1.0f;   // C_isect

struct Builder {
    std::vector<AABB>     primBox;     // 每个三角形的包围盒
    std::vector<Vec3>     centroid;    // 每个三角形的质心
    std::vector<uint32_t> triIdx;      // 被原地重排的图元下标
    std::vector<BVHNode>  nodes;

    struct Split { int axis = -1; int bin = 0; float lo = 0, scale = 0; float cost = INFINITY; };

    int binOf(uint32_t prim, const Split& s) const {
        int b = int((centroid[prim][s.axis] - s.lo) * s.scale);
        return std::min(b, kBins - 1);
    }

    Split findBestSplit(uint32_t first, uint32_t count) const {
        AABB cb;                                         // 质心包围盒
        for (uint32_t i = 0; i < count; ++i) cb.grow(centroid[triIdx[first + i]]);

        Split best;
        for (int axis = 0; axis < 3; ++axis) {
            float lo = cb.mn[axis], hi = cb.mx[axis];
            if (hi <= lo) continue;                      // 该轴上所有质心重合
            Split s; s.axis = axis; s.lo = lo; s.scale = kBins / (hi - lo);

            AABB binBox[kBins]; int binCnt[kBins] = {};
            for (uint32_t i = 0; i < count; ++i) {
                uint32_t p = triIdx[first + i];
                int b = binOf(p, s);
                binCnt[b]++; binBox[b].grow(primBox[p]);
            }
            // 前缀 / 后缀扫描:切在第 i 个桶之后,左边是桶 0..i,右边是桶 i+1..K-1
            float lArea[kBins - 1], rArea[kBins - 1]; int lCnt[kBins - 1], rCnt[kBins - 1];
            AABB lb, rb; int lc = 0, rc = 0;
            for (int i = 0; i < kBins - 1; ++i) {
                lc += binCnt[i];             lb.grow(binBox[i]);
                lCnt[i] = lc;                lArea[i] = lb.area();
                rc += binCnt[kBins - 1 - i]; rb.grow(binBox[kBins - 1 - i]);
                rCnt[kBins - 2 - i] = rc;    rArea[kBins - 2 - i] = rb.area();
            }
            for (int i = 0; i < kBins - 1; ++i) {
                if (lCnt[i] == 0 || rCnt[i] == 0) continue;
                float cost = lCnt[i] * lArea[i] + rCnt[i] * rArea[i];   // 未除以 SA(P)
                if (cost < best.cost) { best = s; best.bin = i; best.cost = cost; }
            }
        }
        return best;
    }

    uint32_t build(uint32_t first, uint32_t count) {
        uint32_t self = uint32_t(nodes.size());
        nodes.push_back({});
        AABB box;
        for (uint32_t i = 0; i < count; ++i) box.grow(primBox[triIdx[first + i]]);

        Split s;
        if (count > 2) s = findBestSplit(first, count);
        float leafCost  = count * kIsect;
        float splitCost = kTrav + kIsect * s.cost / box.area();     // 归一化成条件概率
        if (s.axis < 0 || splitCost >= leafCost) {                   // 划分不划算 -> 叶子
            nodes[self] = {box.mn, first, box.mx, count};
            return self;
        }
        auto begin = triIdx.begin() + first;
        auto mid = std::partition(begin, begin + count,
                                  [&](uint32_t p) { return binOf(p, s) <= s.bin; });
        uint32_t leftCount = uint32_t(mid - begin);

        build(first, leftCount);                                     // 左孩子必然是 self + 1
        uint32_t right = build(first + leftCount, count - leftCount);
        nodes[self] = {box.mn, right, box.mx, 0};
        return self;
    }
};
```

几点说明:

- **划分时用和统计时同一个 `binOf`**,而不是用一个浮点切分位置去比较,这样可以保证“统计说左边有 $N_L$ 个”和“实际分到左边的个数”严格一致,不会因舍入出现空子树。
- 只有质心包围盒参与分桶,但累加的是**图元自己的包围盒**,因为光线碰到的是图元而不是质心。
- 表面积对“未初始化的空盒子”会算出无意义的值,所以代码里跳过了 `lCnt` 或 `rCnt` 为 0 的切分。

### 4.1 什么时候停止

- 图元数很少(上例中 $\le 2$)时直接做叶子;
- SAH 认为划分不比叶子更好时做叶子,这是 SAH 自带的终止条件;
- 所有质心重合(`hi <= lo`),无论怎么分都分不开时做叶子;
- 工程上通常还会限制最大叶子大小(避免 SAH 偶尔给出一个巨大的叶子)和最大深度(GPU 遍历栈的深度是固定的)。

叶子大小是一个权衡:CPU 上 SIMD 一次能测 4–8 个三角形,叶子可以大一点;GPU 上更倾向于小叶子,硬件 BVH 甚至常常一个叶子只放 1–2 个三角形。

## 5. 扁平化:把树变成数组

GPU 上没有指针,树必须存成连续数组。上面的构建代码采用**深度优先顺序**:

```text
          [0] 根                     数组下标:  0     1     2     3     4
         /    \                                根    A     L1    L2    B
      [1] A    [4] B (叶子)          A 是内部节点:左孩子 = 1+1 = 2,rightOrFirst = 3
     /    \                          根的 rightOrFirst = 4
  [2] L1  [3] L2 (叶子)              叶子:rightOrFirst = 图元起点,count = 图元数
```

- 内部节点的**左孩子总是紧跟在自己后面**(`self + 1`),所以只需要存右孩子下标;
- 叶子复用同一个字段存“图元在 `triIdx` 中的起点”,再用 `count > 0` 区分叶子和内部节点;
- 每个节点 32 字节,两个节点正好 64 字节,和常见的缓存行大小一致;
- 还有一个附带的好处:**父节点下标总是小于子节点**,下面的 refit 会用到这一点。

另一种常见布局是让左右孩子相邻存放、节点只记左孩子下标(右孩子 = 左孩子 + 1),这样两个孩子的数据可以一次读入。两种布局都很常见,本站 [The Next Week:BVH](/raytracing/02-tnw-bvh/01-bvh/) 那一篇则使用了带指针的树。

## 6. 栈式有序遍历

遍历的核心思想:**先进入较近的孩子,把较远的孩子压栈**;找到命中后 $t_{\max}$ 缩小,弹栈时如果远孩子的入口距离已经比当前命中还远,就直接丢弃。

下面是 GLSL 写法(例如在 compute shader 中做软件光追)。`intersectAABB` 与上一篇的平板测试相同,未命中返回一个很大的值;`intersectTriangle` 命中更近的交点时更新 `hit`。

```glsl
struct BVHNode { vec3 bmin; uint rightOrFirst; vec3 bmax; uint count; };  // std430 下正好 32 字节
layout(std430, binding = 0) readonly buffer Nodes  { BVHNode nodes[]; };
layout(std430, binding = 1) readonly buffer TriIdx { uint    triIdx[]; };

const float NO_HIT = 1e30;

void traceClosest(vec3 orig, vec3 dir, float tMin, inout float tHit, inout uint primHit)
{
    vec3 invDir = 1.0 / dir;
    uint  stackNode[32];
    float stackT[32];
    int   sp = 0;

    uint node = 0;
    if (intersectAABB(orig, invDir, nodes[0].bmin, nodes[0].bmax, tMin, tHit) == NO_HIT) return;

    while (true) {
        BVHNode n = nodes[node];
        if (n.count > 0) {                                     // 叶子:逐个测试三角形
            for (uint i = 0; i < n.count; ++i)
                intersectTriangle(orig, dir, triIdx[n.rightOrFirst + i], tMin, tHit, primHit);
        } else {                                               // 内部节点:测两个孩子
            uint  a = node + 1, b = n.rightOrFirst;
            float ta = intersectAABB(orig, invDir, nodes[a].bmin, nodes[a].bmax, tMin, tHit);
            float tb = intersectAABB(orig, invDir, nodes[b].bmin, nodes[b].bmax, tMin, tHit);
            if (ta > tb) { float t = ta; ta = tb; tb = t; uint x = a; a = b; b = x; }
            if (ta != NO_HIT) {
                if (tb != NO_HIT) { stackNode[sp] = b; stackT[sp] = tb; ++sp; }
                node = a;                                      // 先走近的
                continue;
            }
        }
        // 弹栈;跳过入口已经比当前命中更远的节点
        do {
            if (sp == 0) return;
            --sp;
        } while (stackT[sp] >= tHit);
        node = stackNode[sp];
    }
}
```

要点:

- 栈深度 32 对于由 SAH 构建、几百万三角形的树一般够用,但构建时最好限制深度,或者遍历时加越界保护。
- `tHit` 一开始就是光线的 $t_{\max}$;一旦命中就变小,后续所有盒子测试都用新的 $t_{\max}$ 剪枝。这正是“先走近的孩子”能省时间的原因。
- 在 GPU 上,同一个 wave 里不同光线走的路径不同,会造成分支发散。硬件光追把这些都藏到了驱动和固定功能单元里,软件实现则要靠光线排序、短栈等技巧缓解。

### 6.1 阴影光线:找到任意一个命中就退出

阴影光线只关心“光源和着色点之间有没有遮挡”,不关心是谁挡住的。所以叶子里只要有一个三角形在 $(t_{\min}, t_{\text{light}})$ 内命中,就可以**立刻返回**,不需要继续找最近的:

```glsl
bool occluded(vec3 orig, vec3 dir, float tMin, float tLight)
{
    // 与 traceClosest 结构相同,只是叶子里改成:
    //   if (hitTriangle(orig, dir, triIdx[n.rightOrFirst + i], tMin, tLight)) return true;
    // 并且可以不按远近排序孩子(排序仍可能略有帮助,但不再是必须)
    ...
    return false;
}
```

这对应 Vulkan 中的光线标志 `gl_RayFlagsTerminateOnFirstHitEXT`。对于阴影这类“可见性查询”,提前退出可以明显减少需要访问的节点数。

## 7. 动态场景:refit 还是 rebuild

物体变形(蒙皮角色、布料)后,三角形位置变了,BVH 必须更新。两种选择:

- **refit(重新拟合)**:树的拓扑不变,只从叶子往上重新计算包围盒。在深度优先布局下,父节点下标总小于子节点,所以**倒序遍历数组**就能保证先处理孩子再处理父亲,$O(N)$ 且非常快:

```cpp
void refit(Builder& bvh) {      // 调用前先用新的顶点位置更新 bvh.primBox
    for (int i = int(bvh.nodes.size()) - 1; i >= 0; --i) {
        BVHNode& n = bvh.nodes[i];
        AABB box;
        if (n.count > 0) {
            for (uint32_t k = 0; k < n.count; ++k) box.grow(bvh.primBox[bvh.triIdx[n.rightOrFirst + k]]);
        } else {
            const BVHNode& l = bvh.nodes[i + 1];
            const BVHNode& r = bvh.nodes[n.rightOrFirst];
            box.grow(l.bmin); box.grow(l.bmax); box.grow(r.bmin); box.grow(r.bmax);
        }
        n.bmin = box.mn; n.bmax = box.mx;
    }
}
```

- **rebuild(重新构建)**:从头建一棵新树。慢,但质量最好。

refit 的问题在于:变形幅度大时(例如角色把手臂从身体一侧甩到另一侧),原来空间上相邻的图元分开了,盒子会被拉得很大、互相重叠,遍历变慢。常见策略是平时 refit,每隔若干帧或检测到质量下降时 rebuild。

## 8. 与 Vulkan 硬件 BLAS 的关系

在 Vulkan 中,你不会亲手写上面的构建代码。对应关系如下:

| 本文概念 | Vulkan 中的对应物 |
|---|---|
| 对三角形构建 BVH | 构建底层加速结构(BLAS):`vkCmdBuildAccelerationStructuresKHR`,几何类型为 `VK_GEOMETRY_TYPE_TRIANGLES_KHR` |
| 节点数组的大小和格式 | 不透明:只能用 `vkGetAccelerationStructureBuildSizesKHR` 查询需要多少内存和暂存缓冲区(scratch buffer) |
| 侧重构建质量 / 构建速度 | `VK_BUILD_ACCELERATION_STRUCTURE_PREFER_FAST_TRACE_BIT_KHR` / `..._PREFER_FAST_BUILD_BIT_KHR` |
| refit | 用 `VK_BUILD_ACCELERATION_STRUCTURE_ALLOW_UPDATE_BIT_KHR` 构建,之后以 `VK_BUILD_ACCELERATION_STRUCTURE_MODE_UPDATE_KHR` 模式更新(图元数量和拓扑不能变) |
| 建好后缩小内存 | 压缩(compaction):`ALLOW_COMPACTION` 标志 + 查询压缩后大小 + `vkCmdCopyAccelerationStructureKHR` |
| 对物体再建一层 BVH | 顶层加速结构(TLAS):叶子是实例(BLAS 引用 + 变换矩阵),通常每帧重建 |

驱动内部做的事和本文一样,只是更复杂:用 compute shader 在 GPU 上并行构建(常见的有基于莫顿码排序的 LBVH/PLOC 类算法,再配合 SAH 优化),树通常是 4 叉、6 叉或 8 叉的宽 BVH,节点经过量化压缩,以匹配硬件一次测试多个盒子的能力。以 AMD 为例,开源驱动中负责 BVH 构建和遍历的是 GPURT 库(GPUOpen-Drivers/gpurt)。

两层结构(TLAS + BLAS)的意义也可以用 BVH 的语言解释:实例移动时只需要重建一棵以实例包围盒为图元的小树(TLAS),而包含数百万三角形的 BLAS 保持不变;同一个 BLAS 被多次实例化时也只存一份。

## 自测问题

1. SAH 公式中的 $\frac{SA(L)}{SA(P)}$ 表示什么?它基于什么假设?
2. 为什么“中位数划分”得到的平衡树不一定是好树?请举一个例子。
3. 分桶 SAH 每层的复杂度是多少?前缀 / 后缀扫描解决了什么问题?
4. 在本文的深度优先扁平布局中,为什么倒序遍历节点数组就能正确 refit?
5. 阴影光线为什么可以提前退出?在 Vulkan 中对应哪个标志?

<details>
<summary>参考答案</summary>

1. 已知光线穿过父盒子 $P$ 时,它也穿过子盒子 $L$ 的条件概率。依据是:在光线方向和位置均匀分布的假设下,光线打中一个凸体的概率正比于它的表面积(Cauchy 公式)。此外还假设光线不被遮挡、子节点直接作为叶子。
2. 平衡只说明两边图元个数相同,不说明盒子小。例如一侧是一个很大的地面三角形加几个远处的小物体,中位数划分可能把它们放进同一个盒子,这个盒子几乎覆盖整个场景,大量光线都要进入它测试那些小物体。
3. $O(N + K)$:一次扫描统计每个桶,然后对 $K$ 个桶做前后两次扫描。如果没有前缀 / 后缀扫描,每个候选切分位置都要重新合并一遍桶的包围盒,变成 $O(K^2)$。
4. 构建时先分配父节点,再递归构建孩子,所以孩子的下标总是大于父节点。倒序遍历时,处理父节点之前它的两个孩子都已经更新过。
5. 阴影只需要判断“是否存在遮挡”,不需要知道最近的遮挡物,所以找到任意一个合法命中即可返回。Vulkan 中对应 `gl_RayFlagsTerminateOnFirstHitEXT`(通常还会配合 `gl_RayFlagsSkipClosestHitShaderEXT` 或 Ray Query)。

</details>

## 延伸阅读

- Jacco Bikker,[How to build a BVH 系列](https://jacco.ompf2.com/2022/04/13/how-to-build-a-bvh-part-1-basics/)(从基础到分桶 SAH、refit、TLAS、GPU 遍历的完整系列)
- Pharr, Jakob, Humphreys,PBR Book 第 4 版:[Bounding Volume Hierarchies](https://pbr-book.org/4ed/Primitives_and_Intersection_Acceleration/Bounding_Volume_Hierarchies)
- Ingo Wald,《On fast Construction of SAH-based Bounding Volume Hierarchies》,IEEE Symposium on Interactive Ray Tracing, 2007(分桶 SAH 的出处)
- 本站:[The Next Week:BVH](/raytracing/02-tnw-bvh/01-bvh/)
- 本站:[光线与三角形 / AABB 相交](/raytracing/05-notes/01-ray-triangle-intersection/)
