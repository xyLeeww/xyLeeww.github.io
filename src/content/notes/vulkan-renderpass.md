---
title: "Vulkan Render Pass"
date: 2026-07-02
description: "Summary of Vulkan Render Pass"
tags: ["Vulkan", "Architecture"]
---

## What is a Render Pass?

A `VkRenderPass` object represents a collection of **attachments**, **subpasses**, and **dependencies** between the subpasses. It describes how attachments are used over the course of the subpasses.

It does NOT contain the actual images — it only defines the *structure* and *format* of the rendering operations. The actual image views are bound via `VkFramebuffer`.

## Why Do We Need Render Passes?

1. **Tiled rendering optimization** — Mobile GPUs (and some desktop GPUs) use tile-based rendering. The render pass tells the driver exactly when attachments are loaded/stored, enabling the driver to keep data in on-chip tile memory and avoid expensive VRAM round-trips.
2. **Attachment lifecycle control** — Specifies load/store operations (`VK_ATTACHMENT_LOAD_OP_CLEAR`, `LOAD`, `DONT_CARE`) so the driver can skip unnecessary memory reads/writes.
3. **Subpass dependencies** — Enables the driver to merge multiple draw passes into a single tile pass when possible (subpass merging).
4. **Validation** — The render pass defines the contract for pipeline creation (attachment formats, sample counts), ensuring correctness at pipeline creation time rather than at draw time.

## Core Components

### Attachments (`VkAttachmentDescription`)

Describe the format and how each attachment is handled:

| Field | Purpose |
|-------|---------|
| `format` | Image format (e.g., `VK_FORMAT_B8G8R8A8_SRGB`) |
| `samples` | MSAA sample count |
| `loadOp` | What to do at render pass begin (clear / load / don't care) |
| `storeOp` | What to do at render pass end (store / don't care) |
| `stencilLoadOp` | Load op for stencil aspect |
| `stencilStoreOp` | Store op for stencil aspect |
| `initialLayout` | Layout the image is in before the render pass |
| `finalLayout` | Layout the image transitions to after the render pass |

### Subpasses (`VkSubpassDescription`)

Each subpass references a subset of attachments:

- **Input attachments** — Read from a previous subpass's output (tile-local read)
- **Color attachments** — Fragment shader output targets
- **Resolve attachments** — MSAA resolve destinations
- **Depth/stencil attachment** — Depth and stencil testing
- **Preserve attachments** — Not used in this subpass but must be preserved for later subpasses

### Subpass Dependencies (`VkSubpassDependency`)

Define execution and memory barriers between subpasses (or between external operations and a subpass):

```cpp
VkSubpassDependency dependency{};
dependency.srcSubpass = VK_SUBPASS_EXTERNAL; // Before render pass
dependency.dstSubpass = 0;                   // First subpass
dependency.srcStageMask  = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
dependency.dstStageMask  = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
dependency.srcAccessMask = 0;
dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
```

## Creation Example

```cpp
// 1. Define attachment
VkAttachmentDescription colorAttachment{};
colorAttachment.format         = swapchainFormat;
colorAttachment.samples        = VK_SAMPLE_COUNT_1_BIT;
colorAttachment.loadOp         = VK_ATTACHMENT_LOAD_OP_CLEAR;
colorAttachment.storeOp        = VK_ATTACHMENT_STORE_OP_STORE;
colorAttachment.stencilLoadOp  = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
colorAttachment.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
colorAttachment.initialLayout  = VK_IMAGE_LAYOUT_UNDEFINED;
colorAttachment.finalLayout    = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;

// 2. Define subpass
VkAttachmentReference colorRef{};
colorRef.attachment = 0;
colorRef.layout     = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;

VkSubpassDescription subpass{};
subpass.pipelineBindPoint    = VK_PIPELINE_BIND_POINT_GRAPHICS;
subpass.colorAttachmentCount = 1;
subpass.pColorAttachments    = &colorRef;

// 3. Create render pass
VkRenderPassCreateInfo rpInfo{};
rpInfo.sType           = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
rpInfo.attachmentCount = 1;
rpInfo.pAttachments    = &colorAttachment;
rpInfo.subpassCount    = 1;
rpInfo.pSubpasses      = &subpass;
rpInfo.dependencyCount = 1;
rpInfo.pDependencies   = &dependency;

vkCreateRenderPass(device, &rpInfo, nullptr, &renderPass);
```

## Usage in Command Buffer

```cpp
VkRenderPassBeginInfo beginInfo{};
beginInfo.sType       = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
beginInfo.renderPass  = renderPass;
beginInfo.framebuffer = framebuffer;
beginInfo.renderArea  = {{0, 0}, swapchainExtent};
beginInfo.clearValueCount = 1;
beginInfo.pClearValues    = &clearColor;

vkCmdBeginRenderPass(cmd, &beginInfo, VK_SUBPASS_CONTENTS_INLINE);
  vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline);
  vkCmdDraw(cmd, vertexCount, 1, 0, 0);
vkCmdEndRenderPass(cmd);
```

But if you use dynamic rendering, it will be like the example below. Also remember to enable it when creating logical device:
```cpp
enabledFeatures.dynamicRendering = VK_TRUE;
deviceCreatepNextChain = &enabledFeatures;

VkRenderingInfo renderingInfo{
	.sType = VK_STRUCTURE_TYPE_RENDERING_INFO_KHR,
	.renderArea = { 0, 0, width, height },
	.layerCount = 1,
	.colorAttachmentCount = 1,
	.pColorAttachments = &colorAttachment,
	.pDepthAttachment = &depthStencilAttachment,
	.pStencilAttachment = &depthStencilAttachment
};

// Start a dynamic rendering section
vkCmdBeginRendering(commandBuffer, &renderingInfo);
// Finish the current dynamic rendering section
vkCmdEndRendering(commandBuffer);
```
## Render Pass vs Dynamic Rendering (Vulkan 1.3+)

| | Render Pass | Dynamic Rendering (`VK_KHR_dynamic_rendering`) |
|---|---|---|
| Object creation | `vkCreateRenderPass` upfront | No object needed |
| Framebuffer | Required | Not required |
| Subpasses | Supported (multi-subpass) | Single pass only |
| Tile optimization | Driver can merge subpasses | Driver handles internally |
| API complexity | Higher | Lower |
| Use case | Complex multi-pass rendering | Simple single-pass rendering |

Dynamic rendering is preferred for new code when multi-subpass merging is not needed.

## Common Pitfalls

- **Layout mismatch** — `initialLayout` must match the actual layout of the image at render pass begin. Use `VK_IMAGE_LAYOUT_UNDEFINED` if you don't care about previous contents.
- **Missing dependencies** — Forgetting `VK_SUBPASS_EXTERNAL` dependencies can cause synchronization bugs (e.g., writing to a swapchain image before it's acquired).
- **Unnecessary LOAD ops** — Using `LOAD_OP_LOAD` when you're going to clear the entire screen wastes bandwidth. Use `LOAD_OP_CLEAR` or `LOAD_OP_DONT_CARE` instead.
- **Render pass compatibility** — Pipelines are created against a specific render pass. Compatible render passes must have identical attachment formats and sample counts.

---

