---
title: "5. 阶段 1:基础设置(Phase 1: Foundation Setup)"
order: 5
description: "添加光线追踪所需的类成员、启用 Vulkan 光线追踪扩展并查询设备的光线追踪属性,同时保持光栅化渲染不变"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md#phase-1-foundation-setup"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Phase 1: Foundation Setup"
license: "Apache-2.0"
---

## 阶段概览

**阶段目标**:启用光线追踪扩展并加入基础设施,同时不破坏现有的光栅化管线。

- 添加光线追踪相关的头文件和依赖
- 在 Vulkan 上下文中启用光线追踪扩展
- 为光线追踪组件添加基本的类成员
- 确保应用程序仍然能够编译,并以光栅化方式运行

**预期结果**:应用程序在启用光线追踪扩展的情况下编译通过,但仍然使用光栅化渲染。

## 代码修改

### 步骤 1.1:实现方式概览

**注意**:出于教学目的,本教程直接调用 Vulkan API。

**实现方式对比:**

- **本教程(`02_basic`)**:直接调用 Vulkan 函数,例如 `vkCmdBuildAccelerationStructuresKHR()` 和 `vkGetRayTracingShaderGroupHandlesKHR()`
- **辅助库版本(`02_basic_nvvk`)**:使用 `nvvk::AccelerationStructureHelper` 和 `nvvk::SBTGenerator` 来简化开发

本系列后续的所有教程(`02_basic_nvvk`、`03_any_hit` 等)都使用辅助库,以获得更好的性能和可维护性。

关于这些概念,你可以在以下文档中了解更多:

- [加速结构(Acceleration Structures)](/raytracing/04-nvidia-concepts/01-acceleration-structures/)
- [着色器绑定表(Shader Binding Table)](/raytracing/04-nvidia-concepts/02-shader-binding-table/)

### 步骤 1.2:添加光线追踪相关的类成员

把下面这些成员添加到你的 `RtFoundation` 类中(放在已有成员之后):

```cpp
// Ray Tracing Pipeline Components
nvvk::DescriptorPack m_rtDescPack;               // Ray tracing descriptor bindings
VkPipeline           m_rtPipeline{};             // Ray tracing pipeline
VkPipelineLayout     m_rtPipelineLayout{};       // Ray tracing pipeline layout

// Acceleration Structure Components
std::vector<nvvk::AccelerationStructure> m_blasAccel;     // Bottom-level acceleration structures
nvvk::AccelerationStructure              m_tlasAccel;     // Top-level acceleration structure

// Direct SBT management
nvvk::Buffer                    m_sbtBuffer;         // Buffer for shader binding table
std::vector<uint8_t>            m_shaderHandles;     // Storage for shader group handles
VkStridedDeviceAddressRegionKHR m_raygenRegion{};    // Ray generation shader region
VkStridedDeviceAddressRegionKHR m_missRegion{};      // Miss shader region
VkStridedDeviceAddressRegionKHR m_hitRegion{};       // Hit shader region
VkStridedDeviceAddressRegionKHR m_callableRegion{};  // Callable shader region

// Ray Tracing Properties
VkPhysicalDeviceRayTracingPipelinePropertiesKHR m_rtProperties{
    VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_RAY_TRACING_PIPELINE_PROPERTIES_KHR};
VkPhysicalDeviceAccelerationStructurePropertiesKHR m_asProperties{
    VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_ACCELERATION_STRUCTURE_PROPERTIES_KHR};
```

这些成员提供了新的光线追踪管线所需的一切:一个存放所有底层加速结构(BLAS)的 vector、一个顶层加速结构(TLAS)、用于存放着色器绑定表(SBT)缓冲区和着色器组句柄(shader group handle)的存储空间,以及用来向设备查询光线追踪属性的结构体。

### 步骤 1.3:启用光线追踪扩展

在 `main()` 函数中添加所需的 Vulkan 扩展。找到定义设备扩展(device extension)的地方,添加:

```cpp
// Add ray tracing features
VkPhysicalDeviceAccelerationStructureFeaturesKHR accelFeature{
    VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_ACCELERATION_STRUCTURE_FEATURES_KHR};
VkPhysicalDeviceRayTracingPipelineFeaturesKHR rtPipelineFeature{
    VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_RAY_TRACING_PIPELINE_FEATURES_KHR};

// Add to device extensions (find the existing extensions array and add these)
{VK_KHR_ACCELERATION_STRUCTURE_EXTENSION_NAME, &accelFeature},     // Build acceleration structures
{VK_KHR_RAY_TRACING_PIPELINE_EXTENSION_NAME, &rtPipelineFeature},  // Use vkCmdTraceRaysKHR
{VK_KHR_DEFERRED_HOST_OPERATIONS_EXTENSION_NAME},                  // Required by ray tracing pipeline
```

> **注意**:需要这些扩展来启用 Vulkan 的光线追踪功能,让应用程序能够创建和使用加速结构以及光线追踪管线。

### 步骤 1.4:初始化光线追踪组件

在 `onAttach()` 方法中(已有的初始化代码之后)添加光线追踪组件的初始化:

```cpp
// Get ray tracing properties
VkPhysicalDeviceProperties2 prop2{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PROPERTIES_2};
m_rtProperties.pNext = &m_asProperties;
prop2.pNext          = &m_rtProperties;
vkGetPhysicalDeviceProperties2(m_app->getPhysicalDevice(), &prop2);
```

我们查询光线追踪属性,是为了确定设备相关的限制,例如加速结构的对齐要求。调用 `vkGetPhysicalDeviceProperties2` 之后,你可以设置一个断点,查看返回的属性值。

## 阶段 1 检查点

**此时,你的应用程序应该:**

✅ **编译成功**,没有错误或警告  
✅ **运行时不崩溃**,并显示与 `01_foundation` 相同的光栅化场景  
✅ **已启用光线追踪扩展**(可通过验证层或调试输出确认)  
✅ **已初始化光线追踪组件**,但还没有使用它们

> **测试**:  
> 在调用 `vkGetPhysicalDeviceProperties2` 之后设置断点,查看 `m_rtProperties` 和 `m_asProperties` 的内容,确认已经正确地从设备获取到光线追踪属性和加速结构属性。

## 下一步

在[阶段 2](/raytracing/03-nvidia-tutorial/06-phase2-as-infrastructure/)中,我们会搭建创建加速结构的基础设施。应用程序仍然使用光栅化,但我们将为光线追踪所需的几何数据打好基础。
