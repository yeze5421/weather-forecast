# 机内气象 · CIRRUS

把电脑的忙碌变成天气。一个本地运行的 Windows 系统托盘小组件，带完整观测视图。

## 直接运行

当前便携版面向 **Windows 10 / 11 x64**。双击 `release/Cirrus-Weather-1.0.0.exe`，无需安装 Node.js、Python 或 .NET，也不需要账号、API Key 或服务器。

GitHub 发布时，普通用户应下载 **Releases 中的 `.exe`**；GitHub 自动提供的「Source code」压缩包只有源码，需要按下文安装开发环境并构建。当前程序尚未进行数字签名，Windows 可能显示未知发布者或 SmartScreen 提示。

- 左键点击系统托盘里的天气图标：打开或收起小组件。
- 右键天气图标：选择 CPU / GPU、设置置顶或退出。
- 窗口右上角展开按钮：切换小组件与完整气象站。
- 关闭按钮将应用收起到托盘；完全结束请使用托盘菜单的「退出机内气象」。
- 托盘图标可能在 Windows 的「显示隐藏的图标」区域。

## 天气如何变化

| 观测状态 | 天气 |
| --- | --- |
| 所选 CPU / GPU 负载低于 40% | 晴天 |
| 所选 CPU / GPU 负载 40%–79% | 多云 |
| 所选 CPU / GPU 负载达到 80% | 暴雨 |
| 内存使用达到预警线（默认 90%，可调整） | 雷暴，优先于其他天气 |
| 所选负载传感器不可用 | 等待观测 |

风扇 RPM 决定风车与风线的速度。没有转速数据时，风车静止、读数留空。

这些天气描述当前电脑状态，不预测未来负载或物理天气。

## 数据与硬件支持

- **CPU / 内存**：读取系统实际数据。CPU 首次采样需要一个观测周期。
- **NVIDIA GPU**：读取驱动自带的 `nvidia-smi`，每 4 秒采样。多显卡时显示最忙的 NVIDIA 显卡。
- **其他 Windows GPU**：使用 Windows GPU 性能计数器回退，每 10 秒采样，按最忙的物理引擎统计。驱动不支持时显示缺失。
- **风扇 RPM**：读取正在运行的 LibreHardwareMonitor / OpenHardwareMonitor 的 WMI `Fan` 传感器；多个风扇取最高转速。具体可用性取决于主板、硬件监测程序与权限。应用不安装驱动，不控制风扇。GPU 风扇百分比不会被冒充为 RPM。
- 设置中的观测频率控制 CPU / 内存与界面更新；GPU / 风扇按上述独立周期采样。
- 所有数据留在本机；无账号、无远程 API、无上传。
- 历史保留本次运行最近 30 分钟。退出后清空，可主动导出 CSV。天气预览与真实观测分开。

## 天气预览

点击「天气预览」体验晴天、多云、暴雨、雷暴。界面会明确标注「预览模式」，并使用演示读数，不对实际电脑施加负载。选择「返回实时观测」回到真实数据。浏览器版本只能预览，真实监测需要桌面版。

## 开发与构建

需要 Node.js 22.12+（已在 Node.js 24 测试）。

```powershell
npm ci
npm run desktop:dev   # Electron + Vite 热更新
npm start             # 构建后启动桌面版
npm run dev           # 浏览器预览 http://127.0.0.1:5186
npm test              # 天气规则单元测试
npm run test:desktop  # 原生应用集成测试，使用独立测试配置
npm run pack          # release/win-unpacked/，可运行的文件夹版
npm run dist          # Windows 单文件便携版
```

开发环境首次安装依赖时需要下载 Electron 官方二进制；使用代理的环境可先设置 `$env:ELECTRON_GET_USE_PROXY='1'`。正常运行已打包的桌面应用无需联网。

## 项目结构

```text
electron/             安全桌面桥接、托盘、真实系统采样
src/main.js           界面、偏好、预览、观测记录与导出
src/weather-model.js  天气映射与数值处理
src/weather-scene.*   原创 SVG 场景与动效
src/style.css         完整视图与小组件响应式样式
tests/                天气规则边界测试
scripts/              开发启动与桌面集成测试
```

偏好保存在当前用户应用数据目录下的 `preferences.json`。开机启动默认关闭；便携版启用后请保持 exe 路径不变。Renderer 启用沙箱和上下文隔离，通过受校验的 IPC 读取数据。

技术参考：[Electron Tray](https://www.electronjs.org/docs/latest/api/tray)、[Vite](https://vite.dev/guide/)。

## 发布与隐私

发布文件范围、隐私检查结果及 GitHub 发布步骤见 [PUBLISHING.md](PUBLISHING.md)。本地 `artifacts/` 包含测试读数、硬件信息和浏览器测试缓存，`release/` 还包含构建诊断文件；请勿直接打包上传整个工作目录。`.gitignore` 只保护遵循 Git 忽略规则的操作，不会清理手工压缩包或已经提交的历史。
