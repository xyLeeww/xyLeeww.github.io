---
title: "11. 阶段 7:材质着色(Phase 7: Material Shading)"
order: 11
description: "在最近命中着色器中读取顶点属性并做 PBR 材质着色,再让未命中着色器支持纯色背景和天空,使光线追踪画面与原光栅化场景一致。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Phase 7: Material Shading"
license: "Apache-2.0"
---

## 阶段概览

**阶段目标**:为最近命中着色器(closest-hit)加入正确的材质着色,使画面与原来的光栅化场景一致。

- 在最近命中着色器中实现正确的材质着色
- 加入 PBR 光照计算
- 根据光线交点提取顶点属性(位置、法线、UV)
- 达到与原光栅化场景相同的视觉质量

**预期结果**:光线追踪出的场景带有正确的材质着色,与原光栅化场景一致。到这一步,从光栅化到光线追踪的转换就完成了。

**交互式更新**:由于这一阶段只修改着色器,在编辑着色器代码时应用程序可以一直保持运行。保存着色器文件后,确保应用程序窗口处于焦点状态并按 F5,或者在菜单中选择 “Reload Shaders”,就能看到修改生效。

## 代码修改

### 步骤 7.1:增强最近命中着色器

用增强后的最近命中着色器更新 `rtbasic.slang` 文件:

为了使用实现 PBR 材质求值的函数,添加以下内容:

```hlsl
#include "common/shaders/pbr.h.slang"
```

为了访问场景的几何数据,我们需要下面这些访问函数:

```hlsl

__generic<T : IFloat> T getAttribute(uint8_t* dataBufferAddress, BufferView bufferView, uint attributeIndex)
{
  if(bufferView.count > 0)
  {
    T* ptr = (T*)(dataBufferAddress + bufferView.offset + attributeIndex * bufferView.byteStride);
    return ptr[0];
  }

  return T(1);  // Error case
}

uint3 getTriangleIndices(uint8_t* dataBufferAddress, const TriangleMesh mesh, uint primitiveID)
{
  if(mesh.indices.byteStride == sizeof(uint16_t))
  {
    uint16_t3* indices = (uint16_t3*)(dataBufferAddress + mesh.indices.offset);
    return indices[primitiveID];
  }
  else if(mesh.indices.byteStride == sizeof(uint32_t))
  {
    uint3* indices = (uint3*)(dataBufferAddress + mesh.indices.offset);
    return indices[primitiveID];
  }

  return uint3(0xFFFFFFFFu);  // Error case
}

__generic<T : IFloat> T getTriangleAttribute(uint8_t* dataBufferAddress, BufferView bufferView, uint3 attributeIndex, float3 barycentrics)
{
  T attr0 = getAttribute<T>(dataBufferAddress, bufferView, attributeIndex.x);
  T attr1 = getAttribute<T>(dataBufferAddress, bufferView, attributeIndex.y);
  T attr2 = getAttribute<T>(dataBufferAddress, bufferView, attributeIndex.z);
  return T(barycentrics.x) * attr0 + T(barycentrics.y) * attr1 + T(barycentrics.z) * attr2;
}
```

#### 增强最近命中着色器

下面我们从清晰性、正确性和健壮性几个方面改进最近命中着色器:确保正确地访问顶点属性、正确地变换到世界空间,并使用物理上更合理的 PBR 着色。我们还会加入错误处理和注释,让代码更易读。

```hlsl
// Closest hit shader
[shader("closesthit")]
void rchitMain(inout HitPayload payload, in BuiltInTriangleIntersectionAttributes attr)
{
    // Get barycentric coordinates
    float3 barycentrics = float3(1 - attr.barycentrics.x - attr.barycentrics.y, attr.barycentrics.x, attr.barycentrics.y);
    
    // Get instance and primitive information
    uint instanceID = InstanceIndex();
    uint meshID = InstanceID();
    uint triID = PrimitiveIndex();

    GltfSceneInfo sceneInfo = pushConst.sceneInfoAddress[0];
    GltfInstance instance = sceneInfo.instances[instanceID];
    GltfMesh mesh = sceneInfo.meshes[instance.meshIndex];
    GltfMetallicRoughness material = sceneInfo.materials[instance.materialIndex];

    // Get world position and normal
    uint3 indices = getTriangleIndices(mesh.gltfBuffer, mesh.triMesh, triID);
    float3 pos = getTriangleAttribute<float3>(mesh.gltfBuffer, mesh.triMesh.positions, indices, barycentrics);
    float3 nrm = getTriangleAttribute<float3>(mesh.gltfBuffer, mesh.triMesh.normals, indices, barycentrics);
    float3 worldPos = float3(mul(float4(pos, 1.0), ObjectToWorld4x3()));
    float3 worldNormal = normalize(mul(WorldToObject4x3(), nrm).xyz);

    // Simple PBR shading
    float3 albedo = material.baseColorFactor.xyz;
    float metallic = material.metallicFactor;
    float roughness = material.roughnessFactor;
    
    float3 N = normalize(worldNormal);
    float3 V = -WorldRayDirection();
    float3 L = normalize(sceneInfo.punctualLights[0].direction);
    
    float3 color = pbrMetallicRoughness(albedo, metallic, roughness, N, V, L);
    color *= sceneInfo.punctualLights[0].color * sceneInfo.punctualLights[0].intensity;
    
    payload.color = color;
}
```

> **注意**:着色器中的 `InstanceID()` 返回的是构建顶层加速结构(TLAS)实例时我们设置的 `instanceCustomIndex` 值。本教程中我们赋值为 `ray_inst.instanceCustomIndex = instance.meshIndex;`,因此 `InstanceID()` 直接对应每个实例的网格索引,这样就能在着色器中快速取得与网格相关的数据。你也可以在 `instanceCustomIndex` 中存放材质索引、物体 ID 或任何其他自定义值,以便在光线追踪着色器中高效地访问每个实例的信息。

如果运行程序(或重新加载着色器),你应该会看到:

![第 7 阶段步骤 7.1 的结果](/raytracing/nvidia/phase7_1.png)

### 步骤 7.2:增强未命中着色器

更新未命中着色器(miss),让它负责天空的渲染:

```hlsl
#include "nvshaders/sky_functions.h.slang"

#define MISS_DEPTH 1000
```

```hlsl
// Miss shader
[shader("miss")]
void rmissMain(inout HitPayload payload)
{
    GltfSceneInfo sceneInfo = pushConst.sceneInfoAddress[0];
    
    if(sceneInfo.useSky == 1)
    {
        float3 skyColor = evalSimpleSky(sceneInfo.skySimpleParam, WorldRayDirection());
        payload.color += skyColor * payload.weight;
    }
    else
    {
        payload.color += sceneInfo.backgroundColor * payload.weight;
    }
    
    payload.depth = MISS_DEPTH;
}
```

现在就可以修改背景颜色,或者使用太阳与天空了:

| 纯色背景 | 太阳与天空 |
|--|--|
|![纯色背景](/raytracing/nvidia/phase7_2_1.png) | ![太阳与天空](/raytracing/nvidia/phase7_2_2.png)|

## 第 7 阶段检查点

**到这一步,你的应用程序应该:**

✅ **编译成功**,没有错误或警告  
✅ **运行时不崩溃**,并显示**着色正确的光线追踪场景**  
✅ **呈现逼真的材质着色**,与原光栅化场景一致  
✅ **PBR 光照正常工作**,材质属性正确  

**预期的画面改进:**

- 物体显示正确的材质颜色,而不再是纯红色
- 材质会根据其属性呈现金属感或粗糙感
- 背景可以是纯色,也可以是逼真的天空

## 重要说明

**🌞 找到太阳:**

太阳默认位于较高的位置(这样在第 8 阶段能得到更好的光照)。要在天空中找到太阳:

- **向上看**:使用 **ALT + 鼠标左键** 环顾四周,而不移动相机
- **调整位置**:在 Settings → Environment → Use Sky 中,调整 **Elevation**(仰角,约 5–15°)和 **Azimuth**(方位角,约 -70°)

![太阳位置设置](/raytracing/nvidia/sun_pos.png)

> **第 7 阶段的局限**:调整太阳位置只会让它**在天空中的视觉位置**发生移动(由未命中着色器绘制),但**不会影响物体上的光照**。物体光照使用的是固定的 `sceneInfo.punctualLights[0].direction`。太阳与光照会在第 8 阶段通过 `processLight()` 函数联系起来。

**🎮 相机控制:**

- **鼠标左键 + 拖动**:围绕中心点旋转(可以转到地面以下)
- **ALT + 鼠标左键 + 拖动**:在相机位置上环顾四周(最适合用来寻找太阳)
- **鼠标中键 + 拖动**:平移相机
- **滚轮**:缩放
- **鼠标右键 + 拖动**:推拉(dolly,向前/向后移动)
