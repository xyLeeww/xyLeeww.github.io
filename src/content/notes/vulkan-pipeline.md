---
title: "Vulkan Pipeline"
date: 2026-07-17
description: "Summary of Vulkan Pipeline"
tags: ["Vulkan"]
---
## Vulkan Pipeline

Linking the whole pipeline together allows the optimization of shaders based on their input/outputs and eliminates expensive draw time state validation.

There are three types of pipelines in Vulkan:

- **Compute pipelines** consist of a single static compute shader stage and the pipeline layout.
- **Graphics pipelines** consist of multiple shader stages, multiple fixed-function pipeline stages, and a pipeline layout.
- **Ray tracing pipelines** consist of multiple shader stages, fixed-function traversal stages, and a pipeline layout.

---

## Graphics Pipeline Stages

The graphics pipeline is the most complex. It processes vertices and produces fragments (pixels) in a specific order:

```
Input Assembler
    → Vertex Shader
    → Tessellation (optional)
    → Geometry Shader (optional)
    → Rasterization
    → Fragment Shader
    → Color Blending
    → Framebuffer
```

### Fixed-Function Stages

| Stage | Description |
|-------|-------------|
| **Input Assembly** | Collects raw vertex data from buffers. Topology: point list, line list, triangle list, triangle strip, etc. |
| **Rasterization** | Converts geometry into fragments. Controls face culling, polygon mode (fill/line/point), depth bias, line width. |
| **Multisampling** | Anti-aliasing via MSAA. Configures sample count and sample shading. |
| **Depth/Stencil Test** | Per-fragment depth comparison and stencil operations. |
| **Color Blending** | Combines fragment shader output with existing framebuffer content. Per-attachment blend factors and operations. |

### Programmable Shader Stages

| Stage | Description |
|-------|-------------|
| **Vertex Shader** | Transforms per-vertex data (position, normal, UV). Mandatory. |
| **Tessellation Control Shader** | Controls how much tessellation to apply. Outputs patch control points. |
| **Tessellation Evaluation Shader** | Generates vertex positions from tessellated patches. |
| **Geometry Shader** | Processes entire primitives. Can emit/discard primitives. Generally avoided for performance. |
| **Fragment Shader** | Computes color and depth for each fragment. Mandatory for visible output. |

---

## Pipeline Creation

### VkGraphicsPipelineCreateInfo

Key structures that must be provided:

```c
VkGraphicsPipelineCreateInfo pipelineInfo{
    .sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO,
    .stageCount = 2,
    .pStages = shaderStages,
    .pVertexInputState = &vertexInputInfo,
    .pInputAssemblyState = &inputAssembly,
    .pViewportState = &viewportState,
    .pRasterizationState = &rasterizer,
    .pMultisampleState = &multisampling,
    .pDepthStencilState = &depthStencil,
    .pColorBlendState = &colorBlending,
    .pDynamicState = nullptr,
    .layout = pipelineLayout,
    .renderPass = renderPass,
    .subpass = 0,
    .basePipelineHandle = VK_NULL_HANDLE,
    .basePipelineIndex = -1,
};
vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &graphicsPipeline);
```

### Pipeline Layout

Defines the interface between shader stages and shader resources:

- **Descriptor Set Layouts** — describe bindings (UBOs, SSBOs, samplers, images)
- **Push Constant Ranges** — small, fast-path uniform data (max ~128–256 bytes depending on hardware)

```c
VkPipelineLayoutCreateInfo pipelineLayoutInfo{
    .sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO,
    .setLayoutCount = 1,
    .pSetLayouts = &descriptorSetLayout,
};
vkCreatePipelineLayout(device, &pipelineLayoutInfo, nullptr, &pipelineLayout);
```

---

## Dynamic State

Certain pipeline states can be declared dynamic, allowing them to be changed at draw time via command buffer commands without recreating the pipeline:

Common dynamic states:
- `VK_DYNAMIC_STATE_VIEWPORT`
- `VK_DYNAMIC_STATE_SCISSOR`
- `VK_DYNAMIC_STATE_LINE_WIDTH`
- `VK_DYNAMIC_STATE_DEPTH_BIAS`
- `VK_DYNAMIC_STATE_BLEND_CONSTANTS`
- `VK_DYNAMIC_STATE_STENCIL_REFERENCE`

With `VK_EXT_extended_dynamic_state` and subsequent extensions, almost all pipeline state can be made dynamic, significantly reducing pipeline permutation counts.

---

## Pipeline Cache

`VkPipelineCache` stores compiled pipeline data to speed up subsequent pipeline creation:

```c
VkPipelineCacheCreateInfo cacheInfo = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_CACHE_CREATE_INFO,
    .initialDataSize = cachedDataSize,  // 0 on first run
    .pInitialData = cachedData,         // NULL on first run
};
vkCreatePipelineCache(device, &cacheInfo, NULL, &pipelineCache);
```

- Cache data can be serialized to disk via `vkGetPipelineCacheData` and reloaded on next launch.
- Cache is **not** portable across different driver versions or GPU architectures.

---

## Pipeline Derivatives

Pipelines can be created as derivatives of a parent pipeline:

- Set `VK_PIPELINE_CREATE_ALLOW_DERIVATIVES_BIT` on the parent.
- Set `VK_PIPELINE_CREATE_DERIVATIVE_BIT` and `basePipelineHandle`/`basePipelineIndex` on the child.
- Driver **may** optimize creation/switching between related pipelines (not guaranteed).

---

## Compute Pipeline

Much simpler than graphics — no fixed-function stages:

```c
VkComputePipelineCreateInfo computeInfo = {
    .sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO,
    .stage = computeShaderStageInfo,   // single compute shader
    .layout = pipelineLayout,
};
```

Dispatch with `vkCmdDispatch(commandBuffer, groupCountX, groupCountY, groupCountZ)`.

---

## Ray Tracing Pipeline (VK_KHR_ray_tracing_pipeline)

A ray tracing pipeline traces rays through an acceleration structure (BVH) built from scene geometry. Each ray goes through a series of shader stages depending on whether it hits something:

```
Ray Generation
    │  traceRayEXT()
    ▼
Traverse Acceleration Structure (hardware)
    │
    ├─ Triangle geometry → built-in intersection (hardware)
    ├─ Procedural geometry (AABB) → Intersection shader
    │
    ├─ For each potential hit → Any-Hit shader (accept / reject)
    │
    ├─ Closest accepted hit found → Closest-Hit shader → output color
    └─ No hit at all → Miss shader → output background color
```

### Shader Stages

| Stage | When it runs | Typical use |
|-------|-------------|-------------|
| **Ray Generation** | Once per pixel/invocation. Entry point of the pipeline. | Call `traceRayEXT()` to launch a ray from camera through the scene. |
| **Intersection** | When a ray enters an AABB in the BVH. Only needed for procedural (non-triangle) geometry. | Define custom ray-shape intersection for spheres, implicit surfaces, etc. Hardware handles triangle intersection automatically. |
| **Any-Hit** | For **every** potential intersection along the ray, not just the closest. | Alpha-test transparency: reject the hit if the ray passes through a transparent texel, letting the ray continue to the next surface. |
| **Closest-Hit** | Once, for the single closest accepted intersection after traversal completes. | Compute final shading: lighting, material evaluation, launch secondary rays (reflections, shadows). Analogous to a fragment shader. |
| **Miss** | Once, if the ray hits nothing in the scene. | Return sky color or sample an environment map. |
| **Callable** | On demand, invoked from any other RT shader via `executeCallableEXT()`. | Reusable subroutine for shared logic (e.g., a common lighting model called from multiple closest-hit shaders). |

### Shader Binding Table (SBT)

The SBT is a GPU buffer that maps each geometry instance to its shader group (closest-hit + any-hit + intersection). When a ray hits geometry instance N, the hardware looks up SBT entry N to determine which shaders to invoke.

```c
// SBT layout (conceptual):
// | Ray Gen | Miss 0 | Miss 1 | HitGroup 0 | HitGroup 1 | ... |
//                                  ↑ geometry instance 0 uses this group
```

---

## Best Practices

1. **Minimize pipeline count** — Use dynamic state and specialization constants to reduce permutations.
2. **Create pipelines early** — Pipeline compilation is expensive; do it at load time or in a background thread.
3. **Use pipeline cache** — Persist cache to disk for faster startup on subsequent launches.
4. **Prefer dynamic rendering** (`VK_KHR_dynamic_rendering`) over render passes when possible to simplify pipeline creation.
5. **Avoid geometry shaders** — They have poor performance characteristics on most hardware.
6. **Use specialization constants** — Compile-time constants that allow a single shader module to produce optimized variants without source duplication.
