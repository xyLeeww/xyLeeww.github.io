---
title: "Vulkan Command Buffers"
date: 2026-06-29
description: "Summary of Vulkan Command Buffers"
tags: ["Vulkan", "Architecture"]
---

## What is a Command Buffer?

Command buffers are objects used to record commands which can be subsequently submitted to a device queue for execution. Recorded commands include commands to bind pipelines and descriptor sets, commands to draw/disptach, commands to copy buffers and images, and other commands.

## Core Concepts

| Concept | Description |
|---|---|
| **Command Pool** (`VkCommandPool`) | Memory allocator for Command Buffers, bound to a specific Queue Family |
| **Level** | **Primary** — can be directly submitted to a queue; **Secondary** — can only be called by a Primary (`vkCmdExecuteCommands`) |
| **Lifecycle** | `Initial` → `Recording` → `Executable` → `Pending` → back to `Initial` or `Invalid` |

## Typical Workflow

```c
vkAllocateCommandBuffers()    // Allocate from Pool
vkBeginCommandBuffer()        // Begin recording
  vkCmdBindPipeline()         // Record various commands
  vkCmdDraw()
  ...
vkEndCommandBuffer()          // End recording → Executable state
vkQueueSubmit()               // Submit to queue → Pending state
```

## Relationship with Other Components

```
Queue Family
  └── Command Pool
        └── Command Buffer(s)
              └── Recorded commands reference → Pipeline, Descriptor Set,
                                                Framebuffer, Render Pass,
                                                Buffer, Image...
```

## Key Points

1. A Command Buffer **does not execute commands** itself — it only records them. Execution happens after `vkQueueSubmit`.
2. While in Pending state, a Command Buffer **cannot be modified or resubmitted**. Use Fence/Semaphore to confirm completion.
3. **Multi-threaded recording**: Different threads can record different Command Buffers simultaneously (each needs its own Command Pool).
4. **Reuse strategies**: `VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT` for single use; `vkResetCommandBuffer()` / `vkResetCommandPool()` to reset and re-record.
5. Secondary Command Buffers are useful for modularizing render logic (e.g., UI layer vs. scene layer recorded separately), invoked within a Render Pass via `vkCmdExecuteCommands`.