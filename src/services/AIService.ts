import { mcpBridge } from './MCPBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventSource from 'react-native-sse';
import {
  Message,
} from '../types';
import { AIRecursiveService } from './AIRecursiveService';
import {StreamMessageParser} from './StreamMessageParser.ts';
// AIConfigService will be imported dynamically in generatePromptSuggestions to avoid circular dependencies

export interface AIResponse {
  messages?: Message[]; // 新增：结构化的消息数组
  text?: string; // 改为可选，因为现在主要通过messages返回
  thinking?: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
  error?: string;
  streamCallback?: (content: string, isComplete: boolean) => void;
}

// 新的回调函数类型
export type MessageStreamCallback = (message: Message, isComplete: boolean) => void;

export class AIService {
  private conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }> = [];

  currentBookId: string | null = null;
  currentBookName: string | null = null;
  streamParser: StreamMessageParser | undefined;
  cancelling: boolean = false;

  // 保存当前活动的EventSource实例，用于支持用户终止SSE连接
  currentEventSource: EventSource | null = null;

  // 更新当前账本信息
  updateBookInfo(bookId: string | null, bookName?: string | null) {
    this.currentBookId = bookId;
    this.currentBookName = bookName || null;
    console.log(`AIService: 当前账本已更新为 ${bookId} (${bookName})`);
  }

  async sendMessage(userMessage: string, streamCallback?: MessageStreamCallback): Promise<AIResponse> {
    // 重置取消标志，因为用户开始了新的对话
    this.cancelling = false;
    this.streamParser = new StreamMessageParser();
    // 创建递归服务实例
    const recursiveService = new AIRecursiveService(this);
    // 调用递归函数
    return recursiveService.sendMessageRecursive(userMessage, streamCallback);
  }

  async getContext(): Promise<any> {
    try {
      // 获取用户信息
      const userInfoStr = await AsyncStorage.getItem('user_info');
      let userInfo = null;
      if (userInfoStr) {
        try {
          userInfo = JSON.parse(userInfoStr);
        } catch (parseError) {
          console.warn('解析用户信息失败:', parseError);
        }
      }

      // 获取服务器配置
      const serverConfigStr = await AsyncStorage.getItem('server_config');
      let serverConfig = null;
      if (serverConfigStr) {
        try {
          serverConfig = JSON.parse(serverConfigStr);
        } catch (parseError) {
          console.warn('解析服务器配置失败:', parseError);
        }
      }

      // 优先使用AIService中存储的当前账本信息
      let currentBook = null;
      if (this.currentBookId) {
        currentBook = {
          id: this.currentBookId,
          bookId: this.currentBookId,
          bookName: this.currentBookName || '当前账本',
          createDate: new Date().toISOString(), // 使用当前时间作为占位符
        };
      }

      const context = {
        user: userInfo ? {
          id: userInfo.id,
          name: userInfo.name,
          email: userInfo.email,
        } : null,
        currentBook: currentBook,
        server: serverConfig ? {
          name: serverConfig.name,
          url: serverConfig.url,
        } : null,
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('zh-CN'),
      };

      console.log('📋 获取上下文成功', {
        hasUser: !!context.user,
        hasBook: !!context.currentBook,
        hasServer: !!context.server,
        bookId: this.currentBookId,
        bookName: this.currentBookName,
        currentBookInfo: currentBook,
      });

      return context;

    } catch (error) {
      console.error('❌ 获取上下文失败:', error instanceof Error ? error.message : String(error));
      // 返回默认上下文
      return {
        user: null,
        currentBook: null,
        server: null,
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('zh-CN'),
        error: '无法获取完整上下文信息',
      };
    }
  }

  buildSystemPrompt(context: any): string {
    const tools = mcpBridge.getTools();

    // 为每个工具创建详细的参数说明表格
    const toolsDetailedDescription = tools.map(tool => {
      let toolInfo = `## ${tool.name}\n`;
      toolInfo += `**描述**: ${tool.description}\n`;

      // 添加参数说明
      if (tool.inputSchema && tool.inputSchema.properties) {

        const props = tool.inputSchema.properties;
        const required = tool.inputSchema.required || [];

        // 创建参数表格
        if (Object.entries(props).length !== 0) {
          toolInfo += '**参数说明**:\n';
          toolInfo += '| 参数名 | 类型 | 必需 | 格式/枚举 | 示例值 | 描述 |\n';
          toolInfo += '|--------|------|------|-----------|--------|------|\n';
        }

        for (const [paramName, paramSchema] of Object.entries(props) as [string, any][]) {
          const isRequired = required.includes(paramName) ? '是' : '否';
          let typeInfo = paramSchema.type || 'any';
          let formatEnum = '';

          if (paramSchema.enum) {
            formatEnum = `枚举: ${paramSchema.enum.join(', ')}`;
          } else if (paramSchema.format) {
            formatEnum = `格式: ${paramSchema.format}`;
          } else if (paramSchema.minimum !== undefined || paramSchema.maximum !== undefined) {
            const min = paramSchema.minimum !== undefined ? `≥${paramSchema.minimum}` : '';
            const max = paramSchema.maximum !== undefined ? `≤${paramSchema.maximum}` : '';
            formatEnum = `范围: ${min}${min && max ? '~' : ''}${max}`;
          }

          // 获取示例值
          let example = '';
          switch (paramName) {
            case 'name':
              example = '"午餐消费"';
              break;
            case 'money':
              example = '50.5';
              break;
            case 'flowType':
              example = '"支出"';
              break;
            case 'industryType':
              example = '"餐饮美食"';
              break;
            case 'payType':
              example = '"微信支付"';
              break;
            case 'date':
              example = '"2024-12-09"';
              break;
            case 'month':
              example = '"2024-12"';
              break;
            case 'pageNum':
              example = '1';
              break;
            case 'pageSize':
              example = '20';
              break;
            default:
              example = paramSchema.example || '""';
          }

          toolInfo += `| ${paramName} | ${typeInfo} | ${isRequired} | ${formatEnum} | ${example} | ${paramSchema.description || ''} |\n`;
        }

        // 添加必需参数说明
        if (required.length > 0) {
          toolInfo += `\n**必需参数**: ${required.join(', ')}`;
        }
      }

      toolInfo += '\n---\n';
      return toolInfo;
    }).join('\n');
    console.log(toolsDetailedDescription);
    // 构建上下文信息字符串
    let contextInfo = `当前时间: ${context.localTime}\n`;

    if (context.user) {
      contextInfo += `用户信息: ${context.user.name} (${context.user.email})\n`;
    } else {
      contextInfo += '用户信息: 未登录或用户信息不可用\n';
    }

    if (context.currentBook) {
      contextInfo += `当前账本: ${context.currentBook.bookName} (ID: ${context.currentBook.bookId})\n`;
      const createDate = new Date(context.currentBook.createDate);
      contextInfo += `账本创建时间: ${createDate.toLocaleDateString('zh-CN')}\n`;
    } else {
      contextInfo += '当前账本: 未选择账本\n';
    }

    if (context.server) {
      contextInfo += `服务器: ${context.server.name}\n`;
    }

    // 添加当前月份信息
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    contextInfo += `当前月份: ${currentMonth}\n`;

    return `你是一个专业的记账助手,严格遵循用户指示,不做非必要输出,可以调用以下工具来帮助用户管理财务：

## 可用工具详细说明
${toolsDetailedDescription}

## 重要上下文信息
${contextInfo}

## 工具调用最佳实践
1. **账本ID**: 所有工具调用都会自动使用当前账本ID，你不需要在参数中指定bookId
2. **日期处理**: 
   - 如果用户没有明确指定日期，请使用当前日期或根据上下文推断
   - 日期参数名使用date（YYYY-MM-DD格式）
   - 月份参数名使用month（YYYY-MM格式）
   - 固定支出需要startDate和可能的endDate
3. **金额处理**: 
   - 金额单位是人民币（元）
   - 金额不能小于0。
4. **参数映射**: 当用户使用别名时，需要映射到正确的参数名：
   - amount → money
   - category → industryType
   - type → flowType
   - desc/description → description
   - time/date → date
   - note → description
   - budget → budget（预算）
   - payment → payType（支付方式）
   - owner → attribution（归属人）
5. **参数补全**: 当用户输入中缺少必要参数时，需要根据上下文进行推断
6. **安全操作**: 
   - 删除操作（delete_fixed_flow、delete_flow）需要confirm参数为true
   - 批量操作（ignore_all_balance_items）需要确认
   - 更新操作前建议先查看当前状态
7. **数据刷新**: 
   - 大量数据操作后，可调用refresh_budget_usage刷新预算使用情况
   - 获取列表数据（get_pay_types、get_attributions）可用于填充下拉选项

### 针对工具集成推断：
**组合使用模式**:
1. **创建流水前获取选项**:
   - 用户说"记一笔支出" → 先调用get_pay_types和get_attributions获取可用选项
   - 再调用create_flow，使用获取的选项作为参数建议
2. **管理固定支出**:
   - 用户说"修改我的固定支出" → 可能需要先查询现有固定支出（通过其他接口）
   - 再调用update_fixed_flow进行修改
3. **预算管理流程**:
   - 用户设置预算后 → 可自动调用refresh_budget_usage确保数据准确
   - 结合get_monthly_summary提供完整分析

## 常见错误避免
1. **参数格式错误**:
   - 日期必须为YYYY-MM-DD格式
   - 月份必须为YYYY-MM格式
   - 金额必须是数字类型
   - cycleDay必须在1-31范围内（当cycleType为"每月"时）
2. **枚举值错误**:
   - flowType只能是"收入"、"支出"、"不计收支"
   - cycleType只能是"每月"、"每周"、"每年"
   - get_analytics的type只能是"attribution"、"payType"、"industryType"、"daily"

4. **安全确认**:
   - 操作修改数据前应提醒用户确认

## 工具调用示例
### 示例1：创建流水记录
用户输入："记一笔午餐消费50元"
<json>
{
  "toolCalls": [
    {
      "name": "create_flow",
      "arguments": {
        "name": "午餐消费",
        "money": 50,
        "flowType": "支出",
        "industryType": "餐饮美食",
        "payType": "其他",
        "attribution": "默认",
        "date": "2024-12-09",
        "description": "用户记录：午餐消费50元"
      }
    }
  ]
}
</json>

## **回复要求**
1. 用简洁、友好的中文回复，
2. 调用失败时，解释可能的原因并提供解决方案
3. **当需要调用工具时，请返回严格符合上述示例格式的<json></json>标签及对象**`;
}

  private getDefaultEndpoint(provider: string): string {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages', // Anthropic原生端点
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      custom: '', // custom provider 使用用户提供的 baseURL
    };

    // 对于需要OpenAI兼容的供应商，我们可以使用兼容端点
    // 注意：实际使用时可能需要配置代理或兼容服务
    return endpoints[provider] || endpoints.openai;
  }

  private getDefaultModel(provider: string): string {
    const models: Record<string, string> = {
      openai: 'gpt-3.5-turbo',
      anthropic: 'claude-3-haiku-20240307',
      deepseek: 'deepseek-chat',
      google: 'gemini-pro',
      custom: 'gpt-3.5-turbo', // 为 custom provider 提供合理的默认值
    };
    return models[provider] || models.openai;
  }

  private buildHeaders(config: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 统一使用Bearer token认证方式
    // 注意：对于某些供应商，可能需要特殊处理，但这里统一为OpenAI兼容格式
    if (config.provider === 'anthropic') {
      // Anthropic的OpenAI兼容端点可能需要不同的认证方式
      // 这里假设使用x-api-key，但实际可能需要调整
      headers['x-api-key'] = config.apiKey;
      // 添加Anthropic版本头
      headers['anthropic-version'] = '2023-06-01';
    } else if (config.provider === 'google') {
      // Google的OpenAI兼容端点可能需要特殊处理
      // 这里暂时使用Bearer token，实际可能需要调整
      headers.Authorization = `Bearer ${config.apiKey}`;
    } else {
      // OpenAI兼容格式（包括DeepSeek、OpenAI、custom等）
      // custom provider 也使用 Bearer token
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  private buildRequestBody(config: any, messages: any[], stream: boolean = true): any {
    // 统一使用OpenAI兼容格式
    // 注意：对于Anthropic和Google，需要确保端点支持OpenAI格式
    const requestBody: any = {
      model: config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.7,
      stream: stream, // 使用传入的stream参数，但默认值为true
    };

    // 优化建议生成API调用，考虑使用更小的模型或缓存结果以提高性能
    // 对于生成建议的场景，可以使用更低的temperature和更少的max_tokens
    if (!stream && messages.some(msg => msg.content.includes('提示建议生成器'))) {
      requestBody.max_tokens = 200; // 建议生成不需要太多tokens
      requestBody.temperature = 0.3; // 更低的随机性以获得更一致的输出
    }

    // 对于特定供应商，可能需要调整参数
    if (config.provider === 'anthropic') {
      // Anthropic的OpenAI兼容端点可能需要特定参数
      // 保持与OpenAI格式一致
    } else if (config.provider === 'google') {
      // Google的OpenAI兼容端点可能需要特定参数
      // 保持与OpenAI格式一致
    }
    // 其他供应商（openai, deepseek, custom）都使用相同的格式

    return requestBody;
  }

  private adjustEndpoint(baseURL: string, provider: string): string {
    console.log('🔧 开始调整端点', {
      original: baseURL,
      provider: provider,
    });

    // 如果没有baseURL，返回默认端点
    if (!baseURL || baseURL.trim() === '') {
      const defaultEndpoint = this.getDefaultEndpoint(provider);
      console.log('⚠️ 使用默认端点', { defaultEndpoint });
      return defaultEndpoint;
    }

    // 清理URL：去除末尾的斜杠
    let cleanedURL = baseURL.trim();
    if (cleanedURL.endsWith('/')) {
      cleanedURL = cleanedURL.slice(0, -1);
    }

    // 检查是否需要添加路径
    // 情况1：URL已经包含/chat/completions
    if (cleanedURL.includes('/chat/completions')) {
      console.log('✅ 端点已包含/chat/completions路径', { final: cleanedURL });
      return cleanedURL;
    }

    // 情况2：URL以/v1结尾
    if (cleanedURL.endsWith('/v1')) {
      const finalURL = `${cleanedURL}/chat/completions`;
      console.log('🔧 端点以/v1结尾，添加/chat/completions', {
        original: baseURL,
        adjusted: finalURL,
      });
      return finalURL;
    }

    // 情况3：URL包含/v1/但不是以它结尾
    if (cleanedURL.includes('/v1/')) {
      // 如果已经有其他路径，直接返回
      console.log('✅ 端点已包含/v1/路径', { final: cleanedURL });
      return cleanedURL;
    }

    // 情况4：URL没有路径或路径不完整
    // 检查是否有路径部分
    try {
      const urlObj = new URL(cleanedURL);
      const pathname = urlObj.pathname;

      // 如果路径为空或只有斜杠
      if (!pathname || pathname === '/' || pathname === '') {
        const finalURL = `${cleanedURL}/v1/chat/completions`;
        console.log('🔧 端点没有路径，添加/v1/chat/completions', {
          original: baseURL,
          adjusted: finalURL,
        });
        return finalURL;
      }

      // 如果有路径但不是/v1相关
      // 对于 custom provider，我们总是添加 /v1/chat/completions 以确保兼容性
      if (provider === 'custom') {
        const finalURL = `${cleanedURL}/v1/chat/completions`;
        console.log('🔧 custom provider：添加/v1/chat/completions以确保兼容性', {
          original: baseURL,
          adjusted: finalURL,
        });
        return finalURL;
      }

      // 对于其他提供商，保持原样
      console.log('⚠️ 端点有自定义路径，保持原样', {
        original: baseURL,
        pathname: pathname,
        final: cleanedURL,
      });
      return cleanedURL;
    } catch (error) {
      // 如果不是有效的URL，可能是格式错误
      console.error('❌ 端点URL格式无效', {
        original: baseURL,
        error: error instanceof Error ? error.message : String(error),
      });

      // 尝试修复：如果看起来像域名但没有协议，添加https://
      if (!cleanedURL.startsWith('http://') && !cleanedURL.startsWith('https://')) {
        const fixedURL = `https://${cleanedURL}/v1/chat/completions`;
        console.log('🔧 添加https://协议和/v1/chat/completions路径', {
          original: baseURL,
          fixed: fixedURL,
        });
        return fixedURL;
      }

      // 如果已经是http/https开头但解析失败，可能是格式问题
      // 直接添加/v1/chat/completions并返回
      const finalURL = `${cleanedURL}/v1/chat/completions`;
      console.log('🔧 端点解析失败，尝试添加/v1/chat/completions', {
        original: baseURL,
        adjusted: finalURL,
      });
      return finalURL;
    }
  }

  // 检查是否有活动的SSE连接
  hasActiveStream(): boolean {
    return this.currentEventSource !== null;
  }

  // 检查是否正在取消操作
  isCancelling(): boolean {
    return this.cancelling;
  }

  cancelCurrentStream(): void {
    // 防止重复调用
    if (this.cancelling) {
      console.log('⚠️ 取消操作正在进行中，跳过重复调用');
      return;
    }

    // 检查是否有活动的连接
    if (!this.currentEventSource) {
      console.log('🛑 没有活动的SSE连接可终止');
      return;
    }

    // 设置取消标志
    this.cancelling = true;

    try {
      console.log('🛑 用户请求终止，正在关闭SSE连接...');

      // 保存引用然后清空，防止重复调用
      const es = this.currentEventSource;
      this.currentEventSource = null;

      // 关闭连接
      es.close();

      // 移除所有事件监听器
      es.removeAllEventListeners();

      console.log('✅ SSE连接已成功关闭');

    } catch (error) {
      console.error('❌ 关闭SSE连接时发生错误:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      // 确保引用被清空
      this.currentEventSource = null;
    } finally {
      // 注意：这里不重置取消标志，让标志保持为true直到用户下一次发送消息

      // 清理流解析器状态
      if (this.streamParser) {
        try {
          this.streamParser.reset();
          console.log('🔄 流解析器状态已重置');
        } catch (parserError) {
          console.warn('⚠️ 重置流解析器时发生警告:', parserError);
        }
      }

      // 清理对话历史中的临时状态
      this.cleanupTemporaryStates();

      console.log('🧹 所有相关状态已清理完成');
    }
  }

  // 清理临时状态
  private cleanupTemporaryStates(): void {
    // 这里可以添加其他需要清理的状态
    // 例如：重置任何正在进行的操作标志等

    // 记录清理操作
    console.log('🧽 正在清理临时状态...', {
      hasStreamParser: !!this.streamParser,
      conversationHistoryLength: this.conversationHistory.length,
      timestamp: new Date().toISOString(),
    });
  }

  // 注意：所有API调用现在只支持流式模式，非流式调用已被移除
  async callAIAPI(config: any, systemPrompt: string, userMessage: string, streamCallback: (content: string, reasoning_content: string, isComplete: boolean) => void): Promise<void> {
    // 只支持流式调用，streamCallback 必须提供
    if (!streamCallback) {
      throw new Error('流式回调函数必须提供，接口调用只支持流式模式');
    }

    // 确保没有其他活动的SSE连接
    if (this.hasActiveStream()) {
      console.log('⚠️ 检测到已有活动的SSE连接，正在终止...');
      this.cancelCurrentStream();
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.getRecentHistory(),
      { role: 'user', content: userMessage },
    ];
    console.log('发送ai的记录:',messages);
    // 获取端点和模型
    const defaultEndpoint = this.getDefaultEndpoint(config.provider);
    const defaultModel = this.getDefaultModel(config.provider);

    // 使用调整后的端点
    let apiEndpoint;
    if (config.baseURL) {
      apiEndpoint = this.adjustEndpoint(config.baseURL, config.provider);
    } else {
      apiEndpoint = defaultEndpoint;
    }

    const model = config.model || defaultModel;

    console.log('🚀 准备AI API调用（仅流式）', {
      provider: config.provider,
      endpoint: apiEndpoint,
      model: model,
      messageCount: messages.length,
      hasCustomEndpoint: !!config.baseURL,
    });

    // 构建请求头和请求体
    const headers = this.buildHeaders(config);
    const requestBody = this.buildRequestBody(config, messages, true); // 总是使用流式

    console.log('📦 请求体信息', {
      provider: config.provider,
      model: requestBody.model,
      messageCount: requestBody.messages?.length || 0,
      maxTokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
      stream: requestBody.stream,
    });

    // 只使用流式调用
    await this.processStreamResponse(apiEndpoint, headers, requestBody, streamCallback);
  }

  private async processStreamResponse(
    endpoint: string,
    headers: Record<string, string>,
    body: any,
    streamCallback: (content: string, reasoning_content: string, isComplete: boolean) => void
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🌊 开始处理流式响应（使用react-native-sse）', {
          endpoint: endpoint,
          headers: headers,
          bodySize: JSON.stringify(body).length,
          provider: body.model?.includes('deepseek') ? 'DeepSeek' : 'Other',
          timestamp: new Date().toISOString(),
        });

        console.log('📡 发送SSE请求', {
          method: 'POST',
          url: endpoint,
          headersCount: Object.keys(headers).length,
          hasAuthorization: !!headers.Authorization,
          contentType: headers['Content-Type'],
        });

        // 创建EventSource实例并保存引用
        const es = new EventSource(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
          pollingInterval: 0, // 禁用轮询，使用真正的SSE
        });

        // 保存当前EventSource实例
        this.currentEventSource = es;

        let hasError = false;

        // 监听消息事件
        es.addEventListener('message', (event) => {
          try {
            if (event.type === 'message') {
              const data = event.data;

              console.log('📝 收到SSE数据', {
                data,
              });
              // 跳过结束标记
              if (data === '[DONE]') {
                console.log('🏁 收到SSE结束标记');
                es.close();
                es.removeAllEventListeners();
                this.currentEventSource = null;
                return;
              }

              if (!data) {
                return;
              }

              // 解析JSON数据
              const parsedData = JSON.parse(data);

              // 提取内容：检查多个可能的字段
              let delta = '';
              let thinkingDelta = '';

              // 1. 首先检查 reasoning_content（思考内容）
              if (parsedData.choices?.[0]?.delta?.reasoning_content !== undefined) {
                thinkingDelta = parsedData.choices[0].delta.reasoning_content || '';
              }
              // 2. 检查其他可能的思考字段
              else if (parsedData.reasoning_content !== undefined) {
                thinkingDelta = parsedData.reasoning_content || '';
              }
              else if (parsedData.choices?.[0]?.delta?.thinking !== undefined) {
                thinkingDelta = parsedData.choices[0].delta.thinking || '';
              }

              // 3. 提取常规内容
              if (parsedData.choices?.[0]?.delta?.content !== undefined) {
                delta = parsedData.choices[0].delta.content || '';
              } else if (parsedData.content !== undefined) {
                delta = parsedData.content || '';
              } else if (parsedData.result?.choices?.[0]?.delta?.content !== undefined) {
                delta = parsedData.result.choices[0].delta.content || '';
              } else if (parsedData.text !== undefined) {
                delta = parsedData.text || '';
              } else if (parsedData.message?.content !== undefined) {
                delta = parsedData.message.content || '';
              }

              // 发送到流式回调
              if (delta || thinkingDelta) {
                streamCallback(delta,thinkingDelta, false);
              }
            }
          } catch (parseError) {
            console.warn('❌ 解析SSE数据失败', {
              error: parseError instanceof Error ? parseError.message : String(parseError),
              eventData: event.data?.substring(0, 200),
            });
          }
        });

        // 监听错误事件
        es.addEventListener('error', (event) => {
          console.error('❌ SSE连接错误', {
            eventType: event.type,
            event: JSON.stringify(event),
          });

          if (!hasError) {
            hasError = true;
            es.close();
            es.removeAllEventListeners();
            this.currentEventSource = null;
            reject(new Error('SSE连接错误'));
          }
        });

        // 监听打开事件
        es.addEventListener('open', (event) => {
          console.log('✅ SSE连接已建立', {
            eventType: event.type,
          });
        });

        // 监听关闭事件
        es.addEventListener('close', (event) => {
          console.log('🔒 SSE连接已关闭', {
            eventType: event.type,
          });

          if (!hasError) {
            // 正常关闭，完成流式处理
            streamCallback('', '', true);
            // 清理引用
            this.currentEventSource = null;
            // 返回空字符串，因为内容已经通过回调处理
            resolve('');
          }
        });

        // 清理函数
        const cleanup = () => {
          es.close();
          es.removeAllEventListeners();
          this.currentEventSource = null;
        };

        // 确保在Promise解决或拒绝时清理资源
        Promise.race([
          new Promise((_) => {
            // 错误处理已在error事件中完成
          }),
        ]).finally(cleanup);

      } catch (error) {
        console.error('❌ 流式响应处理失败', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          endpoint: endpoint,
          timestamp: new Date().toISOString(),
        });
        // 确保清理引用
        this.currentEventSource = null;
        reject(error);
      }
    });
  }

  addToHistory(role: 'user' | 'assistant' | 'system', content: string) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-100);
    }
  }

  private getRecentHistory() {
    return this.conversationHistory
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
  }

  clearHistory() {
    console.log('🗑️ 清除对话历史');
    this.conversationHistory = [];
  }

  getHistory() {
    return [...this.conversationHistory];
  }

  // 检查是否可以生成AI建议
  canGenerateSuggestions(): boolean {
    // 这里需要检查AI配置是否已设置
    // 在实际实现中，应该检查配置是否存在且有效
    // 目前返回true，让调用者决定是否使用
    return true;
  }

  // 生成AI驱动的提示建议
  async generatePromptSuggestions(userInput: string, count: number = 3): Promise<string[]> {
    try {
      // 动态导入AIConfigService以避免循环依赖
      let aiConfigModule;
      try {
        aiConfigModule = await import('./AIConfigService');
      } catch (importError) {
        console.error('导入AIConfigService失败:', importError);
        return this.getFallbackSuggestions(userInput, count);
      }

      // 检查AI配置
      const isConfigured = await aiConfigModule.aiConfigService.isConfigured();

      if (!isConfigured) {
        console.log('AI未配置，无法生成建议');
        return this.getFallbackSuggestions(userInput, count);
      }

      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('生成建议超时')), 10000); // 10秒超时
      });

      // 获取配置
      const config = await aiConfigModule.aiConfigService.getConfig();
      if (!config) {
        return this.getFallbackSuggestions(userInput, count);
      }

      // 构建系统提示
      const systemPrompt = `你是一个个人记账助手的提示建议生成器。
      你的任务是根据用户的部分输入，生成${count}个相关的、简洁的完整提示建议。
      
      要求：
      1. 每个建议应该是一个完整的、可执行的句子
      2. 建议应该基于用户的输入进行扩展
      3. 建议应该与记账应用相关，包括：记录交易、查询数据、分析趋势、预算管理等
      4. 每个建议不超过20个字
      5. 用中文回复
      6. 返回纯文本，每行一个建议，不要编号
      
      用户输入：${userInput}
      
      请生成${count}个建议：`;

      // 构建消息
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `根据我的输入"${userInput}"，生成${count}个相关的记账提示建议。` },
      ];

      // 构建请求头
      const headers = this.buildHeadersForSuggestions(config);

      // 构建请求体
      const requestBody = this.buildRequestBodyForSuggestions(config, messages);

      // 获取端点
      let apiEndpoint;
      if (config.baseURL) {
        apiEndpoint = this.adjustEndpointForSuggestions(config.baseURL, config.provider);
      } else {
        apiEndpoint = this.getDefaultEndpointForSuggestions(config.provider);
      }

      // 发送请求
      const fetchPromise = fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();

      // 解析响应
      let suggestionsText = '';
      if (data.choices?.[0]?.message?.content) {
        suggestionsText = data.choices[0].message.content;
      } else if (data.content) {
        suggestionsText = data.content;
      } else if (data.result?.choices?.[0]?.message?.content) {
        suggestionsText = data.result.choices[0].message.content;
      } else if (data.message?.content) {
        suggestionsText = data.message.content;
      } else {
        throw new Error('无法解析API响应');
      }

      // 处理建议文本
      const suggestions = this.parseSuggestions(suggestionsText, count);
      return suggestions.length > 0 ? suggestions : this.getFallbackSuggestions(userInput, count);

    } catch (error) {
      console.error('生成AI建议失败:', error);
      return this.getFallbackSuggestions(userInput, count);
    }
  }

  // 为建议生成构建请求头
  private buildHeadersForSuggestions(config: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 根据提供商设置认证头
    if (config.provider === 'anthropic') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (config.provider === 'google') {
      // Google可能使用API密钥作为查询参数，但这里仍然设置Authorization头
      headers.Authorization = `Bearer ${config.apiKey}`;
    } else {
      // OpenAI兼容格式（包括DeepSeek、OpenAI、custom等）
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  // 为建议生成构建请求体
  private buildRequestBodyForSuggestions(config: any, messages: any[]): any {
    const requestBody: any = {
      model: config.model || this.getDefaultModelForSuggestions(config.provider),
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: 200, // 建议生成不需要太多tokens
      temperature: 1,
      stream: false,
    };

    // 对于特定供应商，可能需要调整参数
    if (config.provider === 'anthropic') {
      // Anthropic可能需要特定参数
      requestBody.max_tokens = 200;
    } else if (config.provider === 'google') {
      // Google可能需要特定参数
      requestBody.max_tokens = 200;
    }

    return requestBody;
  }

  // 获取建议生成的默认端点
  private getDefaultEndpointForSuggestions(provider: string): string {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      custom: 'https://api.openai.com/v1/chat/completions', // 为custom提供默认值
    };
    return endpoints[provider] || endpoints.openai;
  }

  // 获取建议生成的默认模型
  private getDefaultModelForSuggestions(provider: string): string {
    const models: Record<string, string> = {
      openai: 'gpt-3.5-turbo',
      anthropic: 'claude-3-haiku-20240307',
      deepseek: 'deepseek-chat',
      google: 'gemini-pro',
      custom: 'gpt-3.5-turbo',
    };
    return models[provider] || models.openai;
  }

  // 为建议生成调整端点
  private adjustEndpointForSuggestions(baseURL: string, provider: string): string {
    if (!baseURL || baseURL.trim() === '') {
      return this.getDefaultEndpointForSuggestions(provider);
    }

    // 清理URL：去除末尾的斜杠
    let cleanedURL = baseURL.trim();
    if (cleanedURL.endsWith('/')) {
      cleanedURL = cleanedURL.slice(0, -1);
    }

    // 检查是否需要添加路径
    if (cleanedURL.includes('/chat/completions') || cleanedURL.includes('/messages')) {
      return cleanedURL;
    }

    // 对于不同的提供商，添加不同的路径
    if (provider === 'anthropic') {
      // Anthropic使用/messages端点
      if (cleanedURL.endsWith('/v1')) {
        return `${cleanedURL}/messages`;
      }
      return `${cleanedURL}/v1/messages`;
    } else {
      // 其他提供商使用/chat/completions端点
      if (cleanedURL.endsWith('/v1')) {
        return `${cleanedURL}/chat/completions`;
      }
      return `${cleanedURL}/v1/chat/completions`;
    }
  }

  // 解析建议文本
  private parseSuggestions(text: string, expectedCount: number): string[] {
    if (!text) {return [];}

    // 按行分割，过滤空行
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // 移除编号（如1.、2.等）
    const cleanedLines = lines.map(line => {
      // 移除开头的数字和标点
      return line.replace(/^[\d一二三四五六七八九十]+[\.、)\]\s]*\s*/, '');
    });

    // 限制数量
    return cleanedLines.slice(0, expectedCount);
  }

  // 获取备用建议（当AI不可用时）
  private getFallbackSuggestions(userInput: string, count: number): string[] {
    const defaultSuggestions = [
      '记一笔餐饮支出50元',
      '查看本月消费统计',
      '分析餐饮类别的花费',
      '设置本月预算3000元',
      '查看最近的流水记录',
      '统计年度收入总额',
      '查找重复的流水记录',
      '查看可以平账的流水',
    ];

    // 如果用户输入包含关键词，尝试匹配相关建议
    const input = userInput.toLowerCase();
    const filteredSuggestions = defaultSuggestions.filter(suggestion => {
      if (input.includes('记') || input.includes('支出') || input.includes('收入')) {
        return suggestion.includes('记一笔');
      }
      if (input.includes('查看') || input.includes('统计')) {
        return suggestion.includes('查看') || suggestion.includes('统计');
      }
      if (input.includes('分析')) {
        return suggestion.includes('分析');
      }
      if (input.includes('预算')) {
        return suggestion.includes('预算');
      }
      if (input.includes('重复')) {
        return suggestion.includes('重复');
      }
      if (input.includes('平账')) {
        return suggestion.includes('平账');
      }
      return true;
    });

    // 返回指定数量的建议
    return filteredSuggestions.slice(0, count);
  }
}

export const aiService = new AIService();
