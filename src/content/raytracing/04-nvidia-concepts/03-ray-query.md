---
title: "3. Ray Query 教程(16 Ray Query)"
order: 3
description: "在计算着色器中用光线查询(Ray Query)实现蒙特卡洛路径追踪,并介绍阴影终结线修正、法线对齐以及光线查询与光线追踪管线的取舍。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/raytrace_tutorial/16_ray_query/README.md"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · 16 Ray Query - Tutorial"
license: "Apache-2.0"
---

![16 Ray Query 蒙特卡洛路径追踪结果](/raytracing/nvidia/16.png)

本教程演示如何在计算着色器中使用 Vulkan 的光线查询(Ray Query)扩展实现**蒙特卡洛路径追踪(Monte Carlo path tracing)**,作为传统光线追踪管线之外的另一种选择。光线查询提供内联(inline)光线追踪能力,可以在单个着色器内以过程式的方式控制光线的处理,这对某些算法思路以及统一着色器架构很有好处。

**本教程实现了一个相当完善的蒙特卡洛路径追踪器**,支持基于物理的材质、多种光源类型,并采用了一些高级技术来处理低细分几何体和阴影瑕疵。

## 相对于 02_basic.cpp 的主要改动

### 1. Vulkan 扩展需求

**新增:光线查询扩展**

本教程需要 `VK_KHR_RAY_QUERY_EXTENSION_NAME` 扩展,才能在计算着色器中使用光线查询:

```cpp
// In main() function - Vulkan context setup
VkPhysicalDeviceRayQueryFeaturesKHR rayqueryFeature{
    VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_RAY_QUERY_FEATURES_KHR
};

nvvk::ContextInitInfo vkSetup{
    .deviceExtensions = {
        {VK_KHR_RAY_QUERY_EXTENSION_NAME, &rayqueryFeature},  // Enable ray queries in compute shaders
        // ... other extensions
    },
};
```

**注意**:光线查询所需的底层硬件加速与传统光线追踪管线相同(在支持的 GPU 上即 RT Core),只是提供了不同的编程接口。

### 2. 着色器架构的改动

**修改:`shaders/ray_query.slang`**

- 用使用内联光线查询的计算着色器取代光线追踪管线
- 使用 `RayQuery<>` 对象手动完成光线与场景的求交
- 直接控制光线的处理和负载(payload)的处理

```glsl
// Traditional RT Pipeline (02_basic)
[shader("raygeneration")]
void rayGenMain() {
    TraceRay(topLevelAS, rayFlags, 0xff, 0, 0, 0, ray, payload);
}

// Ray Query Approach (16_ray_query)
[numthreads(16, 16, 1)]
void computeMain(uint3 launchID : SV_DispatchThreadID) {
    RayQuery<RAY_FLAG_NONE> q;
    q.TraceRayInline(topLevelAS, RAY_FLAG_NONE, 0xFF, ray);
    // Manual intersection processing...
}
```

### 3. 管线架构的改动

**修改:`16_ray_query.cpp`**

- 用计算管线的创建取代光线追踪管线的创建
- 去掉了着色器绑定表(SBT)的管理
- 用 `vkCmdDispatch` 代替 `vkCmdTraceRaysKHR`,简化了调度(dispatch)

### 4. 对光线处理的控制

**增强:手动处理交点**

- 直接控制光线与几何体的相交测试
- 自定义负载处理,不受着色器阶段的限制
- 灵活地决定光线是继续还是终止

## 工作原理

光线查询在计算着色器内部提供内联光线追踪,开发者可以:

1. **初始化光线查询**:用特定的标志创建一个 `RayQuery<>` 对象
2. **追踪光线**:调用 `TraceRayInline()` 开始相交测试
3. **处理交点**:手动遍历可能的命中
4. **提取数据**:直接访问交点信息和几何数据

它的主要优势在于**过程式控制**:所有逻辑都包含在单个计算着色器中,而不必依赖独立的光线生成着色器(raygen)、最近命中着色器(closest-hit)和未命中着色器(miss)。这样可以在单个着色器内进行显式控制,对于那些受益于统一控制流的算法,实现起来会更简单。

## 蒙特卡洛路径追踪的实现

本教程实现的蒙特卡洛路径追踪器具有以下高级特性:

不熟悉 BRDF、BSDF、PDF、NEE 或 MIS 这些缩写?请阅读[通俗易懂的渲染指南](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/concepts/rendering.md)。

### 路径追踪的主要特性

- 带**重要性采样**的**单向路径追踪**
- **基于物理的材质**(PBR 金属度-粗糙度工作流)
- **多种光源类型**(方向光、点光源、聚光灯),并带有正确的衰减
- **程序化天空系统**,模拟太阳和大气
- 用**俄罗斯轮盘赌**(Russian roulette)终止路径,保证渲染无偏
- **时间累积(temporal accumulation)**,逐步细化画面
- **萤火虫钳制(firefly clamping)**,减少噪点瑕疵

### 路径追踪的工作方式

路径追踪通过以下方式模拟光在场景中的弹射:

1. 从相机出发,穿过每个像素**发射光线**
2. 在光线从表面弹开时**追随光的路径**
3. 在每次弹射时**对光源采样**以计算光照
4. 把大量采样的**结果累积起来**以减少噪点
5. **利用随机性**探索不同的光路,得到逼真的结果

### 路径追踪算法

```glsl
// Main path tracing loop with multiple bounces
for(int depth = 0; depth < maxDepth; depth++) {
    // Cast ray and get intersection
    traceRay(ray, payload);
    
    if(payload.hitT == INFINITE) {
        // Environment hit - sample sky or background
        return radiance + (envColor * throughput);
    }
    
    // Next Event Estimation - direct lighting
    if(nextEventValid) {
        // Evaluate BSDF for direct lighting
        bsdfEvaluateSimple(evalData, pbrMat);
        contrib += w * evalData.bsdf_diffuse + w * evalData.bsdf_glossy;
    }
    
    // BSDF Sampling - generate next ray direction
    bsdfSampleSimple(sampleData, pbrMat);
    throughput *= sampleData.bsdf_over_pdf;
    
    // Russian Roulette - probabilistic path termination
    float rrPcont = min(max(throughput.x, max(throughput.y, throughput.z)) + 0.001F, 0.95F);
    if(rand(seed) >= rrPcont) break;
    throughput /= rrPcont;
}
```

![路径追踪累积收敛的结果](/raytracing/nvidia/16_pt.png)

> **译注**:代码中的 `throughput`(通量)表示这条路径到目前为止的累计衰减。俄罗斯轮盘赌以概率 `rrPcont` 让路径继续,存活下来的路径再除以 `rrPcont` 做补偿,因此期望值不变(无偏),同时又能提前结束贡献很小的路径。

### 性能优化

- **内联光线查询**可能减少着色器绑定表带来的开销(性能影响因具体用例而异)
- 使用俄罗斯轮盘赌**提前终止路径**
- **优化的 BSDF 采样**与求值
- 使用 xxhash **高效生成随机数**
- 使用提前终止标志**优化阴影光线**

## 低细分几何体与阴影终结线问题的修正

### 问题

低细分(low tessellated)几何体会在光线追踪中造成几类视觉瑕疵:

- **阴影终结线(shadow terminator)瑕疵**:阴影与插值后的法线对不上
- 背向表面上的**内部反射瑕疵**
- 三角形边界处的**光照不连续**
- 几何法线与着色法线之间的**法线朝向不一致**

### 解决方案:Shadow Terminator Hacking

着色器实现了 Johannes Hanika 提出的 “shadow terminator hacking” 技术来解决这些问题:

```glsl
// Adjust shadow ray origin to match interpolated normals
float3 shadowPos = pointOffset(posObj, pos0, pos1, pos2, nrm0, nrm1, nrm2, barycentrics);
hit.shadowPos = float3(mul(float4(shadowPos, 1.0), objectToWorld4x3));
```

这项技术会调整阴影光线的起点,让阴影与插值后的表面法线更好地吻合,从而减少低多边形几何体上的视觉瑕疵。

| 使用修正 | 不使用修正 |
| --- | --- |
|![使用阴影终结线修正](/raytracing/nvidia/16_termin_1.png) | ![不使用阴影终结线修正](/raytracing/nvidia/16_termin_2.png) |

### 几何法线与着色法线的对齐

着色器对法线做了细致的处理,以避免光照瑕疵:

```glsl
// Calculate geometric normal from triangle edges (face normal)
float3 geonrmObj = normalize(cross(pos1 - pos0, pos2 - pos0));
hit.geonrm = normalize(mul(float4(geonrmObj, 0.0), objectToWorld4x3).xyz);

// Ensure geometric normal faces towards the ray origin (front-facing)
if(dot(hit.geonrm, worldRayDirection) > 0.0f)
    hit.geonrm = -hit.geonrm;

// Ensure shading normal and geometric normal are on the same side
if(dot(hit.geonrm, hit.nrm) < 0) {
    hit.nrm = -hit.nrm;  // Flip shading normal to match geometric normal
}

// For low-tessellated geometry, prevent internal reflection artifacts
float3 r = reflect(normalize(worldRayDirection), hit.nrm);
if(dot(r, hit.geonrm) < 0)
    hit.nrm = hit.geonrm;
```

| 使用对齐 | 不使用对齐 |
| --- | --- |
|![使用几何法线/着色法线对齐](/raytracing/nvidia/16_geo_1.png) | ![不使用几何法线/着色法线对齐](/raytracing/nvidia/16_geo_2.png) |

### 这种做法的好处

- **缓解**低多边形模型上的**阴影终结线瑕疵**
- **减少**背向表面上的**内部反射**
- **有助于**在三角形边界之间**保持光照一致**
- **无需提高细分程度**就**能改善画面质量**
- **兼容现有资源**,无需修改几何体

## 光线查询的特点

### 性能方面的考虑

- **可能减少开销**:可能省去部分着色器绑定表查找和着色器阶段之间的切换(需要针对你的具体用例做基准测试)
- **缓存局部性的权衡**:把逻辑合并到一个着色器中,在简单情况下可能改善缓存局部性,但对于复杂的着色器,可能会增加指令缓存的压力
- **简化的管线**:管线状态切换和着色器阶段更少

### 开发方面的特点

- **统一控制**:所有光线追踪逻辑集中在一处,在某些用例下可以简化调试
- **控制流**:在单个着色器内进行显式的过程式控制,而不是在管线的各个阶段之间切换

## 取舍:光线查询与传统光线追踪管线

光线查询和传统光线追踪管线都是可行的方案,只是实现上的特点不同:

### 更适合使用光线查询的场合:

- **集成到现有的计算 / 片段 / 网格着色器中**,逐步引入光线追踪功能
- **统一着色器架构**:由单个计算着色器通过显式分支逻辑处理所有材质情况
- **需要在单个着色器上下文中进行显式过程式控制的算法**
- **教学 / 研究用途的实现**:逐步控制光线有助于理解
- **原型设计与实验**:需要快速迭代光线处理逻辑
- **简单到中等复杂度的场景**:统一的做法不会让着色器变得过于复杂

### 更适合使用传统光线追踪管线的场合:

- **模块化的材质系统**:不同材质可以从专门优化的着色器中受益
- **着色器特化**:针对特定材质类型做编译期优化
- **高级光线追踪功能**:例如着色器执行重排序(SER)以及其他针对特定硬件的优化
- **行业标准的工作流程**,以及与成熟工具链的集成
- **包含多种材质类型的复杂场景**:着色器的模块化可以避免过多的分支
- **内存高效的负载处理**:可以为每种光线类型使用专门的负载
- **大型团队 / 代码库**:着色器模块化和关注点分离很重要
- **正式的渲染器产品**:驱动优化和成熟的模式能提供经过验证的性能

### 重要说明:

- **性能**:实际的性能差异在很大程度上取决于具体用例、硬件和实现细节
- **动态材质**:光线查询在单个着色器中使用运行时分支,而光线追踪管线可以使用超级着色器(ubershader)或动态选择着色器
- **复杂度**:“最佳”选择往往取决于你的具体需求、团队的经验以及现有的代码库

## 技术细节

### 如何用光线查询追踪一条光线

**1. 初始化光线查询**

```glsl
RayQuery<RAY_FLAG_NONE> q;  // Create ray query object
RayDesc ray = { origin, tMin, direction, tMax };  // Define ray
q.TraceRayInline(topLevelAS, RAY_FLAG_NONE, 0xFF, ray);  // Start tracing
```

**2. 处理交点**

```glsl
// For scenes with only opaque geometry:
while(q.Proceed()) {}  // Empty loop - opaque triangles auto-commit

// For scenes with mixed opaque/non-opaque geometry:
while(q.Proceed()) {
    if(q.CandidateType() == CANDIDATE_NON_OPAQUE_TRIANGLE) {
        // Force non-opaque triangles to be opaque (simplified alpha handling)
        q.CommitNonOpaqueTriangleHit();
    }
    // Note: CANDIDATE_TRIANGLE (opaque) is automatically committed
}

// After the loop completes, check the final committed status
if(q.CommittedStatus() == COMMITTED_TRIANGLE_HIT) {
    // Ray hit geometry - now we can extract intersection data
    float hitT = q.CommittedRayT();
    int instanceIndex = q.CommittedInstanceIndex();
    // Process the hit...
}
```

> **译注**:`Proceed()` 每返回一次 `true`,就表示遍历过程中遇到了一个需要着色器决定的“候选”命中(例如非不透明三角形);不透明三角形会被硬件自动提交(commit)。循环结束后,`Committed*()` 系列函数给出的就是最终确定的最近命中。

**3. 提取交点信息**

```glsl
if(q.CommittedStatus() == COMMITTED_TRIANGLE_HIT) {
    // Get basic intersection data
    float hitT = q.CommittedRayT();
    int instanceIndex = q.CommittedInstanceIndex();
    
    // Get barycentric coordinates for interpolation
    float2 barycentrics = q.CommittedTriangleBarycentrics();
    
    // Get geometry data
    float3 worldPos = ray.origin + ray.direction * hitT;
    float3 normal = /* interpolate from vertex normals */;
    
    // Access material data using instance index
    MaterialData material = materials[instanceIndex];
}
```

## 下一步

- **降噪**:加入时间 / 空间降噪,降低对采样数的要求
- **体积效果**:扩展到参与介质(participating media)和大气效果
- **高级材质**:实现次表面散射或各向异性 BRDF
- **性能**:针对你的具体用例,对光线查询和传统光线追踪管线做基准测试,以确定最佳方案

## 参考资料

1. Hanika, Johannes. "Hacking the shadow terminator." *Computer Graphics Forum*, 2021. [https://jo.dreggn.org/home/2021_terminator.pdf](https://jo.dreggn.org/home/2021_terminator.pdf)

2. Vulkan Ray Query Extension. "VK_KHR_ray_query." *Khronos Vulkan Specification*. [https://registry.khronos.org/vulkan/specs/latest/man/html/VK_KHR_ray_query.html](https://registry.khronos.org/vulkan/specs/latest/man/html/VK_KHR_ray_query.html)
