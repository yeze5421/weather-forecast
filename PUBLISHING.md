# 发布与隐私说明

## 用户需要什么

当前发布目标是 Windows 10 / 11 x64，便携程序为 `Cirrus-Weather-1.0.0.exe`。Electron 已将 Chromium、Node.js 和应用代码一起打包，用户不需要另装开发运行时。应用不需要账号、API Key、服务器或天气服务，正常观测可离线使用。

| 功能 | 数据来源和前置条件 |
| --- | --- |
| CPU、内存 | 内置 Node.js 系统接口；基础观测不需要额外监测软件 |
| NVIDIA GPU | 显卡驱动提供的 `nvidia-smi`；不可用时尝试 Windows 性能计数器 |
| 其他 GPU | Windows PowerShell / CIM 性能计数器；取决于系统与显卡驱动支持 |
| 风扇转速 RPM | 可选：运行能暴露 WMI Fan 传感器的 LibreHardwareMonitor / OpenHardwareMonitor；硬件、权限或提供程序不支持时显示缺失 |

不安装硬件监测程序也能使用 CPU / 内存天气。机内气象本身不安装驱动、不调节风扇，也不要求基础观测以管理员身份启动。企业设备策略可能限制 PowerShell、硬件查询或未签名程序。

开发和自行构建需要 Node.js 22.12+、npm，以及首次下载依赖和 Electron 的网络连接。在 Windows 项目目录运行 `npm ci`、`npm test`、`npm run dist`。日常使用已经打包的 exe 不需要这些步骤。当前没有提供 macOS、Linux 或 Windows ARM64 的经过验证的发行版。

## GitHub 怎么放

1. 仓库放源文件：`src/`、`electron/`、`public/`、`build/` 中的应用图标、`scripts/`、`tests/`、依赖清单及锁文件、`LICENSE`、说明文档和配置。可以从经过白名单整理的源码压缩包开始创建仓库。
2. 创建一个 GitHub Release，把 `Cirrus-Weather-1.0.0.exe` 和 `SHA256.txt` 作为附件上传。普通用户下载 exe 后运行；GitHub 自动生成的 Source code 压缩包供开发者使用。
3. 不上传整个本地工作目录，不上传 `node_modules/`、`artifacts/`、`publish/` 或整个 `release/`。尤其不上传测试用户配置目录、CSV、测试截图、构建日志、`builder-debug.yml`、环境变量文件和签名私钥。
4. 本项目已选择 **MIT License**，版权署名使用公开 GitHub 用户名 `yeze5421`，不包含私人邮箱或真实姓名。分发第一方代码时须保留根目录的 `LICENSE`；便携程序也包含该文件。应用包内保留了 Electron / Chromium 的第三方许可说明。
5. 当前 exe **没有数字签名**，Windows 可能显示未知发布者或 SmartScreen 提示。正式分发可配置 Windows 代码签名；证书、私钥和密码保存在受保护的本机环境或 CI Secrets 中，不能写入仓库。签名需要另行配置，并不保证消除所有系统提示。

仓库位于 [yeze5421/weather-forecast](https://github.com/yeze5421/weather-forecast)，v1.0.0 发布页为 [GitHub Release](https://github.com/yeze5421/weather-forecast/releases/tag/v1.0.0)。Git 提交的姓名和邮箱会进入历史，本次提交身份使用 GitHub noreply 邮箱。`package.json` 的 `private: true` 只防止误发布到 npm，不决定 GitHub 仓库是否公开。

## 本次检查结果（2026-10-24）

检查范围包括第一方源码、脚本、配置和依赖锁文件，以及最终便携 exe 中的应用归档与外置传感器脚本。已从 exe 提取内容，并通过 SHA-256 确认其 `app.asar` 和 `sensors.ps1` 与已检查的解包版本完全一致。

- 在上述第一方内容中未发现账号凭证、API Key、私钥、本机用户的邮箱或实际本机用户名 / 项目绝对路径。依赖锁文件使用公开 npm 下载地址，没有发现带认证信息的下载链接；其中一项依赖的弃用说明含上游维护者的公开联系邮箱，属于第三方包元数据。
- 应用代码读取硬件型号、负载、内存、温度、风扇转速、时间和开机时长。未发现读取账号、主机名、MAC 地址、硬件序列号或个人文档内容的实现，未发现遥测、上传、远程 API 或自动更新请求。开发启动脚本访问本机 Vite 服务，不属于正式程序的远程通信。
- 偏好保存在当前用户应用数据目录；观测历史保留最近 30 分钟并在退出后清空。用户主动导出的 CSV 会保留采样时间和读数，应自行决定是否分享。Electron 也可能在本机生成缓存或配置文件。
- **本地整个工作目录包含不应公开的信息**：`artifacts/` 中的测试 JSON、CSV、截图会反映实际机器和使用状态；测试用户配置含缓存及本机路径；构建诊断也含本机路径。这些不在应用归档和本次白名单源码副本中。
- 已扩充 `.gitignore`，排除测试产物、发布副本、环境文件、常见凭证文件、签名材料和编辑器状态。忽略规则不保护手工上传，不会移除已经进入 Git 历史的内容；示例环境文件仍需要人工检查。

这是针对当前版本的源码与包内容检查，不是对所有第三方依赖的完整安全审计，也未进行全量网络抓包。任何后续代码、图片、配置或依赖变化，发布前仍需重新检查。不要把“未发现敏感内容”当成永久、绝对的安全保证。

参考：[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)、[Electron 代码签名](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[GitHub 提交邮箱设置](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)。
