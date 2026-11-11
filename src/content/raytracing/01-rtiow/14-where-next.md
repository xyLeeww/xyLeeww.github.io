---
title: "14. 下一步去哪里?(Where Next?)"
order: 14
description: "渲染本书封面上那幅满是随机小球的最终场景,介绍本系列后两本书和其他可以继续探索的方向,并附上引用本书的格式。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingInOneWeekend.html#wherenext"
sourceTitle: "Ray Tracing in One Weekend · Where Next?"
license: "CC0 1.0"
---

## 14.1 最终渲染

我们来渲染这本书封面上的那幅图——大量随机分布的球体。

**代码清单 88**:`main.cc` 最终场景

```cpp
int main() {
    hittable_list world;

    auto ground_material = make_shared<lambertian>(color(0.5, 0.5, 0.5));
    world.add(make_shared<sphere>(point3(0,-1000,0), 1000, ground_material));

    for (int a = -11; a < 11; a++) {
        for (int b = -11; b < 11; b++) {
            auto choose_mat = random_double();
            point3 center(a + 0.9*random_double(), 0.2, b + 0.9*random_double());

            if ((center - point3(4, 0.2, 0)).length() > 0.9) {
                shared_ptr<material> sphere_material;

                if (choose_mat < 0.8) {
                    // diffuse
                    auto albedo = color::random() * color::random();
                    sphere_material = make_shared<lambertian>(albedo);
                    world.add(make_shared<sphere>(center, 0.2, sphere_material));
                } else if (choose_mat < 0.95) {
                    // metal
                    auto albedo = color::random(0.5, 1);
                    auto fuzz = random_double(0, 0.5);
                    sphere_material = make_shared<metal>(albedo, fuzz);
                    world.add(make_shared<sphere>(center, 0.2, sphere_material));
                } else {
                    // glass
                    sphere_material = make_shared<dielectric>(1.5);
                    world.add(make_shared<sphere>(center, 0.2, sphere_material));
                }
            }
        }
    }

    auto material1 = make_shared<dielectric>(1.5);
    world.add(make_shared<sphere>(point3(0, 1, 0), 1.0, material1));

    auto material2 = make_shared<lambertian>(color(0.4, 0.2, 0.1));
    world.add(make_shared<sphere>(point3(-4, 1, 0), 1.0, material2));

    auto material3 = make_shared<metal>(color(0.7, 0.6, 0.5), 0.0);
    world.add(make_shared<sphere>(point3(4, 1, 0), 1.0, material3));

    camera cam;

    cam.aspect_ratio      = 16.0 / 9.0;
    cam.image_width       = 1200;
    cam.samples_per_pixel = 500;
    cam.max_depth         = 50;

    cam.vfov     = 20;
    cam.lookfrom = point3(13,2,3);
    cam.lookat   = point3(0,0,0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0.6;
    cam.focus_dist    = 10.0;

    cam.render(world);
}
```

(注意,上面的代码与项目示例代码略有不同:上面把 `samples_per_pixel` 设为 500,以得到一幅高质量的图像,但渲染需要相当长的时间。项目源代码中使用的值是 10,这是为了在开发和验证时运行时间合理。)

渲染结果如下:

![图像 23:最终场景](/raytracing/rtiow/img-1.23-book1-final.jpg)

你可能会注意到一件有趣的事:玻璃球其实没有影子,这让它们看起来像是悬浮着的。这不是 bug——在现实生活中你很少见到玻璃球,而真实的玻璃球看起来也有点奇怪,在阴天时确实像是浮在空中。大球上位于玻璃球下方的点仍然会受到大量光照,因为来自天空的光只是被重新排列(经玻璃球折射改变了方向),而不是被挡住了。

## 14.2 后续步骤

你现在已经拥有一个很酷的光线追踪器了!接下来做什么呢?

### 第 2 本书:[_Ray Tracing: The Next Week_](https://raytracing.github.io/books/RayTracingTheNextWeek.html)

本系列的第二本书建立在你在这里开发的光线追踪器之上,其中包括以下新功能:

- 运动模糊(Motion blur)——真实地渲染运动中的物体。
- [包围体层次结构(Bounding volume hierarchies)](/raytracing/02-tnw-bvh/01-bvh/)——加快复杂场景的渲染速度。
- 纹理贴图(Texture maps)——把图像贴到物体上。
- 柏林噪声(Perlin noise)——一种随机噪声生成器,在许多技术中都非常有用。
- 四边形(Quadrilaterals)——除了球体之外终于有别的东西可以渲染了!它也是实现圆盘、三角形、圆环或几乎任何其他二维图元的基础。
- 光源(Lights)——为场景添加光源。
- 变换(Transforms)——用于放置和旋转物体。
- 体积渲染(Volumetric rendering)——渲染烟雾、云以及其他气态体积。

### 第 3 本书:[_Ray Tracing: The Rest of Your Life_](https://raytracing.github.io/books/RayTracingTheRestOfYourLife.html)

这本书在第二本书的基础上再次扩展。书中很大一部分内容是关于同时提升渲染图像质量和渲染器性能的,重点在于生成 _正确的_ 光线,并以恰当的方式累积它们。

这本书面向那些真正有兴趣编写专业级光线追踪器的读者,以及/或者有兴趣打下基础、以实现次表面散射(subsurface scattering)或嵌套电介质(nested dielectrics)等高级效果的读者。

### 其他方向

从这里出发,你还可以朝许多其他方向前进,包括本系列(暂时?)还没有涉及的技术。例如:

**三角形(Triangles)**——大多数很酷的模型都是以三角形形式表示的。模型的输入/输出是最糟糕的部分,几乎每个人都会设法拿别人的代码来完成这件事。这还包括高效地处理由三角形组成的大型 _网格_(mesh),它们本身就带来了不少挑战。

**并行(Parallelism)**——在 $N$ 个核心上运行 $N$ 份代码副本,每份使用不同的随机种子,然后对这 $N$ 次运行的结果取平均。这种平均也可以分层进行:把 $N/2$ 对结果分别平均得到 $N/4$ 幅图像,再把这些图像两两平均,依此类推。这种并行方法只需很少的代码,就能很好地扩展到数千个核心。

**阴影光线(Shadow Rays)**——向光源发射光线时,你可以精确地确定某个特定的点被遮挡的情况。借助它,你可以渲染出清晰的硬阴影或柔和的软阴影,为场景再增添一分真实感。

祝你玩得开心,也请把你渲染出的酷炫图片发给我!

> **译注**:原书在此处还有一节“致谢”(Acknowledgments),列出了为本书做出贡献的人员,本站没有翻译,可在[原书页面](https://raytracing.github.io/books/RayTracingInOneWeekend.html#acknowledgments)查看。

## 引用本书

统一的引用格式能让人更容易识别本作品的来源、位置和版本。如果你要引用本书,我们希望你尽可能使用下面的某种格式。

### 基本信息

- **标题(系列)**:“Ray Tracing in One Weekend Series”
- **标题(本书)**:“Ray Tracing in One Weekend”
- **作者**:Peter Shirley, Trevor David Black, Steve Hollasch
- **版本**:v4.0.2
- **日期**:2025-04-25
- **URL(系列)**:[https://raytracing.github.io/](https://raytracing.github.io/)
- **URL(本书)**:[https://raytracing.github.io/books/RayTracingInOneWeekend.html](https://raytracing.github.io/books/RayTracingInOneWeekend.html)

### 引用片段

#### Markdown

```markdown
[_Ray Tracing in One Weekend_](https://raytracing.github.io/books/RayTracingInOneWeekend.html)
```

#### HTML

```html
<a href='https://raytracing.github.io/books/RayTracingInOneWeekend.html'>
    <cite>Ray Tracing in One Weekend</cite>
</a>
```

#### LaTeX 和 BibTeX

```latex
~\cite{Shirley2025RTW1}

@misc{Shirley2025RTW1,
   title = {Ray Tracing in One Weekend},
   author = {Peter Shirley, Trevor David Black, Steve Hollasch},
   year = {2025},
   month = {April},
   note = {\small \texttt{https://raytracing.github.io/books/RayTracingInOneWeekend.html}},
   url = {https://raytracing.github.io/books/RayTracingInOneWeekend.html}
}
```

#### BibLaTeX

```latex
\usepackage{biblatex}

~\cite{Shirley2025RTW1}

@online{Shirley2025RTW1,
   title = {Ray Tracing in One Weekend},
   author = {Peter Shirley, Trevor David Black, Steve Hollasch},
   year = {2025},
   month = {April},
   url = {https://raytracing.github.io/books/RayTracingInOneWeekend.html}
}
```

#### IEEE

```text
“Ray Tracing in One Weekend.” raytracing.github.io/books/RayTracingInOneWeekend.html
(accessed MMM. DD, YYYY)
```

#### MLA

```text
Ray Tracing in One Weekend. raytracing.github.io/books/RayTracingInOneWeekend.html
Accessed DD MMM. YYYY.
```
