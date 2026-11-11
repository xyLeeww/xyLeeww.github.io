---
title: "Sascha Willems 光追示例导读"
order: 4
description: "SaschaWillems/Vulkan 仓库中 raytracingbasic 与 rayquery 两个示例的代码结构、推荐阅读顺序和关键片段解读"
kind: original
---

[SaschaWillems/Vulkan](https://github.com/SaschaWillems/Vulkan) 是学习 Vulkan 最常用的示例仓库之一,采用 MIT 许可证。它的光追示例有一个很大的优点:**每个示例都是一个独立的 `.cpp` 文件**,没有复杂的框架层,从头读到尾就能看到全部 Vulkan 调用。这篇导读带你读其中最基础的两个:`raytracingbasic`(光追管线)和 `rayquery`(Ray Query)。

> 本文基于仓库 `master` 分支的提交 [`d2d49bf`](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b)(2026 年 11 月)核对。下文行号链接都固定在这个提交上;仓库更新后行号可能变化,但函数名一般不变。代码片段只调整了缩进,省略处用 `// ...` 标出。

## 1. 获取、构建与运行

仓库用 git 子模块管理 glm 等依赖和模型等资源(`assets` 子模块指向 SaschaWillems/Vulkan-Assets),所以要递归克隆:

```bash
git clone --recursive https://github.com/SaschaWillems/Vulkan.git
cd Vulkan
# 已有的仓库可以补拉子模块:
git submodule init
git submodule update
```

构建使用 CMake,需要支持 C++20 的编译器。仓库的 `BUILD.md` 给出的 Windows 示例是 `cmake -G "Visual Studio 16 2019" -A x64`;用较新的 Visual Studio 时换成对应的生成器即可,例如:

```bash
cmake -G "Visual Studio 17 2022" -A x64 -B build
cmake --build build --config Release --target raytracingbasic rayquery
```

几点说明:

- 每个示例是一个独立的 CMake 目标,目标名就是 `examples/` 下的目录名。
- 可执行文件输出到构建目录的 `bin/` 下(Visual Studio 这类多配置生成器通常还会再分 `Debug/`、`Release/` 子目录)。
- 默认情况下,资源和着色器按**源码树的绝对路径**加载;着色器的 `.spv` 文件已经随仓库提交,不需要自己编译 GLSL。
- 常用命令行参数:`--help` 列出全部参数;`-v` 打开验证层;`-gl` 列出 GPU、`-g <编号>` 选择 GPU(多显卡机器上有用);`-s glsl|slang|hlsl` 选择着色器语言版本(大多数示例同时提供 GLSL、Slang 和 HLSL 三套着色器)。

运行 `raytracingbasic` 会看到一个彩色三角形(颜色就是重心坐标),背景是深蓝色;运行 `rayquery` 会看到一个带有动态光线追踪阴影的光栅化场景。

## 2. 相关文件一览

| 文件 | 作用 |
|---|---|
| [`examples/raytracingbasic/raytracingbasic.cpp`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingbasic/raytracingbasic.cpp) | 光追管线示例,**直接继承 `VulkanExampleBase`**,所有光追相关代码都写在这一个文件里 |
| [`shaders/glsl/raytracingbasic/raygen.rgen`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/raytracingbasic/raygen.rgen) | 光线生成着色器 |
| [`shaders/glsl/raytracingbasic/miss.rmiss`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/raytracingbasic/miss.rmiss) | 未命中着色器,返回背景色 |
| [`shaders/glsl/raytracingbasic/closesthit.rchit`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/raytracingbasic/closesthit.rchit) | 最近命中着色器,把重心坐标当颜色输出 |
| [`examples/rayquery/rayquery.cpp`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/rayquery/rayquery.cpp) | Ray Query 示例,继承 `VulkanRaytracingSample` |
| [`shaders/glsl/rayquery/scene.vert`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/rayquery/scene.vert)、[`scene.frag`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/rayquery/scene.frag) | 普通的顶点 / 片段着色器;片段着色器里用 Ray Query 做阴影 |
| [`base/VulkanRaytracingSample.h`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/base/VulkanRaytracingSample.h)、[`.cpp`](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/base/VulkanRaytracingSample.cpp) | 大多数光追示例共用的基类:扩展列表、暂存缓冲区、加速结构缓冲区、存储图像、SBT 缓冲区等辅助函数 |

注意 `raytracingbasic` 没有使用 `VulkanRaytracingSample` 基类,它自己实现了 `createScratchBuffer`、`createAccelerationStructureBuffer`、`getBufferDeviceAddress` 等辅助函数。这让它成为最适合入门的“全展开”版本;读完它再看基类,会发现基类只是把这些函数搬了个家。

## 3. 推荐阅读顺序

```text
① 三个光追着色器(共约 50 行)      先知道 GPU 端要做什么
② raytracingbasic.cpp 的 prepare()   把它当目录:看清初始化顺序
③ 按 prepare() 的顺序逐个读:
     createBottomLevelAccelerationStructure  -> BLAS
     createTopLevelAccelerationStructure     -> TLAS
     createStorageImage / createUniformBuffer
     createRayTracingPipeline                -> 描述符布局 + 着色器组 + 管线
     createShaderBindingTable                -> SBT
     createDescriptorSets
④ buildCommandBuffer()                SBT 区域 + vkCmdTraceRaysKHR + 拷贝到交换链
⑤ 构造函数和 getEnabledFeatures()     回头看需要哪些扩展和特性
⑥ rayquery:先读 scene.frag,再看 rayquery.cpp 与 raytracingbasic 的差异
⑦ 其他光追示例(见第 6 节)
```

## 4. raytracingbasic:光追管线全流程

### 4.1 prepare():初始化顺序

`prepare()` 先查询光追管线属性、加载函数指针,然后按下面的顺序创建资源([L781-L790](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingbasic/raytracingbasic.cpp#L781-L790)):

```cpp
// Create the acceleration structures used to render the ray traced scene
createBottomLevelAccelerationStructure();
createTopLevelAccelerationStructure();

createStorageImage();
createUniformBuffer();
createRayTracingPipeline();
createShaderBindingTable();
createDescriptorSets();
prepared = true;
```

顺序是有依赖的:TLAS 需要 BLAS 的设备地址;SBT 需要已创建的管线(句柄从管线里取);描述符集需要 TLAS、存储图像和 UBO 都已就绪。

所有光追函数都通过 `vkGetDeviceProcAddr` 加载成成员函数指针(例如 `vkCmdTraceRaysKHR`),因为它们属于扩展,不在 Vulkan 加载器默认导出的符号里。

### 4.2 BLAS:一个三角形

`createBottomLevelAccelerationStructure()` 用三个顶点、一个索引缓冲区和一个单位变换矩阵描述几何。所有输入缓冲区都带 `VK_BUFFER_USAGE_SHADER_DEVICE_ADDRESS_BIT | VK_BUFFER_USAGE_ACCELERATION_STRUCTURE_BUILD_INPUT_READ_ONLY_BIT_KHR`,再用设备地址填进几何描述([L316-L328](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingbasic/raytracingbasic.cpp#L316-L328)):

```cpp
VkAccelerationStructureGeometryKHR accelerationStructureGeometry{};
accelerationStructureGeometry.sType = VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_KHR;
accelerationStructureGeometry.flags = VK_GEOMETRY_OPAQUE_BIT_KHR;
accelerationStructureGeometry.geometryType = VK_GEOMETRY_TYPE_TRIANGLES_KHR;
accelerationStructureGeometry.geometry.triangles.sType = VK_STRUCTURE_TYPE_ACCELERATION_STRUCTURE_GEOMETRY_TRIANGLES_DATA_KHR;
accelerationStructureGeometry.geometry.triangles.vertexFormat = VK_FORMAT_R32G32B32_SFLOAT;
accelerationStructureGeometry.geometry.triangles.vertexData = vertexBufferDeviceAddress;
accelerationStructureGeometry.geometry.triangles.maxVertex = 2;
accelerationStructureGeometry.geometry.triangles.vertexStride = sizeof(Vertex);
accelerationStructureGeometry.geometry.triangles.indexType = VK_INDEX_TYPE_UINT32;
accelerationStructureGeometry.geometry.triangles.indexData = indexBufferDeviceAddress;
// ...
```

接下来是加速结构构建的标准“四步曲”,在 BLAS 和 TLAS 中各出现一次:

1. 填 `VkAccelerationStructureBuildGeometryInfoKHR`(类型、`PREFER_FAST_TRACE` 标志、几何数组),调用 `vkGetAccelerationStructureBuildSizesKHR` 查询**加速结构大小**和**暂存缓冲区大小**;
2. 按查询结果创建缓冲区(`createAccelerationStructureBuffer`),再用 `vkCreateAccelerationStructureKHR` 在其上创建加速结构对象;
3. 创建暂存缓冲区(`createScratchBuffer`),把它的设备地址填进构建信息,在一次性命令缓冲区中调用 `vkCmdBuildAccelerationStructuresKHR`,提交并等待;
4. 用 `vkGetAccelerationStructureDeviceAddressKHR` 取得加速结构的设备地址,然后删除暂存缓冲区。

示例的注释提到,有些实现支持在主机端构建(`accelerationStructureHostCommands`),但示例选择在设备上构建。

### 4.3 TLAS:一个实例

`createTopLevelAccelerationStructure()` 只放一个实例,引用上面的 BLAS([L406-L412](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingbasic/raytracingbasic.cpp#L406-L412)):

```cpp
VkAccelerationStructureInstanceKHR instance{};
instance.transform = transformMatrix;
instance.instanceCustomIndex = 0;
instance.mask = 0xFF;
instance.instanceShaderBindingTableRecordOffset = 0;
instance.flags = VK_GEOMETRY_INSTANCE_TRIANGLE_FACING_CULL_DISABLE_BIT_KHR;
instance.accelerationStructureReference = bottomLevelAS.deviceAddress;
```

逐个字段对照上一篇的内容:`mask = 0xFF` 配合 `traceRayEXT` 的 `cullMask = 0xff`,保证实例不被剔除;`instanceShaderBindingTableRecordOffset = 0` 让命中时使用命中区域的第 0 条记录;`FACING_CULL_DISABLE` 关闭背面剔除,所以从哪一面看三角形都可见。实例数据放进一个缓冲区,几何类型为 `VK_GEOMETRY_TYPE_INSTANCES_KHR`,其余构建步骤与 BLAS 相同。

### 4.4 光追管线:三个着色器组

`createRayTracingPipeline()` 先创建描述符集布局(binding 0 是加速结构、1 是存储图像、2 是 UBO,都只对 `VK_SHADER_STAGE_RAYGEN_BIT_KHR` 可见),然后依次加入三个着色器组:

| 组下标 | 类型 | 着色器 |
|---|---|---|
| 0 | `VK_RAY_TRACING_SHADER_GROUP_TYPE_GENERAL_KHR` | `raygen.rgen.spv`(`generalShader`) |
| 1 | `VK_RAY_TRACING_SHADER_GROUP_TYPE_GENERAL_KHR` | `miss.rmiss.spv`(`generalShader`) |
| 2 | `VK_RAY_TRACING_SHADER_GROUP_TYPE_TRIANGLES_HIT_GROUP_KHR` | `closesthit.rchit.spv`(`closestHitShader`) |

每个组里没用到的槽位都填 `VK_SHADER_UNUSED_KHR`。最后用 `vkCreateRayTracingPipelinesKHR` 创建管线,其中 `maxPipelineRayRecursionDepth = 1`:光线生成着色器发出一层光线,命中着色器不再继续发光线。

### 4.5 SBT:三个小缓冲区

示例给 raygen、miss、hit 各建了一个只放一个句柄的缓冲区([L518-L540](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingbasic/raytracingbasic.cpp#L518-L540)):

```cpp
void createShaderBindingTable() {
    const uint32_t handleSize = rayTracingPipelineProperties.shaderGroupHandleSize;
    const uint32_t handleSizeAligned = vks::tools::alignedSize(rayTracingPipelineProperties.shaderGroupHandleSize, rayTracingPipelineProperties.shaderGroupHandleAlignment);
    const uint32_t groupCount = static_cast<uint32_t>(shaderGroups.size());
    const uint32_t sbtSize = groupCount * handleSizeAligned;

    std::vector<uint8_t> shaderHandleStorage(sbtSize);
    VK_CHECK_RESULT(vkGetRayTracingShaderGroupHandlesKHR(device, pipeline, 0, groupCount, sbtSize, shaderHandleStorage.data()));

    const VkBufferUsageFlags bufferUsageFlags = VK_BUFFER_USAGE_SHADER_BINDING_TABLE_BIT_KHR | VK_BUFFER_USAGE_SHADER_DEVICE_ADDRESS_BIT;
    const VkMemoryPropertyFlags memoryUsageFlags = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
    VK_CHECK_RESULT(vulkanDevice->createBuffer(bufferUsageFlags, memoryUsageFlags, &raygenShaderBindingTable, handleSize));
    VK_CHECK_RESULT(vulkanDevice->createBuffer(bufferUsageFlags, memoryUsageFlags, &missShaderBindingTable, handleSize));
    VK_CHECK_RESULT(vulkanDevice->createBuffer(bufferUsageFlags, memoryUsageFlags, &hitShaderBindingTable, handleSize));

    // Copy handles
    raygenShaderBindingTable.map();
    missShaderBindingTable.map();
    hitShaderBindingTable.map();
    memcpy(raygenShaderBindingTable.mapped, shaderHandleStorage.data(), handleSize);
    memcpy(missShaderBindingTable.mapped, shaderHandleStorage.data() + handleSizeAligned, handleSize);
    memcpy(hitShaderBindingTable.mapped, shaderHandleStorage.data() + handleSizeAligned * 2, handleSize);
}
```

阅读时值得注意的细节:

- 句柄的顺序就是着色器组的创建顺序(0 = raygen,1 = miss,2 = hit),所以第 1、2 个句柄分别拷进 miss 和 hit 缓冲区。
- 把三个区域放在三个独立缓冲区里,省去了在同一个缓冲区内手动按 `shaderGroupBaseAlignment` 对齐各区域起点的麻烦;代价是要依赖每个缓冲区的起始地址本身满足这个对齐(示例没有显式检查)。
- `vkGetRayTracingShaderGroupHandlesKHR` 输出的句柄是一个紧挨一个、按 `shaderGroupHandleSize` 排列的;示例按 `handleSizeAligned` 的偏移去取。在句柄大小和句柄对齐相等的设备上两者完全一致;如果要移植到两者不同的平台,这里需要改成按 `handleSize` 偏移。
- 只有句柄,没有自定义数据。想看“句柄后面附带数据”的用法,参考 `raytracingsbtdata` 示例。

### 4.6 buildCommandBuffer():发射光线

每帧录制命令时,先用三个缓冲区的设备地址填 `VkStridedDeviceAddressRegionKHR`(stride 和 size 都是 `handleSizeAligned`,callable 区域留空),然后绑定管线和描述符集并发射([L829-L845](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingbasic/raytracingbasic.cpp#L829-L845)):

```cpp
VkStridedDeviceAddressRegionKHR callableShaderSbtEntry{};

/*
    Dispatch the ray tracing commands
*/
vkCmdBindPipeline(cmdBuffer, VK_PIPELINE_BIND_POINT_RAY_TRACING_KHR, pipeline);
vkCmdBindDescriptorSets(cmdBuffer, VK_PIPELINE_BIND_POINT_RAY_TRACING_KHR, pipelineLayout, 0, 1, &descriptorSets[currentBuffer], 0, 0);

vkCmdTraceRaysKHR(
    cmdBuffer,
    &raygenShaderSbtEntry,
    &missShaderSbtEntry,
    &hitShaderSbtEntry,
    &callableShaderSbtEntry,
    width,
    height,
    1);
```

`width × height × 1` 个启动点,每个像素运行一次光线生成着色器。之后的代码把存储图像从 `GENERAL` 布局转到 `TRANSFER_SRC_OPTIMAL`,用 `vkCmdCopyImage` 拷到交换链图像,再把两张图像的布局还原。光追管线没有颜色附件,输出只能写到存储图像里,这是它和光栅化最直观的区别之一。

### 4.7 三个着色器

光线生成着色器根据像素坐标和相机逆矩阵生成光线([raygen.rgen L15-L33](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/raytracingbasic/raygen.rgen#L15-L33)):

```glsl
void main() 
{
    const vec2 pixelCenter = vec2(gl_LaunchIDEXT.xy) + vec2(0.5);
    const vec2 inUV = pixelCenter/vec2(gl_LaunchSizeEXT.xy);
    vec2 d = inUV * 2.0 - 1.0;

    vec4 origin = cam.viewInverse * vec4(0,0,0,1);
    vec4 target = cam.projInverse * vec4(d.x, d.y, 1, 1) ;
    vec4 direction = cam.viewInverse*vec4(normalize(target.xyz), 0) ;

    float tmin = 0.001;
    float tmax = 10000.0;

    hitValue = vec3(0.0);

    traceRayEXT(topLevelAS, gl_RayFlagsOpaqueEXT, 0xff, 0, 0, 0, origin.xyz, tmin, direction.xyz, tmax, 0);

    imageStore(image, ivec2(gl_LaunchIDEXT.xy), vec4(hitValue, 0.0));
}
```

对照 [Ray Query 与光追管线](/rt-docs/05-notes/03-ray-query-vs-pipeline/) 中的参数表:光线标志 `gl_RayFlagsOpaqueEXT`、剔除掩码 `0xff`、`sbtRecordOffset = 0`、`sbtRecordStride = 0`、`missIndex = 0`,最后的 `0` 是负载 `hitValue` 的 location。像素中心加 0.5 再映射到 $[-1, 1]$,用投影逆矩阵还原观察空间方向,再用视图逆矩阵变到世界空间——和光栅化的变换方向正好相反。

最近命中着色器只有一件事:把 `hitAttributeEXT vec2 attribs` 还原成三个重心坐标作为颜色输出([closesthit.rchit](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/raytracingbasic/closesthit.rchit)):

```glsl
layout(location = 0) rayPayloadInEXT vec3 hitValue;
hitAttributeEXT vec2 attribs;

void main()
{
  const vec3 barycentricCoords = vec3(1.0f - attribs.x - attribs.y, attribs.x, attribs.y);
  hitValue = barycentricCoords;
}
```

这就是画面上三个角分别是红、绿、蓝的原因,也正好验证了第一篇里“`attribs` 就是 $(u, v)$”的说法。未命中着色器把 `hitValue` 设为 `vec3(0.0, 0.0, 0.2)`,即深蓝色背景。

### 4.8 扩展与特性

构造函数里打开的设备扩展([L91-L103](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingbasic/raytracingbasic.cpp#L91-L103))是 `VK_KHR_acceleration_structure`、`VK_KHR_ray_tracing_pipeline`,以及它们的依赖 `VK_KHR_buffer_device_address`、`VK_KHR_deferred_host_operations`、`VK_EXT_descriptor_indexing`、`VK_KHR_spirv_1_4`、`VK_KHR_shader_float_controls`;`apiVersion` 设为 Vulkan 1.1。`getEnabledFeatures()` 用 `pNext` 链依次打开 `accelerationStructure`、`rayTracingPipeline`、`bufferDeviceAddress` 三个特性,另外打开 `shaderStorageImageWriteWithoutFormat`,因为存储图像的格式取自交换链,运行时才知道,着色器里没有写格式限定符。

## 5. rayquery:在片段着色器里做阴影

### 5.1 与 raytracingbasic 的差异

`rayquery` 继承了 `VulkanRaytracingSample`,并在构造函数里设置 `rayQueryOnly = true`,再追加 `VK_KHR_RAY_QUERY_EXTENSION_NAME`。基类的 `enableExtensions()` 会据此**跳过**光追管线扩展([VulkanRaytracingSample.cpp L111-L120](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/base/VulkanRaytracingSample.cpp#L111-L120)):

```cpp
void VulkanRaytracingSample::enableExtensions()
{
    // Require Vulkan 1.1
    apiVersion = VK_API_VERSION_1_1;

    // Ray tracing related extensions required by this sample
    enabledDeviceExtensions.push_back(VK_KHR_ACCELERATION_STRUCTURE_EXTENSION_NAME);
    if (!rayQueryOnly) {
        enabledDeviceExtensions.push_back(VK_KHR_RAY_TRACING_PIPELINE_EXTENSION_NAME);
    }
    // ...
```

整体结构对照:

| | raytracingbasic | rayquery |
|---|---|---|
| 基类 | `VulkanExampleBase` | `VulkanRaytracingSample`(`rayQueryOnly = true`) |
| 场景 | 手写的一个三角形 | glTF 模型 `models/vulkanscene_shadow.gltf` |
| 开启的特性 | `accelerationStructure`、`rayTracingPipeline`、`bufferDeviceAddress` | `rayQuery`、`accelerationStructure`、`bufferDeviceAddress` |
| 管线 | 光追管线 + SBT | 普通图形管线(`scene.vert` + `scene.frag`) |
| 描述符 | binding 0 加速结构、1 存储图像、2 UBO(都给 raygen) | binding 0 UBO(给顶点着色器)、1 加速结构(给片段着色器) |
| 命令缓冲区 | `vkCmdTraceRaysKHR` + 拷贝到交换链 | 普通的 render pass + `scene.draw()` |

`prepare()` 的顺序是:`VulkanRaytracingSample::prepare()`(查询属性、加载函数指针)→ `loadAssets()` → `prepareUniformBuffers()` → `createBottomLevelAccelerationStructure()` → `createTopLevelAccelerationStructure()` → `setupDescriptors()` → `preparePipelines()`。

两个值得注意的地方:

- **glTF 缓冲区要能作为构建输入**。`loadAssets()` 在加载模型之前设置 `vkglTF::memoryPropertyFlags`,把 `VK_BUFFER_USAGE_ACCELERATION_STRUCTURE_BUILD_INPUT_READ_ONLY_BIT_KHR | VK_BUFFER_USAGE_SHADER_DEVICE_ADDRESS_BIT | VK_BUFFER_USAGE_STORAGE_BUFFER_BIT` 加进去。虽然变量名叫 memoryPropertyFlags,但在 `base/VulkanglTFModel.cpp` 中它被按位或进了顶点 / 索引缓冲区的 **usage** 标志。BLAS 直接用这两个缓冲区的设备地址构建,三角形数为 `scene.indices.count / 3`,顶点步长为 `sizeof(vkglTF::Vertex)`。
- **描述符写入的小细节**。`setupDescriptors()` 中加速结构的写入既出现在 `writeDescriptorSets` 的初始化列表里,又被 `push_back` 了一次(对同一个 binding 写两次,结果相同);UBO 写入使用的是 `uniformBuffers[currentBuffer]` 而不是循环变量 `i`,而 `currentBuffer` 在此时为初始值 0。读代码时不要被这些细节误导,它们不影响理解 Ray Query 本身。

### 5.2 scene.frag:一次 Proceed 就够

片段着色器先算普通的漫反射,然后从片段的世界坐标朝光源方向发一条查询([scene.frag L27-L36](https://github.com/SaschaWillems/Vulkan/blob/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/shaders/glsl/rayquery/scene.frag#L27-L36)):

```glsl
rayQueryEXT rayQuery;
rayQueryInitializeEXT(rayQuery, topLevelAS, gl_RayFlagsTerminateOnFirstHitEXT, 0xFF, inWorldPos, 0.01, L, 1000.0);

// Traverse the acceleration structure and store information about the first intersection (if any)
rayQueryProceedEXT(rayQuery);

// If the intersection has hit a triangle, the fragment is shadowed
if (rayQueryGetIntersectionTypeEXT(rayQuery, true) == gl_RayQueryCommittedIntersectionTriangleEXT ) {
    outFragColor.rgb *= 0.1;
}
```

为什么这里没有 `while` 循环?因为 BLAS 的几何带有 `VK_GEOMETRY_OPAQUE_BIT_KHR`,TLAS 中只有不透明三角形,遍历中不会出现需要着色器裁决的候选,第一次 `rayQueryProceedEXT` 就会跑完整个遍历(并因 `TerminateOnFirstHit` 在第一个命中处停下)。之后用 `committed = true` 读取结果即可。如果场景里有 alpha 测试的几何,就必须改成上一篇中的循环写法。

`tMin = 0.01` 用来避免片段从自己所在的表面出发又打中自己(阴影痤疮);光线方向 `L` 来自顶点着色器计算的光源方向。光源位置在 `updateLight()` 中随时间运动,所以阴影是动态的——而 BLAS/TLAS 只在初始化时构建一次,因为几何本身不动。

## 6. 仓库中的其他光追示例

下面这些示例都已在仓库中确认存在(`examples/<名字>/<名字>.cpp`,GLSL 着色器在 `shaders/glsl/<名字>/`)。硬件光追示例中,除 `raytracingbasic` 和 `raytracingsbtdata` 直接继承 `VulkanExampleBase` 外,其余都继承 `VulkanRaytracingSample`;`computeraytracing` 不使用光追扩展,同样继承 `VulkanExampleBase`。

| 示例 | 内容(依据仓库 README 和源文件头注释) | GLSL 着色器文件 |
|---|---|---|
| [raytracingshadows](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingshadows) | 在更复杂的场景中用多个命中 / 未命中着色器实现光追阴影 | `raygen.rgen`、`miss.rmiss`、`shadow.rmiss`、`closesthit.rchit` |
| [raytracingreflections](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingreflections) | 在着色器中递归追踪,实现实时反射 | `raygen.rgen`、`miss.rmiss`、`closesthit.rchit` |
| [raytracingcallable](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingcallable) | 最近命中着色器根据几何体编号调用不同的可调用着色器 | `callable1/2/3.rcall`、`raygen.rgen`、`miss.rmiss`、`closesthit.rchit` |
| [raytracingintersection](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingintersection) | 只传 AABB 和球体描述,用相交着色器计算程序化球体 | `intersection.rint`、`raygen.rgen`、`miss.rmiss`、`closesthit.rchit` |
| [raytracingsbtdata](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingsbtdata) | 用每条 SBT 记录的数据段给背景和几何体着色 | `raygen.rgen`、`miss.rmiss`、`closesthit.rchit` |
| [raytracingtextures](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingtextures) | 最近命中着色器中的纹理映射、任意命中着色器中丢弃交点实现透明、用缓冲区设备地址访问网格数据 | `anyhit.rahit`、`closesthit.rchit`、`raygen.rgen`、`miss.rmiss` 等 |
| [raytracinggltf](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracinggltf) | 用光线追踪渲染带纹理的 glTF 模型,通过帧累积实现透明和抗锯齿 | `anyhit.rahit`、`shadow.rmiss`、`random.glsl`、`payload.glsl` 等 |
| [raytracingpositionfetch](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/raytracingpositionfetch) | 用 `VK_KHR_ray_tracing_position_fetch` 在着色器中直接从加速结构取命中三角形的顶点位置 | `raygen.rgen`、`miss.rmiss`、`closesthit.rchit` |
| [computeraytracing](https://github.com/SaschaWillems/Vulkan/tree/d2d49bf7f2d8469ad9fee47b2a43b430d7e10e1b/examples/computeraytracing) | 不使用光追扩展,在 compute shader 中实现的简单光追器(阴影和反射),可与软件光追对照 | `raytracing.comp`、`texture.vert`、`texture.frag` |

读完本文的两个示例后,推荐接着读 `raytracingshadows`:它的 `closesthit.rchit` 里用 `gl_RayFlagsTerminateOnFirstHitEXT | gl_RayFlagsOpaqueEXT | gl_RayFlagsSkipClosestHitShaderEXT` 发阴影光线,`missIndex = 1` 选中 `shadow.rmiss`,负载放在 location 2——正好是 [上一篇](/rt-docs/05-notes/03-ray-query-vs-pipeline/) 6.1 节写法的真实版本,可以和本文的 `rayquery` 对照着看同一种效果的两种实现。

## 自测问题

1. `raytracingbasic` 的 `prepare()` 中,为什么 `createShaderBindingTable()` 必须在 `createRayTracingPipeline()` 之后?
2. `raytracingbasic` 的命中区域只有一条记录。结合实例的 `instanceShaderBindingTableRecordOffset` 和 `traceRayEXT` 的参数,说明命中时使用的记录下标是多少。
3. 为什么 `raytracingbasic` 要把结果写进存储图像再拷贝到交换链,而 `rayquery` 不需要?
4. `rayquery` 的片段着色器只调用一次 `rayQueryProceedEXT`,为什么结果仍然正确?什么情况下这样写会出错?
5. `rayquery` 开启了哪些设备特性?和 `raytracingbasic` 相比少了哪一个?

<details>
<summary>参考答案</summary>

1. SBT 的内容是着色器组句柄,要用 `vkGetRayTracingShaderGroupHandlesKHR(device, pipeline, ...)` 从已创建的管线里取出。
2. 公式为 实例偏移 + `sbtRecordOffset` + 几何下标 × `sbtRecordStride` = 0 + 0 + 0 × 0 = 0,即命中区域中唯一的那条记录(closest-hit 组)。
3. 光追管线没有颜色附件,光线生成着色器只能通过 `imageStore` 写存储图像,再拷贝(或用其他 pass 合成)到交换链。`rayquery` 运行在普通的图形管线中,片段着色器直接输出到 render pass 的颜色附件。
4. 场景中所有几何都是不透明的,遍历过程中没有需要着色器裁决的候选,第一次 Proceed 就会完成遍历。若存在非不透明几何(例如需要 alpha 测试的树叶),Proceed 会在候选处返回 `true`,必须在循环中确认或忽略候选并继续调用 Proceed,只调用一次就会得到不完整的结果。
5. `rayQuery`、`accelerationStructure`、`bufferDeviceAddress`。与 `raytracingbasic` 相比少了 `rayTracingPipeline`(对应扩展 `VK_KHR_ray_tracing_pipeline` 也没有开启)。

</details>

## 延伸阅读

- 仓库主页:[SaschaWillems/Vulkan](https://github.com/SaschaWillems/Vulkan)(README 中“Hardware accelerated ray tracing”一节列出了全部光追示例)
- 构建说明:[BUILD.md](https://github.com/SaschaWillems/Vulkan/blob/master/BUILD.md)
- 本站:[Vulkan 光线追踪:Ray Query 与光追管线](/rt-docs/05-notes/03-ray-query-vs-pipeline/)
- 本站:[NVIDIA 教程:从光栅化到光线追踪](/rt-docs/03-nvidia-tutorial/02-raster-to-rt/)
- 本站:[NVIDIA 概念详解:着色器绑定表](/rt-docs/04-nvidia-concepts/02-shader-binding-table/)

示例代码片段摘自 SaschaWillems/Vulkan,MIT License。
