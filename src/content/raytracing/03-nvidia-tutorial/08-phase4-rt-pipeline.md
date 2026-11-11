---
title: "8. 阶段 4:光线追踪管线搭建(Phase 4: Ray Tracing Pipeline Setup)"
order: 8
description: "创建光线追踪的描述符布局、管线布局和着色器绑定表缓冲区等基础设施,为下一阶段编写着色器做准备。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md#-phase-4-ray-tracing-pipeline-setup"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Phase 4: Ray Tracing Pipeline Setup"
license: "Apache-2.0"
---

## 阶段概览

**阶段目标**:创建光线追踪管线(ray tracing pipeline)和着色器绑定表(SBT)的基础设施,但暂时不实现真正的着色器。

- 为 TLAS 和输出图像创建光线追踪用的描述符布局
- 搭建光线追踪管线的基本结构
- 创建着色器绑定表的基础设施
- 为下一阶段实现着色器做准备

**预期结果**:光线追踪管线已经创建好,只等着色器加入。应用程序仍然使用光栅化渲染,但现在已经具备光线追踪所需的管线基础设施。

## 代码改动

### 步骤 4.1:添加新的绑定点

在 `shaders\shaderio.h` 中添加我们将要用到的新绑定点。

第一个绑定点用于场景中用到的所有纹理。现在我们再为输出图像(光线追踪器把结果写入的地方)以及用于光线追踪的顶层加速结构(TLAS)添加绑定点。

```hlsl
// Binding Points
enum BindingPoints
{
  eTextures = 0,  // Binding point for textures
  eOutImage,      // Binding point for output image
  eTlas,          // Top-level acceleration structure
};
```

### 步骤 4.2:创建光线追踪描述符布局

在你的类中添加下面这个方法(作为私有方法,放在阶段 3 的 `createTopLevelAS()` 方法之后):

```cpp
void createRaytraceDescriptorLayout()
{
    SCOPED_TIMER(__FUNCTION__);
    nvvk::DescriptorBindings bindings;
    bindings.addBinding({.binding = shaderio::BindingPoints::eTlas,
                         .descriptorType = VK_DESCRIPTOR_TYPE_ACCELERATION_STRUCTURE_KHR,
                         .descriptorCount = 1,
                         .stageFlags = VK_SHADER_STAGE_ALL});
    bindings.addBinding({.binding = shaderio::BindingPoints::eOutImage,
                         .descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE,
                         .descriptorCount = 1,
                         .stageFlags = VK_SHADER_STAGE_ALL});
    
    // Creating a PUSH descriptor set and set layout from the bindings
    m_rtDescPack.init(bindings, m_app->getDevice(), 0, 
        VK_DESCRIPTOR_SET_LAYOUT_CREATE_PUSH_DESCRIPTOR_BIT_KHR);
    
    LOGI("Ray tracing descriptor layout created\n");
}
```

> **注意**:这是第二个描述符集(descriptor set)。第一个描述符集只包含场景的纹理。这个新的描述符集则提供对顶层加速结构以及光线追踪器输出图像的访问。在着色器中,它们通过 `Set1` 访问,而纹理仍然位于 `Set0`。

### 步骤 4.3:创建光线追踪管线的基本结构

添加下面这个方法来创建光线追踪管线(暂时不含着色器):

```cpp
void createRayTracingPipeline()
{
    SCOPED_TIMER(__FUNCTION__);

    // For re-creation
    vkDestroyPipeline(m_app->getDevice(), m_rtPipeline, nullptr);
    vkDestroyPipelineLayout(m_app->getDevice(), m_rtPipelineLayout, nullptr);

    // Creating all shaders (placeholder for now)
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

    // TODO: In Phase 5, we'll add actual shader compilation
    // For now, create empty stages to test pipeline creation
    LOGI("Creating ray tracing pipeline structure (shaders will be added in Phase 5)\n");

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

    VkRayTracingPipelineCreateInfoKHR rtPipelineInfo{VK_STRUCTURE_TYPE_RAY_TRACING_PIPELINE_CREATE_INFO_KHR};

    // TODO: In Phase 5, we'll add actual shader stages and create the pipeline
    // For now, just log that the pipeline layout is ready
    LOGI("Ray tracing pipeline layout created successfully\n");

    // Create the shader binding table for this pipeline
    createShaderBindingTable(rtPipelineInfo);
}
```

在这一步中,我们加入了光线追踪管线布局的创建。由于这个函数可能被多次调用(例如重新加载着色器时),我们会在重新创建之前,先销毁之前创建的光线追踪管线句柄和管线布局。SBT 缓冲区则在 `createShaderBindingTable()` 中清理,该缓冲区也在那里重新创建。

接下来,我们为光线追踪管线定义了三个必不可少的着色器组(shader group):光线生成组、未命中组和最近命中组。这些组构成了一条最小光线追踪管线所必需的基本组成部分。

请注意,在这个阶段,真正的光线追踪管线本身还没有创建——这将在下一阶段实现。

### 步骤 4.4:创建着色器绑定表基础设施

添加下面这个方法来搭建 SBT 的基础设施:

```cpp
void createShaderBindingTable(const VkRayTracingPipelineCreateInfoKHR& rtPipelineInfo)
{
    SCOPED_TIMER(__FUNCTION__);
    m_allocator.destroyBuffer(m_sbtBuffer);  // Cleanup when re-creating

    // TODO: In Phase 5, we'll populate this with actual shader data
    // For now, just prepare the infrastructure
    
    // Calculate required SBT buffer size (will be populated in Phase 5)
    size_t bufferSize = 1024; // Placeholder size
    
    // Create SBT buffer
    NVVK_CHECK(m_allocator.createBuffer(m_sbtBuffer, bufferSize, VK_BUFFER_USAGE_2_SHADER_BINDING_TABLE_BIT_KHR, VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE,
                                        VMA_ALLOCATION_CREATE_MAPPED_BIT | VMA_ALLOCATION_CREATE_HOST_ACCESS_RANDOM_BIT));                                        
    NVVK_DBG_NAME(m_sbtBuffer.buffer);
    LOGI("Shader binding table buffer created (will be populated in Phase 5)\n");
}
```

这是着色器绑定表(SBT)基础设施的一个占位实现。在下一阶段,我们会创建 SBT 缓冲区,并向其中填入所需的着色器组句柄和布局信息。SBT 是 Vulkan 光线追踪中的一个关键结构,它决定了光线如何派发,以及每种光线类型会调用哪些着色器。目前我们只是创建缓冲区、预留空间;真正填入着色器数据的工作将在阶段 5 中实现。

### 步骤 4.5:调用管线搭建方法

在 `onAttach()` 方法中,在创建加速结构的调用之后,加入下面这些调用来搭建光线追踪管线:

```cpp
// Set up ray tracing pipeline infrastructure
createRaytraceDescriptorLayout();  // Create descriptor layout
createRayTracingPipeline();        // Create pipeline structure and SBT
```

### 步骤 4.6:销毁新增的对象

在 `onDetach()` 方法中,对新创建的对象做对应的销毁:

```cpp
    // Ray tracing components
    vkDestroyPipelineLayout(device, m_rtPipelineLayout, nullptr);
    vkDestroyPipeline(device, m_rtPipeline, nullptr);
    m_rtDescPack.deinit();
    m_allocator.destroyBuffer(m_sbtBuffer);
    // .. rest of function
```

## 阶段 4 检查点

**此时,你的应用程序应当:**

✅ **编译成功**,没有错误或警告  
✅ **运行时不崩溃**,并显示与之前相同的光栅化场景  
✅ **在控制台输出中显示**管线基础设施创建成功  
✅ **光线追踪管线布局和 SBT 缓冲区已就绪**,可以开始实现着色器  

**预期的控制台输出:**

```bash
Ray tracing descriptor layout created
Creating ray tracing pipeline structure (shaders will be added in Phase 5)
Ray tracing pipeline layout created successfully
Shader binding table buffer created (will be populated in Phase 5)
```

## 管线基础设施详情

此时,你已经拥有:

- **描述符布局**:已准备好把 TLAS 和输出图像绑定到光线追踪着色器
- **管线布局**:光线追踪管线的结构,包含推送常量(push constant)和描述符集
- **SBT 缓冲区**:已为着色器绑定表分配内存(将在阶段 5 中填充)

管线基础设施现已就绪,可以开始实现着色器了。

## 下一步

在阶段 5 中,我们将实现真正的光线追踪着色器(光线生成、最近命中和未命中着色器),并完成管线的创建。这将是我们真正开始用光线追踪取代光栅化的第一个阶段。
