import type { DocSpace } from './docs';

export const rtSpace: DocSpace = {
  collection: 'raytracing',
  base: '/rt-docs',
  brand: 'RT 中文翻译',
  sections: [
    {
      key: '00-guide',
      title: '导读',
      summary: '译者前言、两天学习计划和术语表。',
    },
    {
      key: '01-rtiow',
      title: 'Ray Tracing in One Weekend',
      summary: '全书翻译:从输出一张图片开始,一步步写出支持漫反射、金属、玻璃和景深的光线追踪器。',
    },
    {
      key: '02-tnw',
      title: 'Ray Tracing: The Next Week',
      summary: '全书翻译:运动模糊、BVH、纹理、柏林噪声、四边形、光源、实例和体积,最后渲染出康奈尔盒和全书最终场景。',
    },
    {
      key: '03-nvidia-tutorial',
      title: 'NVIDIA Vulkan 光线追踪教程',
      summary: 'nvpro-samples Vulkan 光线追踪教程(v2)翻译:把光栅化程序逐步改造为硬件光线追踪。',
    },
    {
      key: '04-nvidia-concepts',
      title: 'NVIDIA 概念详解',
      summary: '加速结构、着色器绑定表(SBT)和 Ray Query 三篇专题文档的翻译。',
    },
    {
      key: '05-notes',
      title: '学习笔记',
      summary: '原创笔记:三角形相交、BVH 与 SAH、Ray Query 与光追管线对比、Sascha Willems 示例导读。',
    },
    ],
    navSections: [
      { label: '教程', section: '00-guide' },
      { label: '学习笔记', section: '05-notes' },
    ],
    footerLinks: [
      { label: 'Ray Tracing in One Weekend ↗', href: 'https://raytracing.github.io/' },
      { label: 'NVIDIA vk_raytracing_tutorial_KHR ↗', href: 'https://github.com/nvpro-samples/vk_raytracing_tutorial_KHR' },
  ],
  copyright: '译文版权与许可遵循各原文。',
};
