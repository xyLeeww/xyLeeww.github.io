---
title: "2. 概述:从光栅化到光线追踪(Overview: From Rasterization to Ray Tracing)"
order: 2
description: "对比光栅化管线与光线追踪管线,并说明两者的像素最终都写入同一张目标图像"
kind: translation
source: "https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR/blob/v2/docs/tutorial/index.md#overview-from-rasterization-to-ray-tracing"
sourceTitle: "NVIDIA Vulkan Ray Tracing Tutorial (v2) · Overview: From Rasterization to Ray Tracing"
license: "Apache-2.0"
---

## 转换前:光栅化管线

> **译注**:下图中的标注保留英文原文。图意:在“图形管线(Graphic Pipeline)”中,顶点着色器(Vertex Shader,可编程)→ 光栅化(Rasterization,固定功能)→ 片元着色器(Fragment Shader,可编程)→ 目标图像(Target Image,输出)。

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryColor: "#ECEFF1"
    primaryTextColor: "#000000"
    primaryBorderColor: "#546E7A"
    lineColor: "#546E7A"
    clusterBkg: "#FAFAFA"
    titleColor: "#000000"
    textColor: "#000000"
    clusterBorder: "#90A4AE"
---
flowchart TB
    classDef programmable fill:#C8E6C9,stroke:#1B5E20,color:#000
    classDef fixed        fill:#BBDEFB,stroke:#0D47A1,color:#000
    classDef output       fill:#FFE0B2,stroke:#E65100,color:#000

 subgraph s1["Graphic Pipeline"]
        VS["Vertex Shader"]:::programmable
        RS["Rasterization"]:::fixed
        FS["Fragment Shader"]:::programmable
        TGT["Target Image"]:::output
  end
    VS --> RS
    RS --> FS
    FS --> TGT
```

## 转换后:光线追踪管线

> **译注**:图意:在“光线追踪管线(Ray Tracing Pipeline)”中,光线生成着色器(Ray Generation)调用 `traceRayEXT()` 进入加速结构遍历(Acceleration Structure Traversal,固定功能/硬件阶段),并把结果写入目标图像(Target Image)。遍历过程中可能调用相交着色器(Intersection Shader),再调用任意命中着色器(Any Hit Shader),后者可以让遍历继续或停止。遍历结束后判断“是否命中(Hit?)”:否(No)则执行未命中着色器(Miss Shader),是(Yes)则执行最近命中着色器(Closest Hit Shader)。

```mermaid
---
config:
  theme: base
  layout: dagre
  themeVariables:
    primaryColor: "#ECEFF1"
    primaryTextColor: "#000000"
    primaryBorderColor: "#546E7A"
    lineColor: "#546E7A"
    clusterBkg: "#FAFAFA"
    titleColor: "#000000"
    textColor: "#000000"
    clusterBorder: "#90A4AE"
---
flowchart TB
    classDef programmable fill:#C8E6C9,stroke:#1B5E20,color:#000
    classDef fixed        fill:#BBDEFB,stroke:#0D47A1,color:#000
    classDef decision     fill:#F3E5F5,stroke:#4A148C,color:#000
    classDef output       fill:#FFE0B2,stroke:#E65100,color:#000
    classDef neutral      fill:#ECEFF1,stroke:#546E7A,color:#000

 subgraph s1["Ray Tracing Pipeline"]
        RG["Ray Generation"]:::programmable
        AST["Acceleration Structure Traversal"]:::fixed
        Hit{"Hit?"}:::decision
        Intersection["Intersection Shader"]:::programmable
        AnyHit["Any Hit Shader"]:::programmable
        No["No"]:::neutral
        Yes["Yes"]:::neutral
        Miss["Miss Shader"]:::programmable
        CH["Closest Hit Shader"]:::programmable
        TGT["Target Image"]:::output
  end
    RG -- traceRayEXT() --> AST
    RG --> TGT
    AST --> Hit
    AST -. During Traversal .-> Intersection
    Intersection --> AnyHit
    AnyHit -. Continue/Stop .-> AST
    Hit --- No & Yes
    No --> Miss
    Yes --> CH
```

**配色说明(与上面的光栅化示意图相同):**
🟢 可编程着色器 —— 🔵 固定功能 / 硬件阶段 —— 🟣 判断 —— 🟠 输出目标。

## 像素究竟去了哪里:目标图像

两条管线都不会直接写到屏幕上。它们都会填充同一张中间的 **目标图像(target image)**:

- **光栅化** 把它当作帧缓冲(framebuffer)的颜色附件(color attachment)来写入。
- **光线追踪** 通过存储图像(storage image)绑定来写入它(在光线生成着色器中是 `RWTexture2D`)。

随后,目标图像会经过色调映射(tonemap),再与 ImGui 的界面叠加层合成,最后提交(present)到交换链(swapchain)上显示。这就是为什么上面两张管线示意图最终都汇聚到同一个 `Target Image` 节点:选择哪种管线影响的是像素 *如何* 产生,而不是像素 *最终去往何处*。

> **译注**:图意:目标图像(Target Image)→ 色调映射(Tonemap)→ 与 ImGui 界面合成(Composite with ImGui UI)→ 交换链(Swapchain,Present 呈现)。

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryColor: "#ECEFF1"
    primaryTextColor: "#000000"
    primaryBorderColor: "#546E7A"
    lineColor: "#546E7A"
    clusterBkg: "#FAFAFA"
    titleColor: "#000000"
    textColor: "#000000"
    clusterBorder: "#90A4AE"
---
flowchart LR
    classDef output  fill:#FFE0B2,stroke:#E65100,color:#000
    classDef process fill:#ECEFF1,stroke:#546E7A,color:#000
    classDef present fill:#D1C4E9,stroke:#4527A0,color:#000

    TGT["Target Image"]:::output --> TM["Tonemap"]:::process
    TM --> CMP["Composite<br>with ImGui UI"]:::process
    CMP --> SC["Swapchain<br>(Present)"]:::present
```
