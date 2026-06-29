---
title: "Vulkan Management Components"
date: 2026-06-28
description: "Use cases for Instance, PysicalDevice, and Device."
tags: ["Vulkan", "Instance", "Device"]
---

## Vulkan Management Components
Vulkan expose a clear object hierarchy that the application must create and manage explicity. Setting up these management objects is the first step in every Vulkan application. Understand this hierarchy allows you to use Vulkan more effectively.
```
VkInstance
   - VkPhysicalDevice (not created)
        - VkDevice: Logical Device
            - VkQueue (get from driver, not created)
```
### 1.VkInstance
- The interface between the application and driver.
- The entry point to the Vulkan runtime.
It connects app to the Vulkan loader and specifies which **layers** and **instance extentions** to enable.
```cpp
VkInstanceCreateInfo createInfo = {};
createInfo.sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
createInfo.pApplicationInfo = &appInfo;
createInfo.enabledExtensionCount = static_cast<uint32_t>(extensions.size());
createInfo.ppEnabledExtensionNames = extensions.data();
if (vkCreateInstance(&createInfo, nullptr, &instance) != VK_SUCCESS) {
    throw std::runtime_error("failed to create instance!");
}
```
### 2.VkPhysicalDevice 
Represents a pyhsical GPU on the system. App enumerate physical devices, then pick the one that fits the needs. 
```cpp
vkEnumeratePhysicalDevices(instance, &deviceCount, devices.data());
```

### 3.VkDevice 
The application's private interface to physical GPUs. A logical device encapsulates the sets of enabled features, extentions, and queues that the application has requeseted. Almost all Vulkan objects(buffers, images, piplines, etc.) are created from and owned by a logical device.

```cpp
VkDeviceCreateInfo createInfo = {};
createInfo.sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
createInfo.pQueueCreateInfos = queueCreateInfos.data();
createInfo.queueCreateInfoCount = static_cast<uint32_t>(queueCreateInfos.size());
createInfo.pEnabledFeatures = &deviceFeatures;
createInfo.enabledExtensionCount = static_cast<uint32_t>(deviceExtensions.size());
createInfo.ppEnabledExtensionNames = deviceExtensions.data();
if (enableValidationLayers) {
    createInfo.enabledLayerCount = static_cast<uint32_t>(validationLayers.size());
    createInfo.ppEnabledLayerNames = validationLayers.data();
} else {
    createInfo.enabledLayerCount = 0;
}
if (vkCreateDevice(physicalDevice, &createInfo, nullptr, &device) != VK_SUCCESS){
    throw std::runtime_error("failed to create logical device!");
}
```

### 4.Queue
Queues are created implicitly when the logical device is created.
Users use VkQueue to submit drawing commands and control commands to VkDevice.
```cpp
vkGetDeviceQueue(device, indices.graphicsFamily, 0, &graphicsQueue);
vkGetDeviceQueue(device, indices.presentFamily, 0, &presentQueue);

vkQueueSubmit(graphicsQueue, 1, &submitInfo, VK_NULL_HANDLE);
```
More specific code can be found in the repository [HelloTriangle](https://github.com/xyLeeww/HelloTriangle).