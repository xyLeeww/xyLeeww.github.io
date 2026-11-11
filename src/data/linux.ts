import type { DocSpace } from './docs';

export const linuxSpace: DocSpace = {
  collection: 'linuxdrivers',
  base: '/linux-docs',
  brand: 'Linux 驱动开发',
  sections: [
    {
      key: '00-guide',
      title: '导读',
      summary: '前言、学习路线、开发环境搭建、参考资料和术语表。',
    },
    {
      key: '01-lessons',
      title: '动手课程',
      summary: '在 QEMU 里一课一课地写驱动:内核模块、字符设备、PCI、中断、DMA 和调试。',
    },
    {
      key: '02-notes',
      title: '学习笔记',
      summary: '原创笔记:开发环境的三层结构、edu PCI 驱动导读和踩坑记录。',
    },
  ],
  navSections: [
    { label: '教程', section: '00-guide' },
    { label: '学习笔记', section: '02-notes' },
  ],
  footerLinks: [
    { label: 'The Linux Kernel documentation ↗', href: 'https://docs.kernel.org/' },
    { label: 'Linux Kernel Module Programming Guide ↗', href: 'https://sysprog21.github.io/lkmpg/' },
  ],
  copyright: '原创学习笔记,引用资料版权归原作者。',
};
