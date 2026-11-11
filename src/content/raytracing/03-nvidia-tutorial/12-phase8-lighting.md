---
title: "12. 阶段 8:光照与阴影(Phase 8: Lighting and Shadows)"
order: 12
description: "加入阴影光线测试、按光源类型处理距离衰减与聚光灯锥角衰减,并把太阳参数接入光照,得到带真实阴影的最终光线追踪画面。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Phase 8: Lighting and Shadows"
license: "Apache-2.0"
---

## 阶段概览

**阶段目标**:加入正确的光照计算和阴影测试,在光线追踪场景中实现逼真的光照效果。

- 不熟悉 BRDF、BSDF、PDF、NEE 或 MIS 这些术语?请参阅[通俗易懂的渲染指南](https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/concepts/rendering.md)。

- 实现阴影光线(shadow ray)测试,以投射准确的阴影
- 加入正确的光源处理,包括距离衰减和锥角衰减
- 把天空光照与太阳参数整合起来
- 用考虑阴影的光照计算来增强最近命中着色器(closest-hit)

**预期结果**:光线追踪场景具有逼真的光照、阴影和正确的光源衰减,视觉质量达到甚至超过原来的光栅化场景。

## 代码修改

### 步骤 8.1:添加阴影测试函数

把下面的阴影测试函数添加到 `rtbasic.slang` 文件中:

```hlsl
//-----------------------------------------------------------------------
// SHADOW TESTING
//-----------------------------------------------------------------------
float testShadow(float3 worldPos, float3 worldNormal, float3 lightDirection, GltfPunctual light)
{
  RayDesc shadowRay;
  shadowRay.Origin    = worldPos + worldNormal * 0.001;  // Offset to avoid self-intersection
  shadowRay.Direction = normalize(lightDirection);
  shadowRay.TMin      = 0.001;
  shadowRay.TMax      = light.type == GltfLightType::eDirectional ? INFINITE : length(lightDirection);

  // Create a simple payload for shadow ray
  HitPayload shadowPayload = {};

  // Trace the shadow ray with optimized flags
  TraceRay(topLevelAS, RAY_FLAG_ACCEPT_FIRST_HIT_AND_END_SEARCH | RAY_FLAG_SKIP_CLOSEST_HIT_SHADER, 0xff, 0, 0, 0,
           shadowRay, shadowPayload);

  // If the shadow ray hit something, the light is occluded
  return shadowPayload.depth != MISS_DEPTH ? 0.0 : 1.0;
}
```

> **译注**:阴影光线只关心“有没有被挡住”,所以使用 `RAY_FLAG_ACCEPT_FIRST_HIT_AND_END_SEARCH`(找到任意一个命中就停止遍历)和 `RAY_FLAG_SKIP_CLOSEST_HIT_SHADER`(不执行最近命中着色器)。如果光线没有命中任何物体,未命中着色器会把 `payload.depth` 设为 `MISS_DEPTH`,据此即可判断光源是否被遮挡。

### 步骤 8.2:添加光源处理函数

添加下面这个函数,用来处理不同类型的光源以及与天空的整合:

```hlsl
//-----------------------------------------------------------------------
// Handles sky override, point light distance attenuation, and spot light cone attenuation
//-----------------------------------------------------------------------
GltfPunctual processLight(GltfSceneInfo sceneInfo, float3 worldPos)
{
  GltfPunctual light = sceneInfo.punctualLights[0];  // Using the first light for simplicity

  // Sky override: replace punctual light with sun parameters
  if(sceneInfo.useSky == 1)
  {
    light.direction = sceneInfo.skySimpleParam.sunDirection;
    light.color     = sceneInfo.skySimpleParam.sunColor;
    light.intensity = sceneInfo.skySimpleParam.sunIntensity;
    light.type      = GltfLightType::eDirectional;
  }

  // Point light: calculate direction and apply distance attenuation
  if(light.type == GltfLightType::ePoint)
  {
    light.direction = light.position - worldPos;
    float d         = length(light.direction);
    light.intensity /= (d * d);  // Inverse square law
  }
  // Spot light: calculate direction, apply distance and cone attenuation
  else if(light.type == GltfLightType::eSpot)
  {
    float3 lightDir = light.position - worldPos;
    float  d        = length(lightDir);
    light.intensity /= (d * d);  // Distance attenuation
    
    // Cone attenuation
    float theta         = dot(normalize(lightDir), normalize(light.direction));
    float spotIntensity = clamp((theta - cos(light.coneAngle)) / (1.0 - cos(light.coneAngle)), 0.0, 1.0);
    light.intensity *= spotIntensity;
    light.direction = lightDir;
  }

  return light;
}
```

### 步骤 8.3:用考虑阴影的光照更新最近命中着色器

更新最近命中着色器,让它使用新的光照和阴影函数。把原有的光照计算替换为:

```hlsl
// Process light with sky override and distance attenuation
GltfPunctual light = processLight(sceneInfo, worldPos);

float3 N = normalize(worldNormal);
float3 V = -WorldRayDirection();
float3 L = normalize(light.direction);

// Test for shadows
float shadowFactor = testShadow(worldPos, N, light.direction, light);

// Calculate PBR lighting with shadow factor
float3 color = pbrMetallicRoughness(albedo, metallic, roughness, N, V, L);
color *= light.color * light.intensity * shadowFactor;

payload.color = color;
```

#### 本次更新的主要改进

- **阴影测试**:每个光源的贡献都会用阴影光线测试是否被遮挡
- **光源处理**:正确处理不同类型的光源(方向光、点光源、聚光灯)
- **天空整合**:启用天空渲染时自动使用太阳参数
- **距离衰减**:点光源和聚光灯呈现逼真的衰减
- **锥角衰减**:聚光灯具有正确的锥形光照范围

## 第 8 阶段检查点

**到这一步,你的应用程序应该:**

✅ **编译成功**,没有错误或警告  
✅ **运行时不崩溃**,并显示**带有逼真阴影的光线追踪场景**  
✅ **场景中的物体能正确投射阴影**  
✅ **光照逼真**,光源衰减和天空整合都正确  
✅ **点光源和聚光灯呈现正确的距离衰减和锥角衰减**  
✅ **启用天空时整合了太阳光照参数**  
✅ **加入阴影光线测试后仍保持可接受的帧率**  

**预期的画面结果:**

![第 8 阶段的最终画面](/raytracing/nvidia/phase8_2.png)

## 接下来

第 8 阶段完成了从光栅化到光线追踪的核心转换。到这一步,你已经拥有:

- **完整的光线追踪管线**:从光线生成到考虑阴影的材质着色
- **光照**:带有阴影投射的正确光照
- **多种光源类型**:方向光、点光源和聚光灯,并带有相应的衰减
- **天空整合**:启用天空渲染时自动使用太阳光照

从光栅化到光线追踪的转换在功能上已经完成。光线追踪出的场景应该达到甚至超过原光栅化场景的视觉质量。

## 🏆 最终成果

至此,你已经成功地把光栅化应用程序转换成了光线追踪:

- **完整的光线追踪管线**:从光线生成到考虑阴影的材质着色
- **正确的材质着色**:使用金属度-粗糙度(metallic-roughness)材质的 PBR 光照
- **硬阴影**:通过阴影光线测试投射准确的阴影
- **多种光源类型**:方向光、点光源和聚光灯,并带有正确的衰减
- **天空整合**:背景和天空渲染,并使用太阳光照参数
- **视觉一致**:光线追踪场景的质量达到甚至超过原光栅化场景
