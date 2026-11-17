---
title: "10. 测试所有新特性的场景(A Scene Testing All New Features)"
order: 10
description: "把本书介绍的所有新特性组合在一起,渲染本书的最终场景——薄雾、次表面球体、纹理、运动模糊和实例都在其中,并附上引用本书的格式。"
kind: translation
source: "https://raytracing.github.io/books/RayTracingTheNextWeek.html#ascenetestingallnewfeatures"
sourceTitle: "Ray Tracing: The Next Week · A Scene Testing All New Features"
license: "CC0 1.0"
---

我们把所有东西组合在一起:用一大片稀薄的薄雾笼罩一切,再加上一个蓝色的次表面反射球体(我们并没有显式地实现次表面反射,但电介质内部包着一个体积,这正是次表面材质的本质)。渲染器目前剩下的最大限制是没有阴影光线(shadow ray),但也正因为如此,我们才免费得到了焦散(caustics)和次表面效果。这是一个有利有弊的设计决策。

另外请注意,我们会把这个最终场景参数化,以支持用较低的质量进行渲染,方便快速测试。

**代码清单 74**:`main.cc` 最终场景

```cpp {1-78,81,90-91}
void final_scene(int image_width, int samples_per_pixel, int max_depth) {
    hittable_list boxes1;
    auto ground = make_shared<lambertian>(color(0.48, 0.83, 0.53));

    int boxes_per_side = 20;
    for (int i = 0; i < boxes_per_side; i++) {
        for (int j = 0; j < boxes_per_side; j++) {
            auto w = 100.0;
            auto x0 = -1000.0 + i*w;
            auto z0 = -1000.0 + j*w;
            auto y0 = 0.0;
            auto x1 = x0 + w;
            auto y1 = random_double(1,101);
            auto z1 = z0 + w;

            boxes1.add(box(point3(x0,y0,z0), point3(x1,y1,z1), ground));
        }
    }

    hittable_list world;

    world.add(make_shared<bvh_node>(boxes1));

    auto light = make_shared<diffuse_light>(color(7, 7, 7));
    world.add(make_shared<quad>(point3(123,554,147), vec3(300,0,0), vec3(0,0,265), light));

    auto center1 = point3(400, 400, 200);
    auto center2 = center1 + vec3(30,0,0);
    auto sphere_material = make_shared<lambertian>(color(0.7, 0.3, 0.1));
    world.add(make_shared<sphere>(center1, center2, 50, sphere_material));

    world.add(make_shared<sphere>(point3(260, 150, 45), 50, make_shared<dielectric>(1.5)));
    world.add(make_shared<sphere>(
        point3(0, 150, 145), 50, make_shared<metal>(color(0.8, 0.8, 0.9), 1.0)
    ));

    auto boundary = make_shared<sphere>(point3(360,150,145), 70, make_shared<dielectric>(1.5));
    world.add(boundary);
    world.add(make_shared<constant_medium>(boundary, 0.2, color(0.2, 0.4, 0.9)));
    boundary = make_shared<sphere>(point3(0,0,0), 5000, make_shared<dielectric>(1.5));
    world.add(make_shared<constant_medium>(boundary, .0001, color(1,1,1)));

    auto emat = make_shared<lambertian>(make_shared<image_texture>("earthmap.jpg"));
    world.add(make_shared<sphere>(point3(400,200,400), 100, emat));
    auto pertext = make_shared<noise_texture>(0.2);
    world.add(make_shared<sphere>(point3(220,280,300), 80, make_shared<lambertian>(pertext)));

    hittable_list boxes2;
    auto white = make_shared<lambertian>(color(.73, .73, .73));
    int ns = 1000;
    for (int j = 0; j < ns; j++) {
        boxes2.add(make_shared<sphere>(point3::random(0,165), 10, white));
    }

    world.add(make_shared<translate>(
        make_shared<rotate_y>(
            make_shared<bvh_node>(boxes2), 15),
            vec3(-100,270,395)
        )
    );

    camera cam;

    cam.aspect_ratio      = 1.0;
    cam.image_width       = image_width;
    cam.samples_per_pixel = samples_per_pixel;
    cam.max_depth         = max_depth;
    cam.background        = color(0,0,0);

    cam.vfov     = 40;
    cam.lookfrom = point3(478, 278, -600);
    cam.lookat   = point3(278, 278, 0);
    cam.vup      = vec3(0,1,0);

    cam.defocus_angle = 0;

    cam.render(world);
}

int main() {
    switch (9) {
        case 1:  bouncing_spheres();          break;
        case 2:  checkered_spheres();         break;
        case 3:  earth();                     break;
        case 4:  perlin_spheres();            break;
        case 5:  quads();                     break;
        case 6:  simple_light();              break;
        case 7:  cornell_box();               break;
        case 8:  cornell_smoke();             break;
        case 9:  final_scene(800, 10000, 40); break;
        default: final_scene(400,   250,  4); break;
    }
}
```

以每像素 10,000 条光线运行它(做个好梦吧),得到:

![图像 23:最终场景](/raytracing/tnw/img-2.23-book2-final.jpg)

现在,去创作一幅属于你自己的、真正酷炫的图像吧!更多与项目相关的资源,请参阅[我们的延伸阅读(Further Reading)wiki 页面](https://github.com/RayTracing/raytracing.github.io/wiki/Further-Readings)。欢迎把问题、意见和酷炫的图像通过电子邮件发给我:ptrshrl@gmail.com。

> **译注**:原书在此处还有一节“致谢”(Acknowledgments),列出了为本书做出贡献的人员,本站没有翻译,可在[原书页面](https://raytracing.github.io/books/RayTracingTheNextWeek.html#acknowledgments)查看。

## 引用本书

统一的引用格式能让人更容易识别本作品的来源、位置和版本。如果你要引用本书,我们希望你尽可能使用下面的某种格式。

### 基本信息

- **标题(系列)**:“Ray Tracing in One Weekend Series”
- **标题(本书)**:“Ray Tracing: The Next Week”
- **作者**:Peter Shirley, Trevor David Black, Steve Hollasch
- **版本**:v4.0.2
- **日期**:2025-04-25
- **URL(系列)**:[https://raytracing.github.io/](https://raytracing.github.io/)
- **URL(本书)**:[https://raytracing.github.io/books/RayTracingTheNextWeek.html](https://raytracing.github.io/books/RayTracingTheNextWeek.html)

### 引用片段

#### Markdown

```markdown
[_Ray Tracing: The Next Week_](https://raytracing.github.io/books/RayTracingTheNextWeek.html)
```

#### HTML

```html
<a href='https://raytracing.github.io/books/RayTracingTheNextWeek.html'>
    <cite>Ray Tracing: The Next Week</cite>
</a>
```

#### LaTeX 和 BibTeX

```latex
~\cite{Shirley2025RTW2}

@misc{Shirley2025RTW2,
   title = {Ray Tracing: The Next Week},
   author = {Peter Shirley, Trevor David Black, Steve Hollasch},
   year = {2025},
   month = {April},
   note = {\small \texttt{https://raytracing.github.io/books/RayTracingTheNextWeek.html}},
   url = {https://raytracing.github.io/books/RayTracingTheNextWeek.html}
}
```

#### BibLaTeX

```latex
\usepackage{biblatex}

~\cite{Shirley2025RTW2}

@online{Shirley2025RTW2,
   title = {Ray Tracing: The Next Week},
   author = {Peter Shirley, Trevor David Black, Steve Hollasch},
   year = {2025},
   month = {April},
   url = {https://raytracing.github.io/books/RayTracingTheNextWeek.html}
}
```

#### IEEE

```text
“Ray Tracing: The Next Week.” raytracing.github.io/books/RayTracingTheNextWeek.html
(accessed MMM. DD, YYYY)
```

#### MLA

```text
Ray Tracing: The Next Week. raytracing.github.io/books/RayTracingTheNextWeek.html
Accessed DD MMM. YYYY.
```
