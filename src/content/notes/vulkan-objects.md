---
title: "Vulkan Core Object Management"
date: 2026-06-28
description: "How Vulkan organizes its core objects: Instance, Device, Queue, Command Pool, and Command Buffer."
tags: ["Vulkan", "Architecture"]
---

## Vulkan's Object Hierarchy

Unlike OpenGL's hidden global state, Vulkan exposes a clear object hierarchy that the application must create and manage explicitly. Understanding this hierarchy is key to working with the API.

```
VkInstance
 └─ VkPhysicalDevice  (enumerate, not created)
     └─ VkDevice  (logical device)
         ├─ VkQueue  (retrieved, not created)
         ├─ VkCommandPool
         │    └─ VkCommandBuffer
         ├─ VkDescriptorPool
         │    └─ VkDescriptorSet
         └─ VkSwapchainKHR
```

## 1. VkInstance

The entry point to the Vulkan runtime. Created once per application. It connects your app to the Vulkan loader and specifies which **layers** (e.g. validation) and **instance extensions** (e.g. surface support) to enable.

```cpp
VkApplicationInfo appInfo = {};
appInfo.sType = VK_STRUCTURE_TYPE_APPLICATION_INFO;
appInfo.apiVersion = VK_API_VERSION_1_3;

VkInstanceCreateInfo createInfo = {};
createInfo.sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
createInfo.pApplicationInfo = &appInfo;
createInfo.enabledLayerCount = static_cast<uint32_t>(layers.size());
createInfo.ppEnabledLayerNames = layers.data();

VkInstance instance;
vkCreateInstance(&createInfo, nullptr, &instance);
```

**Key points:**
- Validation layers are enabled here — always enable `VK_LAYER_KHRONOS_validation` during development.
- The instance is independent of any specific GPU.

## 2. VkPhysicalDevice

Represents a physical GPU on the system. You **enumerate** (not create) physical devices, then pick the one that fits your needs.

```cpp
uint32_t deviceCount = 0;
vkEnumeratePhysicalDevices(instance, &deviceCount, nullptr);
std::vector<VkPhysicalDevice> devices(deviceCount);
vkEnumeratePhysicalDevices(instance, &deviceCount, devices.data());
```

Querying properties helps you choose the right device:

| Query Function | What It Returns |
|---|---|
| `vkGetPhysicalDeviceProperties` | Device name, type (discrete/integrated), API version |
| `vkGetPhysicalDeviceFeatures` | Supported optional features (geometry shader, multi-draw indirect, etc.) |
| `vkGetPhysicalDeviceMemoryProperties` | Heap sizes, memory types (device-local, host-visible, etc.) |
| `vkGetPhysicalDeviceQueueFamilyProperties` | Available queue families and their capabilities |

## 3. VkDevice (Logical Device)

A logical handle to the GPU. When creating it, you specify:
- Which **queue families** (and how many queues from each) you need
- Which **device features** to enable (e.g. `samplerAnisotropy`)
- Which **device extensions** to enable (e.g. `VK_KHR_swapchain`)

```cpp
float queuePriority = 1.0f;
VkDeviceQueueCreateInfo queueCreateInfo = {};
queueCreateInfo.sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
queueCreateInfo.queueFamilyIndex = graphicsFamily;
queueCreateInfo.queueCount = 1;
queueCreateInfo.pQueuePriorities = &queuePriority;

VkDeviceCreateInfo deviceCreateInfo = {};
deviceCreateInfo.sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
deviceCreateInfo.queueCreateInfoCount = 1;
deviceCreateInfo.pQueueCreateInfos = &queueCreateInfo;
deviceCreateInfo.enabledExtensionCount = static_cast<uint32_t>(extensions.size());
deviceCreateInfo.ppEnabledExtensionNames = extensions.data();

VkDevice device;
vkCreateDevice(physicalDevice, &deviceCreateInfo, nullptr, &device);
```

**One physical device → multiple logical devices is allowed** (rare in practice but useful for tool/layer isolation).

## 4. Queue Families and VkQueue

Queue families group queues with the same capabilities. Common families:

| Flag | Capability |
|---|---|
| `VK_QUEUE_GRAPHICS_BIT` | Draw commands, most transfers |
| `VK_QUEUE_COMPUTE_BIT` | Compute dispatch |
| `VK_QUEUE_TRANSFER_BIT` | DMA / copy-only (often a dedicated DMA engine) |

Queues are **retrieved** after device creation, not created separately:

```cpp
VkQueue graphicsQueue;
vkGetDeviceQueue(device, graphicsFamily, 0, &graphicsQueue);
```

**Tip:** Dedicated transfer queues on AMD GPUs map to the SDMA engine and can copy data concurrently with graphics/compute work.

## 5. VkCommandPool

A pool from which command buffers are allocated. Each pool is bound to **one queue family** and manages memory for its command buffers.

```cpp
VkCommandPoolCreateInfo poolInfo = {};
poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
poolInfo.queueFamilyIndex = graphicsFamily;
poolInfo.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;

VkCommandPool commandPool;
vkCreateCommandPool(device, &poolInfo, nullptr, &commandPool);
```

**Flags:**
- `RESET_COMMAND_BUFFER_BIT` — allow individual command buffer reset (vs. resetting the entire pool at once).
- `TRANSIENT_BIT` — hint that command buffers will be short-lived and frequently re-recorded.

**Best practice:** Create one command pool **per thread** to avoid locking.

## 6. VkCommandBuffer

All GPU work (draw calls, dispatches, copies, barriers) is recorded into command buffers, then submitted to a queue.

```cpp
VkCommandBufferAllocateInfo allocInfo = {};
allocInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
allocInfo.commandPool = commandPool;
allocInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
allocInfo.commandBufferCount = 1;

VkCommandBuffer cmdBuffer;
vkAllocateCommandBuffers(device, &allocInfo, &cmdBuffer);

// Record
vkBeginCommandBuffer(cmdBuffer, &beginInfo);
// ... draw / dispatch / copy commands ...
vkEndCommandBuffer(cmdBuffer);

// Submit
VkSubmitInfo submitInfo = {};
submitInfo.commandBufferCount = 1;
submitInfo.pCommandBuffers = &cmdBuffer;
vkQueueSubmit(graphicsQueue, 1, &submitInfo, fence);
```

**Primary vs Secondary:**
- **Primary** — submitted directly to a queue.
- **Secondary** — executed from a primary via `vkCmdExecuteCommands`. Useful for multi-threaded recording (each thread records a secondary, main thread combines them).

## Object Lifetime Rules

1. **Destroy in reverse creation order.** Device before Instance, CommandPool before Device, etc.
2. **Never destroy an object while the GPU is still using it.** Wait on fences or call `vkDeviceWaitIdle` first.
3. **Command buffers are freed when their parent pool is destroyed** — no need to free them individually if you're tearing down the pool.

```cpp
// Typical shutdown order
vkDeviceWaitIdle(device);
vkDestroyCommandPool(device, commandPool, nullptr);
vkDestroyDevice(device, nullptr);
vkDestroyInstance(instance, nullptr);
```

## Summary

| Object | Created By | Lifetime Scope | Thread Safety |
|---|---|---|---|
| `VkInstance` | `vkCreateInstance` | Application | Shared (read-only after creation) |
| `VkPhysicalDevice` | Enumerated | Tied to Instance | Read-only |
| `VkDevice` | `vkCreateDevice` | Application | Shared |
| `VkQueue` | Retrieved | Tied to Device | Externally synchronized |
| `VkCommandPool` | `vkCreateCommandPool` | Per-thread | NOT thread-safe |
| `VkCommandBuffer` | `vkAllocateCommandBuffers` | Tied to Pool | NOT thread-safe |
