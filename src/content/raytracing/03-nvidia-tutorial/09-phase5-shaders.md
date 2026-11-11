---
title: "9. 阶段 5:基础光线追踪着色器(Phase 5: Basic Ray Tracing Shaders)"
order: 9
description: "编写最简单的光线生成、最近命中和未命中着色器,完成光线追踪管线的创建,并手动构建着色器绑定表。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md#-phase-5-basic-ray-tracing-shaders"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Phase 5: Basic Ray Tracing Shaders"
license: "Apache-2.0"
---

## 阶段概览

**阶段目标**:实现真正的光线追踪着色器,并完成管线的创建。

- 创建最简单的光线生成着色器(raygen)(简单的光线投射)
- 创建基础的最近命中着色器(closest-hit)(纯色)
- 创建简单的未命中着色器(miss)(背景色)
- 用真正的着色器完成光线追踪管线

**预期结果**:基础光线追踪管线已经完成,着色器可以正常工作。应用程序仍然使用光栅化渲染,但现在已经拥有一条可用的、随时可以投入使用的光线追踪管线。

## 代码改动

### 步骤 5.1:创建基础光线追踪着色器文件

新建着色器文件 `01_foundation_copy/shaders/rtbasic.slang`,内容如下:

```hlsl
#include "shaderio.h"

#include "nvshaders/constants.h.slang"

// clang-format off
// Push constants containing scene information and camera data
[[vk::push_constant]]                           ConstantBuffer<TutoPushConstant> pushConst;
// Texture array for material textures
[[vk::binding(BindingPoints::eTextures, 0)]]    Sampler2D textures[];
// Top-level acceleration structure containing the scene geometry
[[vk::binding(BindingPoints::eTlas, 1)]]        RaytracingAccelerationStructure topLevelAS;
// Output image where the final rendered result will be stored
[[vk::binding(BindingPoints::eOutImage, 1)]]    RWTexture2D<float4> outImage;
// clang-format on

// Ray payload structure - carries data through the ray tracing pipeline
struct HitPayload
{
    float3 color  = float3(0);  // Accumulated color along the ray path (start with black)
    float  weight = 1;          // Weight/importance of this ray (for importance sampling)
    int    depth  = 0;          // Current recursion depth (for limiting bounces) (start at depth 0)
};

// Ray generation shader - entry point for each pixel
[shader("raygeneration")]
void rgenMain()
{
    // Get the current pixel coordinates and image dimensions
    float2 launchID = (float2)DispatchRaysIndex().xy;     // Current pixel (x,y)
    float2 launchSize = (float2)DispatchRaysDimensions().xy; // Image size (width,height)

    // Retrieve scene information from push constants
    GltfSceneInfo sceneInfo = pushConst.sceneInfoAddress[0];

    // Set ray tracing flags (0 = no special flags)
    const uint rayFlags = 0;
    
    // Convert pixel coordinates to normalized device coordinates (NDC)
    // Range: [-1,1] for both x and y
    const float2 clipCoords = launchID / launchSize * 2.0 - 1.0;
    
    // Transform from NDC to view space using inverse projection matrix
    const float4 viewCoords = mul(float4(clipCoords, 1.0, 1.0), sceneInfo.projInvMatrix);

    // Create the primary ray
    RayDesc ray;
    // Transform camera origin (0,0,0) from view space to world space
    ray.Origin = mul(float4(0.0, 0.0, 0.0, 1.0), sceneInfo.viewInvMatrix).xyz;
    // Transform ray direction from view space to world space
    ray.Direction = mul(float4(normalize(viewCoords.xyz), 0.0), sceneInfo.viewInvMatrix).xyz;
    ray.TMin = 0.001;    // Minimum distance to avoid self-intersection
    ray.TMax = INFINITE; // Maximum distance (infinite for primary rays)

    // Initialize ray payload with default values
    HitPayload payload = {};

    // Cast the ray into the scene using the acceleration structure
    // Parameters: AS, flags, instance mask, sbt offset, sbt stride, miss offset, ray, payload
    TraceRay(topLevelAS, rayFlags, 0xff, 0, 0, 0, ray, payload);
    
    // Get the final color from the ray tracing result
    float3 color = payload.color;
    
    // Write the result to the output image
    outImage[int2(launchID)] = float4(color, 1.0);
}

// Closest hit shader - called when ray hits geometry
[shader("closesthit")]
void rchitMain(inout HitPayload payload, in BuiltInTriangleIntersectionAttributes attr)
{
    // For now, just set a simple solid red color for all hits
    // In a full implementation, this would:
    // 1. Sample material properties (albedo, normal, etc.)
    // 2. Calculate lighting (direct + indirect)
    // 3. Potentially cast secondary rays (reflection, refraction)
    payload.color = float3(1, 0, 0); // Red color
}

// Miss shader - called when ray doesn't hit any geometry
[shader("miss")]
void rmissMain(inout HitPayload payload)
{
    // Set background color when ray misses all geometry
    // In a full implementation, this could sample from:
    // - Skybox textures
    // - Procedural sky gradients
    // - Environment maps
    payload.color = float3(0.5, 0.5, 0.5); // Gray background
}
```

> **💡注意**:  
> 添加着色器文件后,请重新运行 CMake(Generate),确保它被包含进你的 Visual Studio 项目。  
> 然后重新构建项目,以生成 `_autogen/rtbasic.slang.h` 头文件。这个头文件包含着色器编译后的 SPIR-V 版本,使应用程序可以直接内嵌着色器,而不必完全依赖外部文件。  
>
> 为了方便开发和调试,本教程还支持在运行时热重载着色器文件——这样你无需重启应用程序就能修改并测试着色器的改动。

> **译注**:上面的着色器用 Slang 编写(语法接近 HLSL,因此代码块按 HLSL 高亮)。`TraceRay()` 的参数依次是:加速结构、光线标志、实例掩码、SBT 偏移、SBT 步长、未命中着色器索引、光线描述和负载(payload)。负载 `HitPayload` 就是光线在各个着色器之间传递数据的“载体”。

### 步骤 5.1.1:添加着色器文件

在 CPP 文件顶部、其他自动生成的头文件包含语句旁边,加上下面这一行,以包含内嵌的 Slang 着色器头文件(其中包含光线追踪着色器编译后的 SPIR-V):

```cpp
#include "_autogen/rtbasic.slang.h"     // Local shader
```

### 步骤 5.2:完成光线追踪管线的创建

更新 `createRayTracingPipeline()` 方法,加入真正的着色器编译:

```cpp
void createRayTracingPipeline()
{
    SCOPED_TIMER(__FUNCTION__);

    // For re-creation
    vkDestroyPipeline(m_app->getDevice(), m_rtPipeline, nullptr);
    vkDestroyPipelineLayout(m_app->getDevice(), m_rtPipelineLayout, nullptr);

    // Creating all shaders
    enum StageIndices
    {
        eRaygen,
        eMiss,
        eClosestHit,
        eShaderGroupCount
    };
    std::array<VkPipelineShaderStageCreateInfo, eShaderGroupCount> stages{};
    for(auto& s : stages)
        s.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;

    // Compile shader, fallback to pre-compiled
    VkShaderModuleCreateInfo shaderCode = compileSlangShader("rtbasic.slang", rtbasic_slang);

    stages[eRaygen].pNext = &shaderCode;
    stages[eRaygen].pName = "rgenMain";
    stages[eRaygen].stage = VK_SHADER_STAGE_RAYGEN_BIT_KHR;
    stages[eMiss].pNext = &shaderCode;
    stages[eMiss].pName = "rmissMain";
    stages[eMiss].stage = VK_SHADER_STAGE_MISS_BIT_KHR;
    stages[eClosestHit].pNext = &shaderCode;
    stages[eClosestHit].pName = "rchitMain";
    stages[eClosestHit].stage = VK_SHADER_STAGE_CLOSEST_HIT_BIT_KHR;

    // Shader groups
    VkRayTracingShaderGroupCreateInfoKHR group{VK_STRUCTURE_TYPE_RAY_TRACING_SHADER_GROUP_CREATE_INFO_KHR};
    group.anyHitShader = VK_SHADER_UNUSED_KHR;
    group.closestHitShader = VK_SHADER_UNUSED_KHR;
    group.generalShader = VK_SHADER_UNUSED_KHR;
    group.intersectionShader = VK_SHADER_UNUSED_KHR;

    std::vector<VkRayTracingShaderGroupCreateInfoKHR> shader_groups;
    // Raygen
    group.type = VK_RAY_TRACING_SHADER_GROUP_TYPE_GENERAL_KHR;
    group.generalShader = eRaygen;
    shader_groups.push_back(group);

    // Miss
    group.type = VK_RAY_TRACING_SHADER_GROUP_TYPE_GENERAL_KHR;
    group.generalShader = eMiss;
    shader_groups.push_back(group);

    // closest hit shader
    group.type = VK_RAY_TRACING_SHADER_GROUP_TYPE_TRIANGLES_HIT_GROUP_KHR;
    group.generalShader = VK_SHADER_UNUSED_KHR;
    group.closestHitShader = eClosestHit;
    shader_groups.push_back(group);

    // Push constant: we want to be able to update constants used by the shaders
    const VkPushConstantRange push_constant{VK_SHADER_STAGE_ALL, 0, sizeof(shaderio::TutoPushConstant)};

    VkPipelineLayoutCreateInfo pipeline_layout_create_info{VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO};
    pipeline_layout_create_info.pushConstantRangeCount = 1;
    pipeline_layout_create_info.pPushConstantRanges = &push_constant;

    // Descriptor sets: one specific to ray tracing, and one shared with the rasterization pipeline
    std::array<VkDescriptorSetLayout, 2> layouts = {{m_descPack.getLayout(), m_rtDescPack.getLayout()}};
    pipeline_layout_create_info.setLayoutCount = uint32_t(layouts.size());
    pipeline_layout_create_info.pSetLayouts = layouts.data();
    vkCreatePipelineLayout(m_app->getDevice(), &pipeline_layout_create_info, nullptr, &m_rtPipelineLayout);
    NVVK_DBG_NAME(m_rtPipelineLayout);

    // Assemble the shader stages and recursion depth info into the ray tracing pipeline
    VkRayTracingPipelineCreateInfoKHR rtPipelineInfo{VK_STRUCTURE_TYPE_RAY_TRACING_PIPELINE_CREATE_INFO_KHR};
    rtPipelineInfo.stageCount = static_cast<uint32_t>(stages.size());
    rtPipelineInfo.pStages = stages.data();
    rtPipelineInfo.groupCount = static_cast<uint32_t>(shader_groups.size());
    rtPipelineInfo.pGroups = shader_groups.data();
    rtPipelineInfo.maxPipelineRayRecursionDepth = std::max(3U, m_rtProperties.maxRayRecursionDepth);
    rtPipelineInfo.layout = m_rtPipelineLayout;
    NVVK_CHECK(vkCreateRayTracingPipelinesKHR(m_app->getDevice(), {}, {}, 1, &rtPipelineInfo, nullptr, &m_rtPipeline));
    NVVK_DBG_NAME(m_rtPipeline);

    LOGI("Ray tracing pipeline created successfully\n");

    // Create the shader binding table for this pipeline
    createShaderBindingTable(rtPipelineInfo);
}
```

> **注意**:这一阶段有两处主要改动。第一,现在会调用 Slang 编译器生成 SPIR-V 代码,并把得到的入口点(entry point)分别关联到各个着色器组(raygen、closest hit、miss)。第二,通过填写 `VkRayTracingPipelineCreateInfoKHR` 结构并调用 `vkCreateRayTracingPipelinesKHR` 来创建光线追踪管线。在下一节(5.3)中,我们将创建着色器绑定表,它可以利用 `VkRayTracingPipelineCreateInfoKHR` 结构中的信息自动生成。

> **注意**:请留意 `maxPipelineRayRecursionDepth`。它控制一条光线递归调用 `TraceRay()` 的最大次数。一开始设为 1 就够了,因为只有 RayGen 着色器会调用 `TraceRay()`。但当你加入诸如从最近命中着色器发出阴影光线(shadow ray)之类的功能时,就至少需要 2。这里我们把它设为 3,以满足眼下的所有需求。

### 步骤 5.3:完成着色器绑定表的创建

更新 `createShaderBindingTable()` 方法,用真正的着色器数据填充 SBT:

**📖文档**:强烈建议此时阅读[着色器绑定表](/raytracing/04-nvidia-concepts/02-shader-binding-table/)一文。它解释了相关概念和实现细节。

```cpp
void createShaderBindingTable(const VkRayTracingPipelineCreateInfoKHR& rtPipelineInfo)
{
    SCOPED_TIMER(__FUNCTION__);
    m_allocator.destroyBuffer(m_sbtBuffer);  // Cleanup when re-creating

    VkDevice device          = m_app->getDevice();
    uint32_t handleSize      = m_rtProperties.shaderGroupHandleSize;
    uint32_t handleAlignment = m_rtProperties.shaderGroupHandleAlignment;
    uint32_t baseAlignment   = m_rtProperties.shaderGroupBaseAlignment;
    uint32_t groupCount      = rtPipelineInfo.groupCount;

    // Get shader group handles
    size_t dataSize = handleSize * groupCount;
    m_shaderHandles.resize(dataSize);
    NVVK_CHECK(vkGetRayTracingShaderGroupHandlesKHR(device, m_rtPipeline, 0, groupCount, dataSize, m_shaderHandles.data()));

    // Calculate SBT buffer size with proper alignment
    auto     alignUp      = [](uint32_t size, uint32_t alignment) { return (size + alignment - 1) & ~(alignment - 1); };
    uint32_t raygenSize   = alignUp(handleSize, handleAlignment);
    uint32_t missSize     = alignUp(handleSize, handleAlignment);
    uint32_t hitSize      = alignUp(handleSize, handleAlignment);
    uint32_t callableSize = 0;  // No callable shaders in this tutorial

    // Ensure each region starts at a baseAlignment boundary
    uint32_t raygenOffset   = 0;
    uint32_t missOffset     = alignUp(raygenSize, baseAlignment);
    uint32_t hitOffset      = alignUp(missOffset + missSize, baseAlignment);
    uint32_t callableOffset = alignUp(hitOffset + hitSize, baseAlignment);

    size_t bufferSize = callableOffset + callableSize;

    // Create SBT buffer
    NVVK_CHECK(m_allocator.createBuffer(m_sbtBuffer, bufferSize, VK_BUFFER_USAGE_2_SHADER_BINDING_TABLE_BIT_KHR, VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE,
                                        VMA_ALLOCATION_CREATE_MAPPED_BIT | VMA_ALLOCATION_CREATE_HOST_ACCESS_RANDOM_BIT));
    NVVK_DBG_NAME(m_sbtBuffer.buffer);

    // Populate SBT buffer
    uint8_t* pData = static_cast<uint8_t*>(m_sbtBuffer.mapping);

    // Ray generation shader (group 0)
    memcpy(pData + raygenOffset, m_shaderHandles.data() + 0 * handleSize, handleSize);
    m_raygenRegion.deviceAddress = m_sbtBuffer.address + raygenOffset;
    m_raygenRegion.stride        = raygenSize;
    m_raygenRegion.size          = raygenSize;

    // Miss shader (group 1)
    memcpy(pData + missOffset, m_shaderHandles.data() + 1 * handleSize, handleSize);
    m_missRegion.deviceAddress = m_sbtBuffer.address + missOffset;
    m_missRegion.stride        = missSize;
    m_missRegion.size          = missSize;

    // Hit shader (group 2)
    memcpy(pData + hitOffset, m_shaderHandles.data() + 2 * handleSize, handleSize);
    m_hitRegion.deviceAddress = m_sbtBuffer.address + hitOffset;
    m_hitRegion.stride        = hitSize;
    m_hitRegion.size          = hitSize;

    // Callable shaders (none in this tutorial)
    m_callableRegion.deviceAddress = 0;
    m_callableRegion.stride        = 0;
    m_callableRegion.size          = 0;

    LOGI("Shader binding table created and populated \n");
}
```

### 理解直接构建 SBT 的实现

这段实现展示了创建 SBT 所需的核心 Vulkan 函数:

#### 1. **获取着色器组句柄**

- `vkGetRayTracingShaderGroupHandlesKHR()` 获取每个着色器组的不透明句柄(opaque handle)
- GPU 使用这些句柄来识别针对每种光线类型应执行哪个着色器
- 返回的句柄按着色器组的创建顺序排列。

#### 2. **对齐要求**

- `shaderGroupHandleAlignment`:单个着色器组句柄大小的对齐要求
- `shaderGroupBaseAlignment`:每个 SBT 区域起始设备地址(device address)的对齐要求
- 这两种对齐对 GPU 正确访问内存都至关重要

#### 3. **缓冲区布局**

- 每种着色器类型(raygen、miss、hit、callable)在 SBT 缓冲区中都有自己的区域
- 各区域之间按 `baseAlignment` 边界隔开,以满足硬件要求
- 缓冲区映射到 CPU 内存,填充时可以直接访问

#### 4. **区域设置**

- 每个区域包含设备地址、步长(stride)和大小信息
- 这些区域会传给 `vkCmdTraceRaysKHR()`,用来指定要使用哪些着色器
- 在光线追踪过程中,GPU 通过这些地址找到相应的着色器句柄

这种直接构建的方式让你可以完全掌控 SBT 的创建,也有助于理解底层的 Vulkan 机制。

`nvvk::SBTGenerator` 工具类简化了着色器绑定表(SBT)的创建:它会自动获取着色器组句柄,并根据 `VkRayTracingPipelineCreateInfoKHR` 的配置把它们组织到正确的区域中。它负责管理着色器组索引与句柄之间的对应关系,并在向各个组添加数据时处理对齐和偏移的计算。这层抽象降低了手动出错的风险,让 SBT 的搭建更加顺畅,尤其是当管线变得更复杂时(例如有多个命中组或可调用着色器)。在后续教程中,我们将使用 `nvvk::SBTGenerator` 来高效地为多个最近命中着色器、可调用着色器组等高级场景填充 SBT。

> **译注**:举个例子,如果设备报告 `shaderGroupHandleSize` 为 32 字节、`shaderGroupBaseAlignment` 为 64 字节(这是常见取值),那么即使每个区域只放一个句柄,miss 区域也要从偏移 64 开始、hit 区域从 128 开始——这正是代码中 `alignUp` 的作用。具体数值请以你的设备查询结果为准。

## 阶段 5 检查点

**此时,你的应用程序应当:**

✅ **编译成功**,没有错误或警告  
✅ **运行时不崩溃**,并显示与之前相同的光栅化场景  
✅ **在控制台输出中显示**着色器编译和管线创建成功  
✅ **拥有一条完整的光线追踪管线**,随时可用(但尚未使用)  

**预期的控制台输出:**

```bash
RtFoundation::compileSlangShader -> XX.XXX ms
Ray tracing pipeline created successfully
Shader binding table created and populated
```

## 着色器详情

此时,你已经拥有:

- **光线生成着色器**:生成相机光线,并让它们在场景中进行追踪
- **最近命中着色器**:对任何命中都返回简单的红色
- **未命中着色器**:对没有击中几何体的光线返回灰色背景

光线追踪管线现已完成,可以投入使用。

## 下一步

在阶段 6 中,我们将把光线追踪管线集成到渲染循环中,用光线追踪取代光栅化渲染。这将是你第一次真正看到光线追踪输出的阶段。
