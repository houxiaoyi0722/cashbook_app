<div align="center" style="display:flex;align-items:center;justify-content:center;">
<h1>Cashbook App</h1>
</div>
<p align="center">
  <img alt="release" src="https://img.shields.io/github/v/release/houxiaoyi0722/cashbook_app?include_prereleases" />
  <img alt="stars" src="https://img.shields.io/github/stars/houxiaoyi0722/cashbook_app" />
  <img alt="forks" src="https://img.shields.io/github/forks/houxiaoyi0722/cashbook_app" />
</p>
<p align="center">
  <img alt="issues-open" src="https://img.shields.io/github/issues/houxiaoyi0722/cashbook_app?color=important" />
  <img alt="issues-closed" src="https://img.shields.io/github/issues-closed/houxiaoyi0722/cashbook_app?color=green" />
  <img alt="GitHub Releases Download" src="https://img.shields.io/github/downloads/houxiaoyi0722/cashbook_app/total.svg" />
</p>

<p align="center">
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-v0.78-blue.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-v5.0-blue.svg" />
  <img alt="license" src="https://img.shields.io/github/license/houxiaoyi0722/cashbook_app" />
</p>

Cashbook App 是 [Cashbook](https://github.com/dingdangdog/cashbook) 的移动客户端，提供便捷的记账体验，随时随地管理您的财务。

## ✨ 功能特点
已支持功能
- 📱 跨平台支持 (~~iOS~~ & Android)
  - IOS版本暂无,欢迎PR
- 📊 流水日历视图，直观展示每日收支
- 📈 统计分析，了解您的消费习惯
- 🔄 自动去重功能，避免重复记账
- ⚖️ 平账功能，轻松处理退款和转账
- 📚 多账本管理，分类整理不同用途的账目
- 🔐 安全连接到您的 Cashbook 服务器
- 📊 预算管理,设定预算，实时监控支出进度
- 🤖 AI助手功能，智能财务管理
  - 智能记账建议：根据消费习惯提供记账建议,APP功能自动处理简化记账操作
  - 财务分析：分析消费模式，提供优化建议
  - 预算规划：帮助制定合理的预算计划
  - 问答交互：回答关于财务管理的各种问题
  - 支持多种AI模型：OpenAI、DeepSeek等
- 🧾 小票管理,拍照或上传小票

## 🤖 AI助手功能

### 如何使用AI助手
1. **启用AI助手**：
   - 进入App的“设置”页面
   - 找到“AI助手功能”开关，将其打开
   - 首次启用时会显示风险提示，请仔细阅读后确认启用

2. **配置AI参数**：
   - 启用后，设置页面会出现“AI助手配置”选项
   - 点击进入配置页面，可以设置：
     - API密钥（支持OpenAI、DeepSeek等多种模型）
     - 选择AI模型
     - 调整其他相关参数

3. **开始使用**：
   - 配置完成后，主界面底部导航栏会出现“AI助手”标签页
   - 点击进入AI助手聊天界面，即可开始对话

### 使用注意事项
⚠️ **重要提示**：
1. **数据隐私**：AI助手需要访问您的账本数据以提供智能建议。部分数据可能会被发送到外部AI服务进行处理，请确保您了解相关风险。
2. **数据备份**：强烈建议在启用AI助手前，自行备份重要数据，或导出账本数据到安全位置。
3. **定期备份**：建议定期备份数据，以防意外情况发生。
4. **模型选择**：不同的AI模型在准确性和成本上有所差异，请根据自身需求选择合适的模型。
5. **API费用**：使用AI模型可能会产生API调用费用，请留意相关服务的收费标准。
6. **功能限制**：AI助手提供的建议仅供参考，不构成专业的财务建议。重要财务决策请咨询专业财务顾问。
   如果您对数据安全有较高要求，建议：
- 仅在必要时启用AI助手
- 使用后及时关闭功能
- 避免在AI助手中处理高度敏感的交易信息
### ⚙️ AI助手配置

#### 支持的AI服务商
AI助手支持多种AI服务商，您可以根据需求选择合适的服务：
- **OpenAI**：提供GPT系列模型，如GPT-3.5-turbo、GPT-4等
- **DeepSeek**：提供DeepSeek系列模型，性价比高
- **其他兼容OpenAI API的服务**：支持任何兼容OpenAI API格式的第三方服务

#### 需要配置的参数
在AI助手配置页面中，您需要设置以下参数：

1. **API密钥**：
   - 从您选择的AI服务商处获取API密钥
   - 确保密钥具有足够的权限调用相应模型

2. **模型选择**：
   - 根据您的需求选择合适的模型
   - 不同模型在性能、速度和成本上有所差异
   - 常用模型推荐：
     - 日常对话：GPT-3.5-turbo 或 DeepSeek-chat
     - 复杂分析：GPT-4 或 DeepSeek-reasoning

3. **API端点**：
   - 默认使用各服务商的官方端点
   - 如需使用代理或自建服务，可在此处修改

4. **最大令牌数**：
   - 控制AI响应的最大长度
   - 建议值：1024-4096之间
   - 数值越大，响应越详细，但消耗的令牌数也越多

5. **温度参数**：
   - 控制AI回答的随机性和创造性
   - 范围：0.0 到 2.0
   - 建议值：
     - 精确回答：0.1-0.3
     - 平衡模式：0.7-0.9
     - 创造性回答：1.0-1.2

6. **系统提示词**：
   - 定义AI助手的角色和行为
   - 默认提示词已针对财务管理优化
   - 高级用户可自定义修改

## 📱 连接到 Cashbook 服务器

1. 启动应用后，进入服务器配置页面
2. 输入您的 Cashbook 服务器地址
3. 使用您的 Cashbook 账户登录
4. 开始使用所有功能！

## 🔧 配置

### 服务器配置

应用支持连接到任何运行 [Cashbook](https://github.com/dingdangdog/cashbook) 的服务器实例。您可以：

- 添加多个服务器配置
- 设置默认服务器
- 在不同服务器之间切换

### 账本管理

- 创建多个账本
- 设置默认账本
- 自定义账本属性

## 🤝 贡献

我们欢迎所有形式的贡献！请遵循以下流程：
1. Fork 本仓库
2. 创建 feature 分支 (`git checkout -b feature/AmazingFeature`)
3. 提交修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 发起 Pull Request
## 📄 许可证

本项目采用 MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。

## 🔗 相关链接

- [Cashbook 服务端](https://github.com/dingdangdog/cashbook)
- [问题反馈](https://github.com/houxiaoyi0722/cashbook_app/issues)

## 📸 截图

![日历视图](screenshots/calendar.png)
![统计分析](screenshots/statistics.png)
![统计分析](screenshots/statistics2.png)

### 🤖 AI助手功能截图

![AI助手聊天界面](screenshots/ai_chat.png)

![AI助手配置页面](screenshots/ai_config.png)

---

*Cashbook App - 让记账更简单，财务管理更轻松！*
