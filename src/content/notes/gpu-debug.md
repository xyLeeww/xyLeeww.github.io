---
title: "GPU TDR Debugging Guide"
date: 2026-06-10
description: "Common workflows and tips for analyzing GPU hang dumps with WinDbg."
tags: ["Debugging", "WinDbg", "GPU"]
---

## What Is TDR?

**TDR (Timeout Detection and Recovery)** is a Windows mechanism: when the GPU fails to respond within a set time (default 2 seconds), the OS resets the GPU driver.

Common error code: `0x141` (VIDEO_TDR_TIMEOUT_DETECTED)

## WinDbg Analysis Steps

### 1. Load the Dump File

```
File → Open Crash Dump → select the .dmp file
```

### 2. Get Basic Information

```
!analyze -v
```

This gives an overview of the crash, including the exception code, faulting module, and call stack.

### 3. Inspect Call Stacks

```
k          // current thread stack
~*k        // all thread stacks
.frame N   // switch to frame N
```

### 4. Check GPU-Related Registers

```
!dxgkdebugext
```

## Common TDR Causes

| Cause | Symptom | Investigation |
|-------|---------|---------------|
| Shader infinite loop | Single dispatch timeout | Check shader loop conditions |
| Out-of-bounds memory | Random hang | Enable GPU validation |
| Synchronization error | Intermittent hang | Review fence/barrier usage |
| Driver bug | Specific HW/driver version | Update driver or file a bug |

## Debugging Tips

- Set the `TdrDelay` registry key to increase the timeout, preventing TDR during debugging
- Use `D3D12_DRED` to get breadcrumb info after device removal
- Use `PIX` or `RenderDoc` to capture frames and compare normal vs. abnormal frames
