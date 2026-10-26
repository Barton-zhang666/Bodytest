<div align="center">

# 🫀 VITALIS · 人体生命实验室

**一个可以观察药物、食物与人体系统联动的 3D 生理学沙盒。**

![版本](https://img.shields.io/badge/version-5.3.1-2b8f7c?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-f7df1e?style=flat-square&logo=javascript&logoColor=222)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5_20-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![WebGL2](https://img.shields.io/badge/3D-WebGL2-990000?style=flat-square)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**简体中文** · [English](README.en.md)

[功能概览](#features) · [快速开始](#quick-start) · [使用方式](#usage) · [开发](#development) · [模型边界](#model-notes)

</div>

> [!IMPORTANT]
> 本项目是未经临床验证的教学模拟器。药量、浓度、阈值与响应均为模型输入或近似，**不能用于真实用药、诊疗、急救指导或安全剂量判断**。

![VITALIS 三维人体与实时生命体征预览](.github/assets/preview.png)

<a id="features"></a>
## ✨ 功能概览

| 模块 | 能做什么 |
| --- | --- |
| **3D 人体** | 男性 A 形站姿、11 组器官、完整脑体与沟回；默认半透明，选择器官后显示实色 |
| **体征监测** | 79 项参数，涵盖循环、呼吸、血糖、电解质、酸碱、肝肾、意识与凝血；支持趋势和合成波形 |
| **药物实验** | 55 种药物、16 类药理分类；多药组合、剂量滑条、给药途径、部分液体剂型浓度与体积控制 |
| **饮食与输注** | 22 种食物和饮品、5 类液体及血液成分；展示消化吸收、容量与浓度变化 |
| **症状与损伤** | 54 条症状规则、6 类不可逆器官损伤；紫唇、黄疸、抽搐及器官变色直接呈现在人体上 |
| **感染与急救** | 6 类合成感染情景；点击按压、插管、辅助通气和氧支持分别控制 |
| **实验记录** | 8 种基线、1×–300× 调速、快进、事件日志、浏览器存档、JSON 导入/导出及 CSV 时序导出 |

### 系统之间会相互影响

循环与供氧、通气与酸碱、脑肾灌注、血糖代谢、电解质、体液混合及药物清除通过确定性方程相连。症状由模型状态触发；药物不会只改变一个独立的数字。

- 药物活性和预计剩余作用时间使用两条进度分别显示。
- 同类重复投放会累积，已建模的相互作用会改变响应。
- “移除药物”用于编辑实验：清除该药的剩余批次和效应，保留已经发生的体征变化、输入液体与损伤。
- 心脏搏动、肺部呼吸和可选监护音按当前生命体征播放，不随模拟倍率直接加速。

<a id="quick-start"></a>
## 🚀 快速开始

**环境：** Node.js 20+，以及支持 WebGL2 的现代浏览器。

```sh
git clone https://github.com/Barton-zhang666/Bodytest.git
cd Bodytest
npm run dev
```

打开 **[http://127.0.0.1:4173](http://127.0.0.1:4173)**。

日常运行不需要先执行 `npm install`：Three.js 和模型资源已随源码提供。只有修改并重新生成人体外壳时，才需要安装开发依赖。不要直接双击 `index.html`，ES modules 需要通过 HTTP 服务器加载。

<details>
<summary>端口被占用？</summary>

PowerShell：

```powershell
$env:PORT = '4174'
npm run dev
```

macOS / Linux：

```sh
PORT=4174 npm run dev
```

开发服务器仅监听 `127.0.0.1`，使用 `Ctrl+C` 停止。

</details>

<a id="usage"></a>
## 🧪 使用方式

1. **选择基线**：健康、高血压、高血糖、低容量等合成状态。
2. **添加干预**：在药物、食物或输注目录中搜索，加入清单并调整用量；感染情景独立添加。
3. **应用并观察**：运行或快进，查看生命体征、实际症状、器官外观和体内活性。
4. **复盘实验**：打开趋势与事件日志，导出 JSON 存档或 CSV 时序。

可以从一份米饭的消化与血糖变化开始，逐步观察系统间的反馈。

| 模型操作 | 方式 |
| --- | --- |
| 水平旋转 | 鼠标 / 单指横向拖动，或 `←` / `→`；仅绕人体纵轴旋转 |
| 焦点缩放 | 滚轮围绕鼠标位置缩放；`+` / `−` 和按钮沿用最近指向 |
| 器官选择 | 点击模型或左侧器官列表，再次点击可取消；`Esc` 取消选择 |
| 还原视图 | `Home` 或还原按钮；另有正面 / 背面快捷按钮 |
| 声音 | 点击“开启声音”后生效，可静音、调节音量与试听 |

界面目前为简体中文；本仓库提供中英文 README。数据保存在当前浏览器，刷新后以暂停状态恢复；后台不累计离线模拟时间。

<a id="development"></a>
## 🛠️ 开发

原生 HTML、CSS 和 ES modules；生理引擎不依赖 DOM。没有前端框架、运行时 CDN、远程人体资源或服务端数据库。

```text
Bodytest/
├── index.html                  页面入口
├── src/
│   ├── main.js                 交互、状态、存档与导出
│   ├── data/                   药物、食物、指标、相互作用与人体数据
│   ├── engine/                 确定性生理、药代、损伤与感染计算
│   ├── ui/                     3D 人体、图表、症状外观与音效
│   ├── assets/                 本地音频及许可证
│   └── vendor/three/           固定版本 Three.js 与许可证
├── scripts/                    本地服务、构建、语法检查与模型生成
├── tests/                      机制、重放、边界与交互几何测试
├── README.md                   中文说明
├── README.en.md                English documentation
└── LICENSE                     MIT
```

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地服务器 |
| `npm test` | 运行自动化测试 |
| `npm run check` | 检查 JavaScript 语法 |
| `npm run build` | 生成可托管的静态站点 `dist/` |
| `npm run model:generate` | 离线重建人体外壳，需要先执行 `npm ci` |

新增药物、食物和参数优先扩展 `src/data/`。调整模型机制后运行测试、语法检查和构建；保持固定积分步长，不用随机数伪造体征。修改生理方程或数据含义时，应更新模型版本并明确存档迁移策略。

当前应用版本为 **5.3.1**，生理模型 / 存档版本为 **V5**。三维画面约 21.9 万三角面；限制像素比，暂停时按需绘制。人体外壳离线生成，脑沟在初始化时构建，动画期间不重建网格。

<a id="model-notes"></a>
## 模型边界

- **教学近似**：不预测个体反应，不覆盖全部相互作用、病理机制或人群差异。未出现症状不代表安全。
- **急救情景**：心跳停止或呼吸暂停仍可施加支持。模拟终止只由不可逆脑损伤代理阈值决定，不能用于临床脑死亡判定。
- **感染情景**：负荷和敏感谱是合成参数，不对应真实病原体注射剂量或临床药敏。
- **时间与波形**：效应持续时间受模型清除与效应室影响；心电、脑电等为合成信号，不是诊断记录。
- **解剖模型**：人体和器官由程序构建，用于辨识和观察，不是人体扫描或测量数据。

自动化测试验证软件行为与数值规则，**不证明临床准确性**。

<a id="credits"></a>
## 许可与致谢

项目采用 **[MIT License](LICENSE)**。第三方组件保留各自许可证：

| 组件 / 素材 | 用途 | 来源与许可 |
| --- | --- | --- |
| Three.js 0.186.1 | 本地 WebGL2 渲染 | [官方发布包](https://registry.npmjs.org/three/-/three-0.186.1.tgz) · [MIT](src/vendor/three/LICENSE) |
| meshoptimizer 1.3.0 | 仅用于离线人体减面 | [上游项目](https://github.com/zeux/meshoptimizer) · MIT；版本与完整性见锁文件 |
| Kenney Interface Sounds | 点击与投放反馈 | [素材来源](https://kenney.nl/assets/interface-sounds) · [CC0 许可](src/assets/audio/LICENSE-Kenney.txt) |

Three.js 的两个本地模块保留官方发布内容；人体与器官网格为本项目程序生成。监护提示音使用 Web Audio 合成。药物条目中的部分时间资料链接到 [DailyMed](https://dailymed.nlm.nih.gov/dailymed/)，但模型参数仍是教学近似。

---

<div align="center">

[提交问题](https://github.com/Barton-zhang666/Bodytest/issues) · [查看源码](https://github.com/Barton-zhang666/Bodytest) · [Switch to English](README.en.md)

</div>
