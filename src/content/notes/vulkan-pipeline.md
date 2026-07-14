---
title: "Vulkan Pipeline"
date: 2026-07-14
description: "Summary of Vulkan Pipeline"
tags: ["Vulkan"]
---

Linking the whole pipeline together allows the optimization of shaders based on their input/outputs and eliminates expensive draw time state validation.

Compute pipelines consist of a single static compute shader stage and the pipeline layout.

Graphics pipelines consist of multiple shader stages, multiple fixed-function pipeline stages, and a pipeline layout.
