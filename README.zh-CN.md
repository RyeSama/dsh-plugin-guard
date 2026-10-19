```bash
npx dsh-plugin-guard-cli scan ./my-plugin   # 一条命令，不用安装、不用配置、不用登录
```
干净的插件会输出 `PASS 100/100 — 0 high · 0 medium · 0 low`；有风险时直接给出问题、文件行号和修复命令。

# dsh-plugin-guard

**在安装 DSH 插件前、发布自己的插件前、以及在 CI 里运行的安全准入检查。**

DSH 插件是带有 `dsh` 字段的 npm 包，会被组合进 DSH 宿主进程。这个边界上没有沙箱：插件与 DSH 同权限运行。本工具不改变这一点，它只把"即将发生的决定"提前变得可见：

- **scanner** — 只读取、绝不执行插件代码，报告它被允许做什么
- **权限清单** — 本项目提出的 `dsh.permissions` 约定，让插件声明自己读什么、写什么、执行什么、发往哪里
- **信任索引** — 本地记录你审查过的源码哈希，静默重发布会被发现
- **运行时审计适配器** — 有接口、有 sidecar 实现，并如实说明 DSH 今天没有开放什么

它不是沙箱，不是杀毒软件，也不能代替你自己读代码。

## 扫描内容

| 类别 | 会被标记的例子 |
| --- | --- |
| DSH 清单 | 缺少 `dsh` 字段、`bundle.patch` 指向未随包发布的文件、DSH 版本范围无法解析 |
| npm 状态 | 未发布、已废弃、本地版本比已发布版本新 |
| 权限 | 没有 `dsh.permissions`、声明非法、代码用了没声明的能力 |
| 危险代码 | `child_process`、`eval`/`new Function`、`vm.runIn*`、动态 `require`/`import`、`process.binding`、混淆载荷 |
| 安装脚本 | `preinstall`、`install`、`postinstall` —— 在任何人审查之前就执行的代码 |
| 依赖 | 缺 lockfile、`*` / `latest` / git / http 版本、依赖面过大 |
| 网络 | 代码里写死、却没有声明的目标主机 |
| 来源完整性 | 包哈希与你索引里记录的不一致、发布者变化 |

完整规则与严重级别：`npx dsh-plugin-guard-cli rules`。

## 命令

```bash
npx dsh-plugin-guard-cli scan ./my-plugin
npx dsh-plugin-guard-cli scan ./my-plugin --json
npx dsh-plugin-guard-cli scan dsh-startup-screen-repair --check-publish
npx dsh-plugin-guard-cli doctor
npx dsh-plugin-guard-cli init ./my-plugin --dry-run
npx dsh-plugin-guard-cli index add ./my-plugin
npx dsh-plugin-guard-cli index list
npx dsh-plugin-guard-cli index verify ./my-plugin   # 复核后代码有没有被改过
npx dsh-plugin-guard-cli audit status
```

### 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 通过，或只有提示 |
| `1` | 存在 high 问题（或加了 `--fail-on-medium` 时的 medium 问题） |
| `2` | 用法错误：未知参数、未知规则 id、`--max-files` 非法 |
| `3` | 扫描无法进行：目标不存在、网络失败、package.json 读不了 |

### 零配置

没有配置文件，也不需要 `init`。默认：所有规则开启、本地目录扫描不联网、输出人类可读报告、高危即非零退出。可调项只有参数：

`--json`、`--offline`、`--check-publish`、`--only <ids>`、`--ignore <ids>`、`--fail-on-medium`、`--dsh-version <v>`、`--max-files <n>`、`--record`、`--verbose`。

## 声明权限

`dsh.permissions` 是**本项目提出的约定**，DSH 目前不会读它，扫描器也无法在运行时强制执行——它只检查声明是否存在、是否合法、是否与代码实际行为一致。

字段与语义见 [docs/permissions-spec.md](docs/permissions-spec.md)（英文）。

## 信任索引

默认位置 `~/.dsh-plugin-guard/index.json`，可用 `DSH_GUARD_INDEX` 覆盖。按 `name@version` 记录：包哈希、目录树哈希、发布者、扫描结论、扫描时使用的 DSH 版本。没有索引也能扫描，只是对 registry 包会标注"来源未验证"，而不是假装安全。

## 运行时审计：哪些是真的

DSH 目前没有公开的插件审计事件流，也没有进程内隔离。因此本项目提供：

- 文档化的 `RuntimeAuditAdapter` 接口；
- **sidecar** 实现：把 NDJSON 事件追加到 `~/.dsh-plugin-guard/audit.ndjson`；
- `audit status`：用白话说清楚"没有官方钩子"，而不是伪造能力。

详见 [docs/audit-adapter.md](docs/audit-adapter.md) 与 [docs/threat-model.md](docs/threat-model.md)。

## 非目标

- 不是沙箱：DSH 加载插件后，它无法阻止恶意代码。
- 不是代码审计：它找模式，不判断意图。
- 不替代 `npm audit` 或 lockfile。
- 绝不运行、导入、安装或求值被扫描的插件。
- 不读取你的 `.env`、凭据、SSH 密钥或浏览器数据；扫描器会跳过这些路径，并拒绝扫描整个用户目录。

## 安全声明

扫描器只读文件：不会 `require`/`import` 被扫描的包，不执行 `postinstall`，不解析其依赖，也不往被扫描目录里写任何东西。只有 `scan <npm 包名>`、`--check-publish`、`index add <npm 包名>` 和 `doctor` 会联网。报告不含机密：路径都相对于包根目录。

如果你能让扫描器执行被扫描的代码，那是安全漏洞，请开 issue。

## 开发

```bash
npm ci
npm run verify     # lint + typecheck + test + build
npm run smoke      # 打包后用 npx 跑 tests/fixtures/clean-plugin
```

需要 Node 20+，没有原生依赖，发布包内已打包 commander 与 zod。

## 许可证

MIT
