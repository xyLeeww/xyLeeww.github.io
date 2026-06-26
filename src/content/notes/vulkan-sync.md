---
title: "Vulkan Synchronization In Depth"
date: 2026-06-25
description: "Use cases and best practices for Fences, Semaphores, and Barriers."
tags: ["Vulkan", "Synchronization"]
---

## Why Do We Need Synchronization?

Vulkan is an explicit API—GPU and CPU execute asynchronously, and multiple queues are independent of each other. This means developers must manually manage resource dependencies and execution order.

## The Three Synchronization Primitives

### 1. Fence (CPU ↔ GPU)

A Fence lets the CPU wait for the GPU to finish a submission. Typical use case: waiting for the previous frame to finish rendering before reusing its command buffers.

```cpp
VkFence fence;
vkCreateFence(device, &createInfo, nullptr, &fence);
vkQueueSubmit(queue, 1, &submitInfo, fence);
vkWaitForFences(device, 1, &fence, VK_TRUE, UINT64_MAX);
```

### 2. Semaphore (Queue ↔ Queue)

Semaphores establish dependencies between submissions to different queues. For example, making the graphics queue wait for the compute queue to finish.

### 3. Pipeline Barrier (Within a Command Buffer)

Barriers are the finest-grained synchronization within a single command buffer, used to specify memory dependencies and layout transitions.

```cpp
VkImageMemoryBarrier barrier = {};
barrier.sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
barrier.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
barrier.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
barrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;

vkCmdPipelineBarrier(cmdBuffer,
    VK_PIPELINE_STAGE_TRANSFER_BIT,
    VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT,
    0, 0, nullptr, 0, nullptr, 1, &barrier);
```

## Summary

| Primitive | Scope | Typical Use Case |
|-----------|-------|------------------|
| Fence | CPU ↔ GPU | Frame sync, resource reclamation |
| Semaphore | Queue ↔ Queue | Cross-queue dependencies |
| Barrier | Within command buffer | Layout transitions, cache flushes |

> Reference: Vulkan Specification §7 Synchronization and Cache Control
