---
title: "7. 阶段 3:基础加速结构(Phase 3: Basic Acceleration Structures)"
order: 7
description: "利用阶段 2 搭好的基础设施,真正为所有网格构建 BLAS、为所有实例构建 TLAS,并用 Nsight Graphics 检查结果。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md#-phase-3-basic-acceleration-structures"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Phase 3: Basic Acceleration Structures"
license: "Apache-2.0"
---

## 阶段概览

**阶段目标**:利用阶段 2 中搭建的基础设施,真正构建出加速结构(acceleration structure)。

- 为所有网格构建底层加速结构(BLAS)
- 为所有实例(instance)构建顶层加速结构(TLAS)
- 验证加速结构已成功创建
- 为创建光线追踪管线做准备

**预期结果**:加速结构已构建完成,可以用于光线追踪。应用程序仍然使用光栅化(rasterization)进行渲染,但现在已经拥有光线追踪所需的几何数据结构。

**文档**:强烈建议此时阅读[加速结构](/rt-docs/04-nvidia-concepts/01-acceleration-structures/)一文。它解释了相关概念以及这里用到的辅助函数。

## 代码改动

### 步骤 3.1:启用 BLAS 构建

更新 `createBottomLevelAS()` 方法,让它真正构建加速结构:

```cpp
void createBottomLevelAS()
{
    SCOPED_TIMER(__FUNCTION__);

    // Prepare geometry information for all meshes
    m_blasAccel.resize(m_sceneResource.meshes.size());

    // One BLAS per primitive
    for(uint32_t blasId = 0; blasId < m_sceneResource.meshes.size(); blasId++)
    {
      VkAccelerationStructureGeometryKHR       asGeometry{};
      VkAccelerationStructureBuildRangeInfoKHR asBuildRangeInfo{};

      // Convert the primitive information to acceleration structure geometry
      primitiveToGeometry(m_sceneResource.meshes[blasId], asGeometry, asBuildRangeInfo);

      createAccelerationStructure(VK_ACCELERATION_STRUCTURE_TYPE_BOTTOM_LEVEL_KHR, m_blasAccel[blasId], asGeometry,
                                  asBuildRangeInfo, VK_BUILD_ACCELERATION_STRUCTURE_PREFER_FAST_TRACE_BIT_KHR);
      NVVK_DBG_NAME(m_blasAccel[blasId].accel);
    }
    
    LOGI("  Bottom-level acceleration structures built successfully\n");
}
```

> **注意**:这种做法借助我们通用的辅助函数 `createAccelerationStructure`,为每个网格创建一个 BLAS。每个 BLAS 包含一个网格的三角形几何数据。

### 步骤 3.2:启用 TLAS 构建

更新 `createTopLevelAS()` 方法,让它真正构建顶层加速结构:

```cpp
void createTopLevelAS()
{
    SCOPED_TIMER(__FUNCTION__);

    // VkTransformMatrixKHR is row-major 3x4, glm::mat4 is column-major; transpose before memcpy.
    auto toTransformMatrixKHR = [](const glm::mat4& m) {
      VkTransformMatrixKHR t;
      memcpy(&t, glm::value_ptr(glm::transpose(m)), sizeof(t));
      return t;
    };

    // First create the instance data for the TLAS
    std::vector<VkAccelerationStructureInstanceKHR> tlasInstances;
    tlasInstances.reserve(m_sceneResource.instances.size());
    for(const shaderio::GltfInstance& instance : m_sceneResource.instances)
    {
      VkAccelerationStructureInstanceKHR asInstance{};
      asInstance.transform                      = toTransformMatrixKHR(instance.transform);  // Position of the instance
      asInstance.instanceCustomIndex            = instance.meshIndex;                       // gl_InstanceCustomIndexEXT
      asInstance.accelerationStructureReference = m_blasAccel[instance.meshIndex].address;  // Address of the BLAS
      asInstance.instanceShaderBindingTableRecordOffset = 0;  // We will use the same hit group for all objects
      asInstance.flags = VK_GEOMETRY_INSTANCE_TRIANGLE_CULL_DISABLE_BIT_NV;  // No culling - double sided
      asInstance.mask  = 0xFF;
      tlasInstances.emplace_back(asInstance);
    }

    // Then create the buffer with the instance data
    nvvk::Buffer tlasInstancesBuffer;
    {
      VkCommandBuffer cmd = m_app->createTempCmdBuffer();

      // Create the instances buffer and upload the instance data
      NVVK_CHECK(m_allocator.createBuffer(
          tlasInstancesBuffer, std::span<VkAccelerationStructureInstanceKHR const>(tlasInstances).size_bytes(),
          VK_BUFFER_USAGE_2_ACCELERATION_STRUCTURE_BUILD_INPUT_READ_ONLY_BIT_KHR | VK_BUFFER_USAGE_2_SHADER_DEVICE_ADDRESS_BIT));
      NVVK_CHECK(m_stagingUploader.appendBuffer(tlasInstancesBuffer, 0,
                                                std::span<VkAccelerationStructureInstanceKHR const>(tlasInstances)));
      NVVK_DBG_NAME(tlasInstancesBuffer.buffer);
      m_stagingUploader.cmdUploadAppended(cmd);
      m_app->submitAndWaitTempCmdBuffer(cmd);
    }

    // Then create the TLAS geometry
    {
      VkAccelerationStructureGeometryKHR       asGeometry{};
      VkAccelerationStructureBuildRangeInfoKHR asBuildRangeInfo{};

      // Convert the instance information to acceleration structure geometry, similar to primitiveToGeometry()
      VkAccelerationStructureGeometryInstancesDataKHR geometryInstances{.sType = VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_INSTANCES_DATA_KHR,
                                                                        .data = {.deviceAddress = tlasInstancesBuffer.address}};
      asGeometry       = {.sType        = VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_KHR,
                          .geometryType = VK_GEOMETRY_TYPE_INSTANCES_KHR,
                          .geometry     = {.instances = geometryInstances}};
      asBuildRangeInfo = {.primitiveCount = static_cast<uint32_t>(m_sceneResource.instances.size())};

      createAccelerationStructure(VK_ACCELERATION_STRUCTURE_TYPE_TOP_LEVEL_KHR, m_tlasAccel, asGeometry,
                                  asBuildRangeInfo, VK_BUILD_ACCELERATION_STRUCTURE_PREFER_FAST_TRACE_BIT_KHR);
      NVVK_DBG_NAME(m_tlasAccel.accel);
    }

    LOGI("  Top-level acceleration structures built successfully\n");
    m_allocator.destroyBuffer(tlasInstancesBuffer);  // Cleanup
}
```

> **注意**:这里构建了一个包含场景中所有实例的顶层加速结构。整个过程包括:创建实例数据,把它上传到 GPU 缓冲区,然后用这个缓冲区创建 TLAS 的几何描述。

> **注意**:请留意它与 BLAS 创建过程的相似之处;不过对于 TLAS,我们使用的是 `VkAccelerationStructureGeometryInstancesDataKHR`,而不是 `VkAccelerationStructureGeometryTrianglesDataKHR`。Vulkan 还支持其他几何类型,比如 AABB——用法示例请参考其他教程。

> **译注**:代码中的 `toTransformMatrixKHR` 之所以要先转置,是因为 `VkTransformMatrixKHR` 是按行主序存储的 3×4 矩阵,而 `glm::mat4` 是列主序的 4×4 矩阵;直接 `memcpy` 会把平移分量放错位置。

### 步骤 3.3:添加加速结构的清理代码

在 `onDetach()` 方法中加入光线追踪组件的反初始化代码(放在分配器反初始化之前):

```cpp
    // Cleanup acceleration structures
    for(auto& blas : m_blasAccel)
    {
      m_allocator.destroyAcceleration(blas);
    }
    m_allocator.destroyAcceleration(m_tlasAccel);

    m_allocator.deinit();
```

这样可以确保应用程序关闭时,所有 BLAS 和 TLAS 都会被正确销毁。

## 阶段 3 检查点

**此时,你的应用程序应当:**

✅ **编译成功**,没有错误或警告  
✅ **运行时不崩溃**,并显示与之前相同的光栅化场景  
✅ **在控制台输出中显示**加速结构构建成功  
✅ **GPU 显存占用有所增加**,因为需要存储加速结构  
✅ **启动时间略有变长**,因为需要构建加速结构  

**预期的控制台输出:**

```bash
RtFoundation::createBottomLevelAS  Bottom-level acceleration structures built successfully
RtFoundation::createTopLevelAS  Top-level acceleration structures built successfully
```

## 加速结构详情

此时,你已经拥有:

- **BLAS(底层加速结构)**:每个网格一个,包含实际的三角形几何数据
- **TLAS(顶层加速结构)**:一个结构,包含所有实例及其变换

现在,这些加速结构已经可以供光线追踪管线使用,以高效地完成光线与几何体的相交测试。

## 使用 Nsight Graphics 进行测试

我们目前还没有用到这些加速结构,但既然它们已经创建出来,你就可以在 Nsight Graphics 中查看它们。

- 启动 Nsight Graphics 并开始捕获。
  - 忽略所有验证错误;它们并不是由本应用程序引起的。
- 捕获一帧。
- 打开 Object Browser(对象浏览器)。
- 搜索并选中 `RtBasic::createTopLevelAS::m_tlasAccel.accel`。
- 点击“Open in Ray Tracing Inspector”查看该加速结构。

![Nsight Graphics 的 Ray Tracing Inspector 中显示的加速结构](/raytracing/nvidia/nsight-as1.jpg)

## 下一步

在阶段 4 中,我们将创建光线追踪管线(ray tracing pipeline)和着色器绑定表(SBT)的基础设施。加速结构已经就绪,但我们还需要管线才能真正用它们进行光线追踪。
