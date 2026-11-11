---
title: "Vulkan 光线追踪:Ray Query 与光追管线"
order: 3
description: "Vulkan 硬件光追的三个扩展、加速结构、光追管线(着色器阶段、traceRayEXT、SBT)与 Ray Query 的工作方式及取舍"
kind: original
---

前两篇讲的都是“自己写遍历”。在 Vulkan 里,加速结构的构建和遍历交给驱动与硬件,应用只需要决定**从哪里发光线**和**命中之后做什么**。Vulkan 为此提供了两种编程模型:光线追踪管线(ray tracing pipeline)和光线查询(Ray Query)。这篇笔记把两者放在一起对比。

## 1. 三个扩展,各管一摊

```text
                 VK_KHR_acceleration_structure
                 (建 BLAS/TLAS、描述符类型、拷贝/压缩/序列化)
                   /                          \
VK_KHR_ray_tracing_pipeline              VK_KHR_ray_query
(新的管线类型 + 6 种着色器阶段          (任意着色器阶段里的
 + SBT + vkCmdTraceRaysKHR)              rayQueryEXT 对象)
```

- **`VK_KHR_acceleration_structure`**:基础。提供 `VkAccelerationStructureKHR` 对象、构建命令 `vkCmdBuildAccelerationStructuresKHR`、尺寸查询 `vkGetAccelerationStructureBuildSizesKHR`、描述符类型 `VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_KHR`。它依赖 `VK_KHR_deferred_host_operations`,并要求缓冲区设备地址(buffer device address)和描述符索引(descriptor indexing)(Vulkan 1.2 起都是核心功能)。
- **`VK_KHR_ray_tracing_pipeline`**:光追管线。依赖加速结构扩展和 `VK_KHR_spirv_1_4`(后者又依赖 `VK_KHR_shader_float_controls`)。
- **`VK_KHR_ray_query`**:Ray Query。同样依赖加速结构扩展和 `VK_KHR_spirv_1_4`,但**不依赖**光追管线扩展。

两个“使用”扩展可以只开一个,也可以都开。创建设备时还要在 `pNext` 链上打开对应的特性:

| 特性结构体 | 需要打开的成员 |
|---|---|
| `VkPhysicalDeviceBufferDeviceAddressFeatures` | `bufferDeviceAddress` |
| `VkPhysicalDeviceAccelerationStructureFeaturesKHR` | `accelerationStructure` |
| `VkPhysicalDeviceRayTracingPipelineFeaturesKHR` | `rayTracingPipeline`(用管线时) |
| `VkPhysicalDeviceRayQueryFeaturesKHR` | `rayQuery`(用 Ray Query 时) |

因为整套 API 大量使用 GPU 虚拟地址(顶点缓冲区、实例数组、SBT、暂存缓冲区都用 `VkDeviceAddress` 传入),相关缓冲区需要带 `VK_BUFFER_USAGE_SHADER_DEVICE_ADDRESS_BIT`,分配内存时也要带 `VK_MEMORY_ALLOCATE_DEVICE_ADDRESS_BIT`。着色器需要编译成 SPIR-V 1.4 或更高版本(例如 `glslangValidator --target-env vulkan1.2`)。

## 2. 加速结构:BLAS、TLAS 与实例

两种编程模型共享同一套加速结构:

```text
TLAS(顶层)
 ├─ 实例 0: transform(3x4), instanceCustomIndex, mask, sbtRecordOffset, flags ──> BLAS A(汽车)
 ├─ 实例 1: 另一个 transform ................................................──> BLAS A(同一辆车,另一个位置)
 └─ 实例 2: ..................................................................──> BLAS B(地面)

BLAS(底层):一个或多个几何体(geometry),每个是一组三角形或一组 AABB
```

- **BLAS** 存几何:三角形(顶点 / 索引缓冲区的设备地址)或 AABB(用于程序化几何,配合相交着色器)。
- **TLAS** 存实例:每个 `VkAccelerationStructureInstanceKHR` 包含一个 3×4 变换矩阵、24 位的 `instanceCustomIndex`(着色器里读到的自定义编号)、8 位的 `mask`(和光线的剔除掩码做按位与)、24 位的 `instanceShaderBindingTableRecordOffset`(只有光追管线用,决定命中组)、`flags`(例如关闭背面剔除、强制不透明)以及 BLAS 的设备地址。
- 在着色器中,TLAS 作为 `uniform accelerationStructureEXT` 描述符出现,两种模型的写法相同。

BLAS 内部就是上一篇讲的 BVH,只是格式由驱动决定。构建细节见本站 [NVIDIA 概念详解:加速结构](/raytracing/04-nvidia-concepts/01-acceleration-structures/)。

## 3. 光追管线

### 3.1 六种着色器阶段

| 阶段 | GLSL 扩展名 | 何时运行 | 典型工作 |
|---|---|---|---|
| 光线生成(raygen) | `.rgen` | `vkCmdTraceRaysKHR` 的每个启动点运行一次,类似 compute 的一个线程 | 根据 `gl_LaunchIDEXT` 生成主光线,调用 `traceRayEXT`,把结果写入图像 |
| 未命中(miss) | `.rmiss` | 光线没有命中任何东西 | 返回天空色;阴影光线里把“被遮挡”标记清掉 |
| 最近命中(closest-hit) | `.rchit` | 遍历结束后,对最近的已接受命中运行一次 | 取顶点数据、插值、算材质和光照,可再发次级光线 |
| 任意命中(any-hit) | `.rahit` | 遍历中每遇到一个**非不透明**的候选命中 | alpha 测试:`ignoreIntersectionEXT` 丢弃,或 `terminateRayEXT` 结束遍历 |
| 相交(intersection) | `.rint` | 光线进入 AABB 几何的包围盒时 | 自己计算与球、曲线等程序化几何的交点,用 `reportIntersectionEXT` 报告 |
| 可调用(callable) | `.rcall` | 被 `executeCallableEXT` 显式调用 | 类似“按下标调用的函数”,用来做材质分派等 |

`traceRayEXT` 只能在光线生成、最近命中和未命中着色器中调用;每多嵌套一层就是一层递归,最大层数由创建管线时的 `maxPipelineRayRecursionDepth` 指定(不能超过设备属性 `maxRayRecursionDepth`)。最近命中、任意命中、相交着色器组合成一个**命中组(hit group)**;光线生成、未命中、可调用着色器各自单独成组(“general” 组)。

### 3.2 traceRayEXT 的参数

```glsl
traceRayEXT(
    accelerationStructureEXT topLevel,  // TLAS
    uint  rayFlags,          // gl_RayFlagsOpaqueEXT、gl_RayFlagsTerminateOnFirstHitEXT、
                             // gl_RayFlagsSkipClosestHitShaderEXT、gl_RayFlagsCullBackFacingTrianglesEXT ...
    uint  cullMask,          // 只取低 8 位;(instance.mask & cullMask) == 0 的实例被跳过
    uint  sbtRecordOffset,   // 命中组下标公式里的偏移
    uint  sbtRecordStride,   // 命中组下标公式里“每个几何体”的步长
    uint  missIndex,         // 用 miss 区域里的第几条记录
    vec3  origin, float tMin,
    vec3  direction, float tMax,
    int   payload);          // 负载变量的 location(编译期常量)
```

命中时使用哪条命中组记录,由下面的公式决定:

$$
\text{hitIndex} = \text{instanceSBTOffset} + \text{sbtRecordOffset} + \text{geometryIndex} \times \text{sbtRecordStride}
$$

记录地址 = `pHitShaderBindingTable->deviceAddress + hitIndex * stride`。未命中时使用 `pMissShaderBindingTable->deviceAddress + missIndex * stride`。

一个常见用法:每个几何体有两条命中记录(“主光线用的”和“阴影光线用的”),那么 `sbtRecordStride = 2`,主光线用 `sbtRecordOffset = 0`,阴影光线用 `sbtRecordOffset = 1`。

### 3.3 负载(payload)

着色器阶段之间通过负载传数据。调用方声明 `rayPayloadEXT`,被调用的 miss / closest-hit / any-hit 声明 `rayPayloadInEXT`,二者用 `traceRayEXT` 最后一个参数里的 location 对应起来。三角形命中的重心坐标则通过 `hitAttributeEXT vec2` 传给命中组里的着色器。负载越大,每条光线需要保存的状态越多,对占用率和寄存器压力越不利,所以尽量保持小巧。

### 3.4 着色器绑定表(SBT)

光追管线最大的“新东西”是 SBT:一块由应用自己填写的 GPU 缓冲区,告诉硬件“第 i 种情况调用哪个着色器组”。

```text
SBT 缓冲区(用设备地址引用)
  raygen 区域:  [ handle | (可选数据) ]                      size 必须等于 stride
  miss 区域:    [ handle 主光线 ][ handle 阴影光线 ]          stride = 对齐后的记录大小
  hit 区域:     [ 命中组 0 ][ 命中组 1 ][ ... ]
  callable 区域:[ ... ](可选,没有就传全 0 的区域)

记录 = 着色器组句柄(shaderGroupHandleSize 字节,来自 vkGetRayTracingShaderGroupHandlesKHR)
       + 应用自定义数据(可选,着色器里用 shaderRecordEXT 读取)
```

对齐规则(都来自 `VkPhysicalDeviceRayTracingPipelinePropertiesKHR`):

- 每个区域的起始地址按 `shaderGroupBaseAlignment` 对齐;
- `stride` 是 `shaderGroupHandleAlignment` 的倍数,且不超过 `maxShaderGroupStride`;
- raygen 区域只有一条记录,`size` 必须等于 `stride`。

发射光线时把四个区域交给 `vkCmdTraceRaysKHR`:

```cpp
vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_RAY_TRACING_KHR, rtPipeline);
vkCmdBindDescriptorSets(cmd, VK_PIPELINE_BIND_POINT_RAY_TRACING_KHR, layout, 0, 1, &set, 0, nullptr);
vkCmdTraceRaysKHR(cmd,
                  &raygenRegion,    // VkStridedDeviceAddressRegionKHR{deviceAddress, stride, size}
                  &missRegion,
                  &hitRegion,
                  &callableRegion,  // 不用就传 {}
                  width, height, 1);
```

SBT 的详细布局和填写步骤见本站 [NVIDIA 概念详解:着色器绑定表](/raytracing/04-nvidia-concepts/02-shader-binding-table/)。

## 4. Ray Query

Ray Query 走的是另一条路:**不需要新的管线类型,也不需要 SBT**。任何着色器阶段(compute、fragment、vertex,甚至光追管线里的着色器)都可以声明一个 `rayQueryEXT` 对象,自己驱动遍历:

```text
rayQueryInitializeEXT(q, tlas, flags, cullMask, origin, tMin, dir, tMax)
          |
          v
   +-> rayQueryProceedEXT(q) ----- false ----> 遍历结束:读 committed(已提交)结果
   |          | true
   |          v
   |   有一个 candidate(候选)需要着色器裁决:
   |     - 非不透明三角形 -> 自己做 alpha 测试,通过则 rayQueryConfirmIntersectionEXT(q)
   |     - AABB          -> 自己算交点,命中则 rayQueryGenerateIntersectionEXT(q, t)
   +----------+
```

关键概念是 **candidate(候选)** 与 **committed(已提交)**:

- `rayQueryProceedEXT` 返回 `true` 表示遍历暂停,有一个候选等你决定。不透明三角形不会走到这里,硬件会自动提交它们。
- 你确认(confirm)或生成(generate)后,它成为新的 committed 交点,$t_{\max}$ 也随之缩小。
- 所有 `rayQueryGetIntersection*EXT(q, committed)` 函数都有一个 `bool committed` 参数:`false` 读候选,`true` 读已提交的结果。例如 `rayQueryGetIntersectionTypeEXT(q, true)` 返回 `gl_RayQueryCommittedIntersectionNoneEXT` / `TriangleEXT` / `GeneratedEXT`。
- 任何时候都可以用 `rayQueryTerminateEXT` 提前结束。

换句话说,光追管线里 any-hit 和 intersection 着色器做的事,在 Ray Query 里由同一个着色器的 `while` 循环体完成;closest-hit 和 miss 做的事,则是循环结束后的普通代码。

## 5. 对比

| | 光追管线 | Ray Query |
|---|---|---|
| 谁遍历加速结构 | 驱动 / 硬件 | 驱动 / 硬件(由 `rayQueryProceedEXT` 推进) |
| 谁决定命中后做什么 | SBT 选出的 closest-hit / any-hit / miss 等着色器 | 调用 Ray Query 的那个着色器自己 |
| 需要 SBT | 需要 | 不需要 |
| 新的管线类型 | 需要(`vkCreateRayTracingPipelinesKHR`) | 不需要,直接用在已有的图形 / 计算管线里 |
| 递归 | 支持,受 `maxPipelineRayRecursionDepth` 限制 | 没有“递归”概念,需要多次反弹就自己写循环 |
| 可用阶段 | 只在光追管线的阶段中 | 任意阶段 |
| 发散与调度 | 着色器是独立的入口,实现可以在调用命中着色器前重新组织工作以减少发散(也有专门的重排序扩展) | 一切都在调用者的线程里内联执行,材质不同导致的分支发散由着色器自己承担 |
| 材质多样性 | 天然适合:每种材质一个命中组 | 需要在一个着色器里写 `switch` 或“超级着色器” |
| 典型用途 | 完整的路径追踪、反射 / 折射链、材质很多的场景 | 在光栅化管线里加光追阴影、AO,在 compute 里做简单的可见性查询 |

经验法则:**如果你只需要问“这条线段被挡住了吗”或“最近的交点在哪里”,用 Ray Query**;如果需要按材质分派大量不同的着色代码,或者需要多层递归,用光追管线。两者性能谁更好取决于实现和工作负载:在一些实现上,遍历本身也是由着色器代码配合硬件求交指令完成的,光追管线需要额外的函数调用或调度开销;而在材质复杂、发散严重的场景中,管线的调度能力可能更有优势。最可靠的办法是在目标硬件上测量。

## 6. 同一个阴影光线,两种写法

### 6.1 光追管线版

在最近命中着色器中发阴影光线,配合一个专门的 miss 着色器(放在 miss 区域的第 1 条记录):

```glsl
// closesthit.rchit(片段)
#extension GL_EXT_ray_tracing : require
layout(set = 0, binding = 0) uniform accelerationStructureEXT topLevelAS;
layout(location = 0) rayPayloadInEXT vec3 radiance;     // 主光线的负载
layout(location = 1) rayPayloadEXT   bool inShadow;     // 阴影光线的负载

void main()
{
    vec3 P = gl_WorldRayOriginEXT + gl_WorldRayDirectionEXT * gl_HitTEXT;
    vec3 L = normalize(lightPos - P);
    float tLight = length(lightPos - P);

    inShadow = true;                    // 先假设被挡住,miss 会把它改成 false
    traceRayEXT(topLevelAS,
                gl_RayFlagsTerminateOnFirstHitEXT | gl_RayFlagsOpaqueEXT
                    | gl_RayFlagsSkipClosestHitShaderEXT,
                0xFF,                   // cullMask
                0, 0,                   // sbtRecordOffset, sbtRecordStride:不会调用命中着色器
                1,                      // missIndex:阴影专用 miss
                P, 1e-3, L, tLight,
                1);                     // 负载 location = 1
    radiance = shade(P) * (inShadow ? 0.2 : 1.0);
}
```

```glsl
// shadow.rmiss
#extension GL_EXT_ray_tracing : require
layout(location = 1) rayPayloadInEXT bool inShadow;
void main() { inShadow = false; }
```

三个光线标志配合起来:找到任何命中就停止、把所有几何当作不透明(不调用任意命中着色器)、跳过最近命中着色器。于是只有“没命中”时才会运行一段几乎为空的 miss 着色器。

### 6.2 Ray Query 版

在光栅化的片段着色器中直接查询。这里演示完整的循环写法,以便处理带 alpha 测试的非不透明几何:

```glsl
// scene.frag(片段)
#extension GL_EXT_ray_query : require
layout(set = 0, binding = 1) uniform accelerationStructureEXT topLevelAS;

float visibility(vec3 P, vec3 N, vec3 lightPos)
{
    vec3  toLight = lightPos - P;
    float tLight  = length(toLight);
    vec3  L       = toLight / tLight;

    rayQueryEXT rq;
    rayQueryInitializeEXT(rq, topLevelAS, gl_RayFlagsTerminateOnFirstHitEXT, 0xFF,
                          P + N * 1e-3, 0.0, L, tLight);
    while (rayQueryProceedEXT(rq)) {
        // 只有非不透明的三角形会停在这里
        if (rayQueryGetIntersectionTypeEXT(rq, false) == gl_RayQueryCandidateIntersectionTriangleEXT
            && alphaTestPasses(rayQueryGetIntersectionInstanceCustomIndexEXT(rq, false),
                               rayQueryGetIntersectionPrimitiveIndexEXT(rq, false),
                               rayQueryGetIntersectionBarycentricsEXT(rq, false)))
        {
            rayQueryConfirmIntersectionEXT(rq);   // 配合 TerminateOnFirstHit,下一次 Proceed 返回 false
        }
    }
    return rayQueryGetIntersectionTypeEXT(rq, true) == gl_RayQueryCommittedIntersectionNoneEXT ? 1.0 : 0.0;
}
```

如果场景全部是不透明几何,循环体永远不会执行,一次 `rayQueryProceedEXT` 就会完成遍历。Sascha Willems 的 rayquery 示例正是利用这一点,只调用了一次 `rayQueryProceedEXT`(见 [示例导读](/raytracing/05-notes/04-sascha-samples-guide/))。

对比两段代码:管线版需要一个额外的 miss 着色器、SBT 中的一条 miss 记录以及负载变量;Ray Query 版所有逻辑都在一个函数里,而且可以直接插进已有的延迟渲染或前向渲染管线。这正是 Ray Query 在“光栅化 + 局部光追效果”的混合渲染中广受欢迎的原因。

## 自测问题

1. 只想在 compute shader 里做光追 AO,需要开启哪些扩展和特性?需要 SBT 吗?
2. 写出命中组记录下标的计算公式。若每个几何体有“主光线”和“阴影”两条记录,`traceRayEXT` 的 `sbtRecordOffset` 和 `sbtRecordStride` 该怎么填?
3. Ray Query 中 candidate 和 committed 有什么区别?为什么不透明三角形不会让 `rayQueryProceedEXT` 返回 `true`?
4. 光追管线的阴影光线通常用哪三个光线标志?各自省掉了什么?
5. 在哪些场景下更倾向于使用光追管线而不是 Ray Query?

<details>
<summary>参考答案</summary>

1. 扩展:`VK_KHR_acceleration_structure`(及其依赖 `VK_KHR_deferred_host_operations`、缓冲区设备地址、描述符索引)、`VK_KHR_ray_query`、`VK_KHR_spirv_1_4`(及 `VK_KHR_shader_float_controls`)。特性:`bufferDeviceAddress`、`accelerationStructure`、`rayQuery`。不需要 SBT,也不需要 `VK_KHR_ray_tracing_pipeline`。
2. $\text{hitIndex} = \text{instanceSBTOffset} + \text{sbtRecordOffset} + \text{geometryIndex} \times \text{sbtRecordStride}$。两条记录时 `sbtRecordStride = 2`;主光线 `sbtRecordOffset = 0`,阴影光线 `sbtRecordOffset = 1`。
3. candidate 是遍历中遇到的、等待着色器裁决的交点;committed 是目前已被接受的最近交点。不透明三角形不需要裁决,实现会直接提交,所以不会把控制权交回着色器。
4. `gl_RayFlagsTerminateOnFirstHitEXT`(省掉寻找最近交点的继续遍历)、`gl_RayFlagsOpaqueEXT`(省掉任意命中着色器调用)、`gl_RayFlagsSkipClosestHitShaderEXT`(省掉最近命中着色器调用)。
5. 完整的路径追踪、需要多层递归的反射 / 折射、材质种类很多需要按材质分派着色代码的场景,以及需要程序化几何(相交着色器)和可调用着色器的场景。

</details>

## 延伸阅读

- Khronos 博客:[Ray Tracing In Vulkan](https://www.khronos.org/blog/ray-tracing-in-vulkan)(三个扩展的设计背景)
- Vulkan 规范:[Ray Tracing 章节](https://registry.khronos.org/vulkan/specs/latest/html/vkspec.html#ray-tracing)
- GLSL 扩展规范:[GLSL_EXT_ray_tracing](https://github.com/KhronosGroup/GLSL/blob/main/extensions/ext/GLSL_EXT_ray_tracing.txt)、[GLSL_EXT_ray_query](https://github.com/KhronosGroup/GLSL/blob/main/extensions/ext/GLSL_EXT_ray_query.txt)
- 本站:[NVIDIA 概念详解:着色器绑定表](/raytracing/04-nvidia-concepts/02-shader-binding-table/)
- 本站:[NVIDIA 概念详解:Ray Query](/raytracing/04-nvidia-concepts/03-ray-query/)
