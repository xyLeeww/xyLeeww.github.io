---
title: "13. 教程总结与辅助库(Tutorial Completion Summary, Helper Libraries and Conclusion)"
order: 13
description: "回顾 8 个阶段的成果、光栅化与光线追踪的主要差异和后续方向,并介绍 nvpro-core2 中的加速结构辅助类与 SBT 生成器。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Tutorial Completion Summary"
license: "Apache-2.0"
---

## 教程完成总结

### 你已经完成的工作

通过这个循序渐进的教程,你已经:

1. **[第 1 阶段](/rt-docs/03-nvidia-tutorial/05-phase1-foundation/)**:添加了光线追踪扩展和基础设施
2. **[第 2 阶段](/rt-docs/03-nvidia-tutorial/06-phase2-as-infrastructure/)**:搭建了创建加速结构所需的基础设施
3. **[第 3 阶段](/rt-docs/03-nvidia-tutorial/07-phase3-basic-as/)**:构建了底层加速结构(BLAS)和顶层加速结构(TLAS)
4. **[第 4 阶段](/rt-docs/03-nvidia-tutorial/08-phase4-rt-pipeline/)**:创建了光线追踪管线和着色器绑定表(SBT)的基础设施
5. **[第 5 阶段](/rt-docs/03-nvidia-tutorial/09-phase5-shaders/)**:实现了基本的光线追踪着色器
6. **[第 6 阶段](/rt-docs/03-nvidia-tutorial/10-phase6-integration/)**:把光线追踪集成进渲染循环
7. **[第 7 阶段](/rt-docs/03-nvidia-tutorial/11-phase7-material/)**:增强了材质着色,达到视觉上的一致
8. **[第 8 阶段](/rt-docs/03-nvidia-tutorial/12-phase8-lighting/)**:加入了逼真的光照和阴影投射

### 实现的主要差异

| 组件 | 之前(光栅化) | 之后(光线追踪) |
|-----------|------------------------|---------------------|
| **管线类型** | 图形管线 | 光线追踪管线 |
| **着色器类型** | 顶点 / 片段 | 光线生成 / 最近命中 / 未命中 |
| **几何体** | 顶点缓冲区 | 加速结构(BLAS/TLAS) |
| **渲染** | `vkCmdDrawIndexed` | `vkCmdTraceRaysKHR` |
| **描述符** | 仅纹理 | + TLAS + 输出图像 |
| **内存** | 顶点 / 索引缓冲区 | + SBT 缓冲区 + 加速结构 |

### 性能方面的考虑

**光线追踪的优势**:

- 更逼真的光照和反射
- 自然的全局光照
- 准确的阴影和透明效果
- 灵活的着色模型

**光线追踪的挑战**:

- 计算开销更高
- 内存占用更大
- 管线设置更复杂
- 需要较新的 GPU 硬件

### 下一步

你的光线追踪实现现在可以继续扩展:

1. 用**任意命中着色器**(any-hit)实现透明和 alpha 测试
2. 用**多种光线类型**实现不同的效果
3. 用**反射光线**实现镜面般的表面
4. 用多次弹射实现**全局光照**
5. 用带动画的加速结构实现**运动模糊**
6. 用**可调用着色器**(callable)实现程序化效果

请查看[完整的示例集](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/samples/index.md)。

### 延伸阅读

关于更高级的光线追踪技术:

- **[加速结构指南](/rt-docs/04-nvidia-concepts/01-acceleration-structures/)**:全面介绍 BLAS/TLAS 的构建、内存管理和优化
- **[着色器绑定表指南](/rt-docs/04-nvidia-concepts/02-shader-binding-table/)**:SBT 的创建、对齐和高级用法的完整参考

## 辅助库与高级实现

虽然本教程为了教学目的直接调用 Vulkan,但 nvpro-core2 框架提供了强大的辅助库,可以简化光线追踪的开发。本系列的其他教程都使用了这些辅助库,也推荐在正式产品中使用。

### 加速结构辅助类(`nvvk::AccelerationStructureHelper`)

加速结构辅助类简化了 BLAS 和 TLAS 的创建:

```cpp
// Initialize the helper
nvvk::AccelerationStructureHelper m_asBuilder{};
m_asBuilder.init(&m_allocator, &m_stagingUploader, m_app->getQueue(0));

// Build BLAS for all meshes
std::vector<nvvk::AccelerationStructureGeometryInfo> geoInfos(m_sceneResource.meshes.size());
for(uint32_t i = 0; i < m_sceneResource.meshes.size(); i++)
{
    geoInfos[i] = primitiveToGeometry(m_sceneResource.meshes[i]);
}
m_asBuilder.blasSubmitBuildAndWait(geoInfos, VK_BUILD_ACCELERATION_STRUCTURE_PREFER_FAST_TRACE_BIT_KHR);

// Build TLAS
std::vector<VkAccelerationStructureInstanceKHR> tlasInstances;
// ... populate instances ...
m_asBuilder.tlasSubmitBuildAndWait(tlasInstances, VK_BUILD_ACCELERATION_STRUCTURE_PREFER_FAST_TRACE_BIT_KHR);
```

**好处:**

- 自动管理暂存缓冲区(scratch buffer)
- 批量构建多个加速结构
- 内存优化与复用
- 简化实例数据的处理

### 着色器绑定表生成器(`nvvk::SBTGenerator`)

SBT 生成器可以自动完成着色器绑定表的创建:

```cpp
// Initialize the generator
nvvk::SBTGenerator m_sbtGenerator{};
m_sbtGenerator.init(m_app->getDevice(), m_rtProperties);

// Create and populate SBT
size_t bufferSize = m_sbtGenerator.calculateSBTBufferSize(m_rtPipeline, rtPipelineInfo);
NVVK_CHECK(m_allocator.createBuffer(m_sbtBuffer, bufferSize, VK_BUFFER_USAGE_2_SHADER_BINDING_TABLE_BIT_KHR, 
                                    VMA_MEMORY_USAGE_AUTO_PREFER_DEVICE,
                                    VMA_ALLOCATION_CREATE_MAPPED_BIT | VMA_ALLOCATION_CREATE_HOST_ACCESS_RANDOM_BIT,
                                    m_sbtGenerator.getBufferAlignment()));
NVVK_CHECK(m_sbtGenerator.populateSBTBuffer(m_sbtBuffer.address, bufferSize, m_sbtBuffer.mapping));

// Get regions for ray tracing
const nvvk::SBTGenerator::Regions& regions = m_sbtGenerator.getSBTRegions();
vkCmdTraceRaysKHR(cmd, &regions.raygen, &regions.miss, &regions.hit, &regions.callable, width, height, 1);
```

**好处:**

- 自动计算对齐
- 支持每个组包含多个着色器
- 内置着色器数据管理
- 简化区域(region)的访问

### 何时使用辅助库,何时直接调用 Vulkan

**以下情况适合直接调用 Vulkan:**

- 学习光线追踪的基础知识
- 需要完全控制内存布局
- 实现自定义的优化策略
- 调试对齐或内存问题
- 用于教学目的

**以下情况适合使用辅助库:**

- 构建正式产品
- 需要快速制作原型
- 希望专注于渲染算法而不是基础设施
- 需要高级功能(每个组多个着色器、动态更新)
- 跟随本系列的其他教程学习

### 本系列教程的思路

本教程(`02_basic`)直接调用 Vulkan 来讲授基础知识。系列中的其他教程(`02_basic_nvvk`、`03_any_hit` 等)则使用辅助库来实现更高级的功能并获得更好的性能。这种安排让你可以:

1. 通过直接调用 Vulkan **理解基础**(本教程)
2. 借助辅助库**应用高级技术**(后续所有教程)
3. 根据自己的具体需求**选择合适的方式**

**主要区别:**

- **直接调用 Vulkan([`02_basic`](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/tree/v2/raytrace_tutorial/02_basic))**:完全可控、具有教学价值,但需要维护更多代码
- **辅助库([`02_basic_nvvk`](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/tree/v2/raytrace_tutorial/02_basic_nvvk) 及之后的教程)**:开发更简单、性能更好、可直接用于正式产品

## 结语

恭喜!你已经成功地把一个现代 Vulkan 光栅化应用程序改造成使用光线追踪。本教程展示了实现复杂功能的渐进式方法:每个阶段都在前一阶段的基础上逐步推进,保证应用程序在每一步都能编译、都能测试。

成功实现光线追踪的关键,在于理解它与光栅化的根本区别,并有条理地搭建基础设施。遵循这种渐进式方法,你就能在整个开发过程中始终保持应用程序可用,同时攻克复杂的功能。

现在你已经打下了扎实的光线追踪基础。辅助库为你提供了通往更高级功能和更好性能的道路,而直接调用 Vulkan 的方式则让你在需要时拥有完全的控制权。

---

*渐进式光线追踪教程到此结束。你现在拥有一个功能完整的光线追踪应用程序,其视觉质量与原光栅化场景一致。*
