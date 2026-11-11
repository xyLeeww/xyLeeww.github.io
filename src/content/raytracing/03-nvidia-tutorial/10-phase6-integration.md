---
title: "10. 阶段 6:集成与渲染(Phase 6: Integration and Rendering)"
order: 10
description: "把光线追踪管线接入渲染循环,用 vkCmdTraceRaysKHR 取代光栅化,第一次看到光线追踪的输出,并支持着色器热重载。"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md#-phase-6-integration-and-rendering"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Phase 6: Integration and Rendering"
license: "Apache-2.0"
---

## 阶段概览

**阶段目标**:用光线追踪取代光栅化渲染,看到第一张光线追踪输出的画面。

- 创建光线追踪渲染方法
- 为 TLAS 和输出图像添加正确的描述符绑定
- 更新 onRender 方法,改用光线追踪
- 添加光栅化与光线追踪之间的切换开关

**预期结果**:完整的光线追踪管线开始工作,画面中是灰色背景上的纯红色物体。你可以在光栅化和光线追踪之间切换,对比两者的差异。

## 代码改动

### 步骤 6.1:创建光线追踪渲染方法

添加下面这个方法来处理光线追踪渲染:

```cpp
void raytraceScene(VkCommandBuffer cmd)
{
    NVVK_DBG_SCOPE(cmd);  // <-- Helps to debug in NSight

    // Ray trace pipeline
    vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_RAY_TRACING_KHR, m_rtPipeline);

    // Bind the descriptor sets for the graphics pipeline (making textures available to the shaders)
    const VkBindDescriptorSetsInfo bindDescriptorSetsInfo{.sType = VK_STRUCTURE_TYPE_BIND_DESCRIPTOR_SETS_INFO,
                                                          .stageFlags = VK_SHADER_STAGE_ALL,
                                                          .layout = m_rtPipelineLayout,
                                                          .firstSet = 0,
                                                          .descriptorSetCount = 1,
                                                          .pDescriptorSets = m_descPack.getSetPtr()};
    vkCmdBindDescriptorSets2(cmd, &bindDescriptorSetsInfo);

    // Push descriptor sets for ray tracing
    nvvk::WriteSetContainer write{};
    write.append(m_rtDescPack.makeWrite(shaderio::BindingPoints::eTlas), m_tlasAccel);
    write.append(m_rtDescPack.makeWrite(shaderio::BindingPoints::eOutImage), m_gBuffers.getColorImageView(eImgRendered),
                 VK_IMAGE_LAYOUT_GENERAL);
    vkCmdPushDescriptorSetKHR(cmd, VK_PIPELINE_BIND_POINT_RAY_TRACING_KHR, m_rtPipelineLayout, 1, write.size(), write.data());

    // Push constant information
    shaderio::TutoPushConstant pushValues{
        .sceneInfoAddress = (shaderio::GltfSceneInfo*)m_sceneResource.bSceneInfo.address,
    };
    const VkPushConstantsInfo pushInfo{.sType = VK_STRUCTURE_TYPE_PUSH_CONSTANTS_INFO,
                                       .layout = m_rtPipelineLayout,
                                       .stageFlags = VK_SHADER_STAGE_ALL,
                                       .size = sizeof(shaderio::TutoPushConstant),
                                       .pValues = &pushValues};
    vkCmdPushConstants2(cmd, &pushInfo);

    // Ray trace
    const VkExtent2D& size = m_app->getViewportSize();
    vkCmdTraceRaysKHR(cmd, &m_raygenRegion, &m_missRegion, &m_hitRegion, &m_callableRegion, size.width, size.height, 1);

    // Barrier to make sure the image is ready for Tonemapping
    nvvk::cmdMemoryBarrier(cmd, VK_PIPELINE_STAGE_2_RAY_TRACING_SHADER_BIT_KHR, VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT);
}
```

这个函数首先绑定光线追踪管线,接着绑定为着色器提供场景纹理的描述符集。然后,它使用推送描述符集(push descriptor set)来指定顶层加速结构(TLAS)以及写入光线追踪结果的输出图像。两条管线写入的是同一张目标图像——光栅化通过帧缓冲区的颜色附件写入,光线追踪则通过存储图像(storage image)绑定写入——这一点在[《像素究竟写到哪里:目标图像》](/raytracing/03-nvidia-tutorial/02-raster-to-rt/)中已经介绍过。推送常量(push constant)的设置方式与图形管线类似,用来向着色器提供每帧的数据。随后函数调用 `vkCmdTraceRaysKHR`,派发光线追踪管线并执行相关的着色器。最后,一个内存屏障(barrier)确保光线追踪图像在交给色调映射器(tonemapper)做后处理之前已经完全写好。

> **译注**:`vkCmdTraceRaysKHR` 的最后三个参数是派发的宽、高、深度。这里按视口大小派发,相当于每个像素启动一次光线生成着色器,着色器中的 `DispatchRaysIndex()` 就是当前像素坐标。

### 步骤 6.2:更新场景缓冲区以支持光线追踪

**重要**:`updateSceneBuffer()` 函数需要更新,加入光线生成所需的逆矩阵。光线生成着色器使用这些矩阵把屏幕坐标转换为世界空间中的光线。

找到 `updateSceneBuffer()` 方法,按下面所示加入两行逆矩阵代码:

```cpp
m_sceneResource.sceneInfo.viewProjMatrix = projMatrix * viewMatrix;   // Combine the view and projection matrices
m_sceneResource.sceneInfo.projInvMatrix  = glm::inverse(projMatrix);  // Inverse projection matrix (NEW)
m_sceneResource.sceneInfo.viewInvMatrix  = glm::inverse(viewMatrix);  // Inverse view matrix (NEW)
m_sceneResource.sceneInfo.cameraPosition = m_cameraManip->getEye();   // Get the camera position
```

**为什么需要这些矩阵**:

- `projInvMatrix`:在光线生成着色器中用于把屏幕坐标转换到观察空间(view space)
- `viewInvMatrix`:用于把光线起点和方向从观察空间变换到世界空间
- 有了这些矩阵,光线生成着色器才能为每个像素生成正确的相机光线

### 步骤 6.3:添加光线追踪开关

添加一个成员变量,用于在光栅化和光线追踪之间切换:

```cpp
// Ray tracing toggle
bool m_useRayTracing = true;  // Set to true to use ray tracing, false for rasterization
```

### 步骤 6.4:更新 onRender 方法

更新 `onRender()` 方法,改用光线追踪:

```cpp
void onRender(VkCommandBuffer cmd)
{
    // Update the scene information buffer, this cannot be done in between dynamic rendering
    updateSceneBuffer(cmd);

    if(m_useRayTracing)
    {
        raytraceScene(cmd);
    }
    else
    {
        rasterScene(cmd);
    }

    postProcess(cmd);
}
```

### 步骤 6.5:添加 UI 开关(可选)

在 `onUIRender()` 方法中 `ImGui::Begin("Settings")` 部分的开头,加入下面的 UI 开关,以便在光栅化和光线追踪之间切换:

```cpp
// Ray tracing toggle
ImGui::Checkbox("Use Ray Tracing", &m_useRayTracing);
```

### 步骤 6.6:更新着色器重载逻辑以支持光线追踪

**重要**:更新 `onUIMenu()` 方法,使其在光栅化和光线追踪两种模式下都能处理着色器重载。这样无论当前使用哪种渲染模式,按 F5 或选择“Reload Shaders”都能正常工作。

找到 `onUIMenu()` 方法,更新其中的重载逻辑:

```cpp
void onUIMenu() override
{
  bool reload = false;
  if(ImGui::BeginMenu("Tools"))
  {
    reload |= ImGui::MenuItem("Reload Shaders", "F5");
    ImGui::EndMenu();
  }
  reload |= ImGui::IsKeyPressed(ImGuiKey_F5);
  if(reload)
  {
    vkQueueWaitIdle(m_app->getQueue(0).queue);
      if(m_useRayTracing)
      {
        createRayTracingPipeline();
      }
      else
      {
        compileAndCreateGraphicsShaders();
      }
  }
}
```

这一改动确保:

- 启用光线追踪时,按 F5 会重新加载光线追踪管线(包括所有着色器阶段和 SBT)
- 启用光栅化时,按 F5 会重新加载光栅化的着色器模块(顶点着色器和片元着色器)
- 着色器重载功能在两种渲染模式下都能正常工作

注意:光栅化模式只会重新加载着色器模块,而不是整条图形管线。图形管线本身在初始化时创建,并在运行时使用这些着色器模块。

## 阶段 6 检查点

**此时,你的应用程序应当:**

✅ **编译成功**,没有错误或警告  
✅ **运行时不崩溃**,并显示**光线追踪输出**(灰色背景上的红色物体)  
✅ **展示第一个可用的光线追踪画面**,取代光栅化  
✅ **可以在光线追踪和光栅化之间切换**(如果添加了 UI 开关)  

**预期的视觉效果:**

- 物体呈现为纯红色(来自最近命中着色器)
- 背景呈现为灰色(来自未命中着色器)
- 场景几何体被正确地光线追踪(物体应当可见,并且位置正确)

![阶段 6 的结果:灰色背景上的红色物体](/raytracing/nvidia/Phase6.png)

**如何测试着色器实时重载**

要验证着色器实时重载是否正常工作:

1. **编辑着色器**:打开你的光线追踪着色器文件(例如 `rtbasic.slang`),修改最近命中着色器或未命中着色器输出的颜色。比如,你可以把红色改成绿色或蓝色。
2. **保存着色器文件**:修改完成后,保存文件。
3. **让应用程序窗口获得焦点**:确保应用程序窗口处于活动状态并获得焦点,这样它才能接收键盘输入。
4. **按下 F5**:在应用程序获得焦点时,按下键盘上的 `F5` 键,或在 Tool 菜单中选择“Reload Shaders”。这会触发着色器重新编译和管线重新加载。
5. **观察结果**:应用程序应当自动重新编译修改后的着色器,重新创建光线追踪管线,并更新输出。你应该立刻就能在渲染画面中看到新的颜色或效果。

这种着色器实时重载的工作流程对快速迭代、调试和实验非常有用。你可以快速调整着色器代码并实时看到结果,而无需重启应用程序或重新构建整个项目。

## 光线追踪输出详情

此时,你已经拥有:

- **光线追踪的场景**:物体呈现为纯红色
- **灰色背景**:没有击中几何体的光线显示为灰色背景
- **可用的管线**:从光线生成到输出的完整光线追踪管线

这是你第一次真正看到光线追踪输出、而不是光栅化输出的阶段。

## 下一步

在阶段 7 中,我们将为最近命中着色器加入真正的材质着色,让光线追踪的场景看起来更真实,并与原来的光栅化场景保持一致。
