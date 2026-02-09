import {mcpBridge} from './MCPBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventSource from 'react-native-sse';
import {Message, TextMessage, ThinkingMessage, ToolCallMessage} from '../types';
import {AIRecursiveService} from './AIRecursiveService';
import {StreamMessageParser} from './StreamMessageParser.ts';
import 'react-native-url-polyfill/auto';
// AIConfigService will be imported dynamically in generatePromptSuggestions to avoid circular dependencies
// 导入用户输入分析管理器
import {userInputAnalysisManager} from './UserInputAnalysisManager';

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
    // 记录用户输入到历史记录
    try {
      // 使用UserInputAnalysisManager记录用户输入
      // 将 null 转换为 undefined 以匹配类型签名
      const bookIdForRecord = this.currentBookId || undefined;
      await userInputAnalysisManager.recordUserInput(userMessage, bookIdForRecord, 'user_input');
    } catch (error) {
      console.warn('记录用户输入历史失败:', error);
      // 不阻止主要流程继续执行
    }

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

  async buildSystemPrompt(context: any): Promise<string> {
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

    return `你是一个专业的记账助手，严格遵循用户指示，用户未明确要求时不进行任何额外分析、总结或主动建议。你的核心职责是准确调用工具完成任务。

## 重要上下文信息
${contextInfo}

## 核心行为准则
1.  **绝对遵从指令**：仅执行用户明确要求的操作。不主动提供分析、总结、建议或无关信息。
2.  **最小化输出**：除工具调用JSON或用户明确要求的确认信息外，不输出任何额外内容。
3.  **精准调用工具**：严格依据工具说明和以下实践进行调用，不进行未请求的“智能”推断。
4.  **流水归属人**：添加流水时用户未指定归属人则根据上下文设置当前用户为归属人,上下文无当前用户则为空。

## 工具调用参数处理
1.  **账本ID**：自动使用当前账本ID，无需在参数中指定bookId。
2.  **日期处理**：
    *   用户未指定日期时，默认使用当天日期（YYYY-MM-DD）。
    *   日期参数名使用date（YYYY-MM-DD格式）。
    *   月份参数名使用month（YYYY-MM格式）。
3.  **金额处理**：金额单位为人民币元，是数字类型。
4.  **参数映射与补全**：
    *   将用户输入中的别名映射到正确的工具参数名。
    *   **仅在为完成工具调用所绝对必需时，才进行参数推断**（例如，用户说“记一笔午餐”，必须推断flowType为“支出”）。禁止为“提供更好体验”而进行额外推断。

## 工具调用逻辑（仅响应明确指令）
*   **用户指令清晰时**：直接调用对应工具。若缺少必要参数且无法从当前对话中可靠推断，则仅就缺失参数进行简短询问。
*   **用户指令模糊但可映射时**：如用户说“记一笔午餐50元”，直接映射为创建支出流水。**完成后仅返回操作结果确认，不作分析。**
*   **“获取选项”类调用**：仅当创建或更新记录**且用户未提供具体选项值**时，才自动调用get_pay_types、get_belonger等工具获取列表以供使用。此步骤不向用户输出。
*   **禁止主动链式调用**：例如，在记录流水后，**不得**主动调用get_analytics进行分析或refresh_budget_usage刷新预算。仅在用户明确要求“分析一下”或“刷新预算”时才执行。

## 回复格式
1.  工具调用成功执行后，若系统有返回结果信息（如“记录成功”），可向用户转达该信息。**不添加**“已为您记账”、“下次可以试试XX功能”等额外话语。
2.  工具调用失败时，直接、简短地解释失败原因（如“参数XX格式错误”）或询问必要信息。
3.  用户未要求时，不进行问候、总结、展望。
`;
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

  private buildRequestBody(config: any, messages: any[], stream: boolean = true, tools?: any[]): any {
    const requestBody: Record<string, any> = {
      model: config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      stream: stream, // 使用传入的stream参数，但默认值为true
    };

    // 只有在thinkingEnabled为true且config.thinking有值时，才添加thinking参数
    if (config.thinkingEnabled === true && config.thinking) {
      requestBody.thinking = {
        type: config.thinking,
      };
    }

    // 如果提供了tools参数且不为空，添加到requestBody中
    if (tools && Array.isArray(tools) && tools.length > 0) {
      // 按照OpenAI的function calling格式组织tools
      requestBody.tools = tools.map(tool => {
        return {
          type: 'function',
          function: {
            name: tool.function.name,
            description: tool.function.description || '',
            parameters: tool.function.parameters || {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        };
      });

      // 添加tool_choice参数
      requestBody.tool_choice = 'auto';
    }
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
    const finalURL = `${cleanedURL}/chat/completions`;
    console.log('🔧 端点添加/chat/completions', {
      original: baseURL,
      adjusted: finalURL,
    });
    return finalURL;
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
      console.log('🧹 所有相关状态已清理完成');
    }
  }

  // 注意：所有API调用现在只支持流式模式，非流式调用已被移除
  // streamCallback 现在接收四个参数：content, reasoning_content, tool_calls, isComplete
  async callAIAPI(config: any, systemPrompt: string, userMessage: string, streamCallback: (content: string, reasoning_content: string, tool_calls: any[] | null, isComplete: boolean) => void): Promise<void> {
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
    ];
    console.log('messages',messages);
    // 获取端点和模型
    const defaultEndpoint = this.getDefaultEndpoint(config.provider);

    // 使用调整后的端点
    let apiEndpoint;
    if (config.baseURL) {
      apiEndpoint = this.adjustEndpoint(config.baseURL, config.provider);
    } else {
      apiEndpoint = defaultEndpoint;
    }

    const model = config.model;

    console.log('🚀 准备AI API调用（仅流式）', {
      provider: config.provider,
      endpoint: apiEndpoint,
      model: model,
      messageCount: messages.length,
      hasCustomEndpoint: !!config.baseURL,
    });

    // 构建请求头和请求体
    const headers = this.buildHeaders(config);
    // 动态导入AIConfigService以避免循环依赖
    let tools = mcpBridge.getTools();
    let aiConfigModule;
    try {
      aiConfigModule = await import('./AIConfigService');
      // 获取可用工具
      const availableTools = await aiConfigModule.aiConfigService.getAvailableTools();

      tools = availableTools.length === 0
        ? []
        : tools.filter(tool => availableTools.includes(tool.name));

    } catch (importError) {
      console.error('导入AIConfigService失败:', importError);
      // 如果无法导入，使用所有工具
    }

    // 转换为OpenAI格式
    const openAITools = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    }));

    const requestBody = this.buildRequestBody(config, messages, true, openAITools); // 总是使用流式，并传入tools

    console.log('📦 请求体信息', {
      provider: config.provider,
      requestBody: requestBody,
    });

    // 只使用流式调用
    await this.processStreamResponse(apiEndpoint, headers, requestBody, streamCallback);
  }

  private async processStreamResponse(
    endpoint: string,
    headers: Record<string, string>,
    body: any,
    streamCallback: (content: string, reasoning_content: string, tool_calls: any[] | null, isComplete: boolean) => void
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
        let allDelta = '';

        // 监听消息事件
        es.addEventListener('message', (event) => {
          try {
            if (event.type === 'message') {
              const data = event.data;

              console.log('📝 收到SSE数据', data);
              // 跳过结束标记
              if (data === '[DONE]') {
                console.log('🏁 收到SSE结束标记',allDelta);
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
              let toolCallsDelta: any[] | null = null;

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

              // 4. 提取 tool_calls 数据（OpenAI function calling 格式）
              if (parsedData.choices?.[0]?.delta?.tool_calls !== undefined) {
                toolCallsDelta = parsedData.choices[0].delta.tool_calls || null;
                console.log('🔧 检测到 tool_calls 数据:', toolCallsDelta);
              }

              // 发送到流式回调
              if (delta || thinkingDelta || toolCallsDelta) {
                allDelta += delta;
                allDelta += thinkingDelta;
                streamCallback(delta, thinkingDelta, toolCallsDelta, false);
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
            if ('message' in event) {
              reject(new Error(`SSE连接错误: ${event.message ? event.message : ''}`));
            }
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
            streamCallback('', '', null, true);
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

  initHistory(messages: Message[]) {
    this.conversationHistory = [];
    messages.forEach(topMsg => {
      if (topMsg.type === 'ai') {
        let content = '';
        let tool_content = '';
        topMsg.messageList.forEach(message => {
          switch (message.type) {
            case 'text':
              const textMessage = message as TextMessage;
              content += `${textMessage.content}\n`;
              break;
            case 'thinking':
              const thinkingMessage = message as ThinkingMessage;
              content += `${thinkingMessage.thinkingContent}\n`;
              break;
            case 'tool_call':
              const toolCallMessage = message as ToolCallMessage;
              tool_content += `工具调用结果: ${toolCallMessage.toolName}\n 参数: ${JSON.stringify(toolCallMessage.arguments)}\n 返回值: ${JSON.stringify(toolCallMessage.resultMessage ? toolCallMessage.resultMessage.success ?  toolCallMessage.resultMessage.result : toolCallMessage.resultMessage.errorMessage : undefined)}\n`;
              break;
          }
        });
        this.conversationHistory.push({
          role: 'assistant',
          content: content,
          timestamp: topMsg.timestamp,
        });
        if (tool_content && tool_content.length > 0) {
          this.conversationHistory.push({
            role: 'system',
            content: tool_content,
            timestamp: topMsg.timestamp,
          });
        }
      } else {
        let textMessage = topMsg as TextMessage;

        this.conversationHistory.push({
          role: textMessage.isUser ? 'user' : 'system',
          content: textMessage.content,
          timestamp: textMessage.timestamp,
        });
      }
    });

    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-100);
    }
    console.log('从历史记录初始化历史消息：', this.conversationHistory.length);
  }

  private getRecentHistory() {
    return this.conversationHistory
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
  }

  clearHistory() {
    console.log('🗑️ 清除对话历史');
    this.conversationHistory = [];
  }

  // 获取高频输入分析结果，用于AI建议生成
  async getFrequentInputsForSuggestions(): Promise<Array<string>> {
    try {
      // 使用UserInputAnalysisManager获取高频输入数据
      const frequentInputs = await userInputAnalysisManager.getAISuggestions(10);
      if (!frequentInputs) {
        return [];
      }
      // 将结果转换为所需的格式
      return frequentInputs.filter(item => item.suggestion && item.suggestion.trim().length > 0).map(item => item.suggestion);
    } catch (error) {
      console.warn('获取高频输入分析失败:', error);
      return [];
    }
  }

  /**
   * 调用AI API进行文本生成
   * @param prompt 提示文本
   * @param config AI配置对象
   * @param userMessages
   * @param timeout 超时时间（毫秒），默认30秒
   * @returns Promise<string> AI生成的文本响应
   */
  public async callAIForTextGeneration(
    prompt: string,
    config: any,
    userMessages: any[],
    timeout: number = 30000,
  ): Promise<string> {
    try {
      // 构建消息
      const messages = [
        { role: 'system' as const, content: prompt },
        ...userMessages.map((item) => {return { role: 'user' as const, content: item };},),
      ];

      // 构建请求头
      const headers = this.buildHeaders(config);

      // 构建请求体
      const requestBody = this.buildRequestBody(config, messages, false, []);

      // 获取端点
      let apiEndpoint = this.adjustEndpoint(config.baseURL, config.provider);

      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`AI API调用超时 (${timeout}ms)`)), timeout);
      });

      // 发送请求
      const fetchPromise = fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        console.log('AI API请求失败: ',apiEndpoint, requestBody, response);
        throw new Error(`AI API请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // 解析响应
      let generatedText = '';
      if (data.choices?.[0]?.message?.content) {
        generatedText = data.choices[0].message.content;
      } else if (data.content) {
        generatedText = data.content;
      } else if (data.result?.choices?.[0]?.message?.content) {
        generatedText = data.result.choices[0].message.content;
      } else if (data.message?.content) {
        generatedText = data.message.content;
      } else if (data.text) {
        generatedText = data.text;
      } else {
        throw new Error('无法解析AI API响应，响应格式未知');
      }

      return generatedText;
    } catch (error) {
      console.error('调用AI进行文本生成失败:', error);
      throw error; // 重新抛出错误，让调用者处理
    }
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

      // 检查AI建议是否启用
      const suggestionsEnabled = await aiConfigModule.aiConfigService.isAiSuggestionEnabled();
      if (!suggestionsEnabled) {
        console.log('AI建议功能已禁用');
        return [];
      }

      // 检查AI配置
      const isConfigured = await aiConfigModule.aiConfigService.isConfigured();

      if (!isConfigured) {
        console.log('AI未配置，无法生成建议');
        return this.getFallbackSuggestions(userInput, count);
      }

      // 获取高频输入作为上下文
      let frequentInputsContext = '';
      try {
        const frequentInputs = await this.getFrequentInputsForSuggestions();
        if (frequentInputs.length > 0) {
          frequentInputsContext = `\n用户历史高频输入（按频率排序高倒低排序）：\n${frequentInputs.map(item => `- "${item}"`).join('\n')}`;
        }
      } catch (error) {
        console.warn('获取高频输入上下文失败，继续生成建议:', error);
      }

      // 获取建议模型配置
      const suggestionConfig = await aiConfigModule.aiConfigService.getSuggestionModelConfig();
      // 如果建议模型配置未设置，使用活动配置
      const config = suggestionConfig || await aiConfigModule.aiConfigService.getChatModelConfig();
      if (!config) {
        console.log('建议模型配置未设置，使用活动配置');
        return this.getFallbackSuggestions(userInput, count);
      }

      // 构建系统提示
      const systemPrompt = `你是一个记账APP Cashbook AI助手的提示建议生成器。你的唯一任务是根据用户当前输入和历史输入，生成${count}个具体、可操作的完整提示建议。

## 核心功能清单（用于参考生成建议）
- **流水记录管理**：创建、更新、批量更新、查询流水记录
- **固定支出管理**：创建、更新、查询固定支出
- **统计分析**：按类型、日期、金额、支付方式、归属人、行业类型等筛选分析
- **预算管理**：按月查询预算、更新预算、刷新预算使用情况（仅月度总预算）
- **数据查询**：获取支付方式列表、归属人列表、行业类型列表
- **高级功能**：查找重复流水并去重，查找可平账流水并处理

## 生成规则
1. **直接相关优先**：第一个建议必须是与用户当前输入最直接相关的完整命令，即对用户部分输入的自然扩展和补全。
2. **后续操作覆盖**：其余建议应基于用户可能执行的后续操作生成，覆盖其他核心功能，确保多样性。
3. **具体可执行**：每个建议必须是一个完整的、用户可直接复制使用的命令，包含所有必要参数（如金额、日期、类型等），使用合理示例值。
4. **功能明确对应**：每个建议必须明确对应一个核心功能操作，避免模糊建议。
5. **个性化参考**：如果提供了用户历史高频输入，优先参考这些模式生成更个性化的建议。
6. **输出格式严格**：
   - 只输出纯文本。
   - 每行一个建议，不编号、不加标题、不添加任何额外说明。
   - 用中文回复。

## 示例
**用户输入**："记一笔"
**建议**：
记一笔午餐支出50元，使用微信支付，分类为餐饮美食
查看本月餐饮类别的消费统计
设置本月餐饮预算800元

**用户输入**："查看统计"
**建议**：
查看2024年12月的月度收支统计
分析本月各支付方式的消费占比
统计今年餐饮类别的总支出

**用户输入**："预算"
**建议**：
查询本月预算及使用情况
设置本月总预算为5000元
刷新本月预算使用数据

## 当前输入与上下文
用户输入：${userInput}
${frequentInputsContext}

## 生成要求
请严格遵循上述规则，生成${count}个提示建议`;

      // 构建完整的提示消息
      console.log('构建完整的提示消息',systemPrompt);
      // 使用新的callAIForTextGeneration方法调用AI
      const aiResponseText = await this.callAIForTextGeneration(systemPrompt, config, ['严格遵循提示词'], 60000);

      // 处理建议文本
      const suggestions = this.parseSuggestions(aiResponseText, count);
      return suggestions.length > 0 ? suggestions : this.getFallbackSuggestions(userInput, count);

    } catch (error) {
      console.error('生成AI建议失败:', error);
      return this.getFallbackSuggestions(userInput, count);
    }
  }

  // 为建议生成构建请求头
  private buildHeaders(config: any): Record<string, string> {
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
    // 全面覆盖所有主要功能模块的默认建议
    const defaultSuggestions = [
      // 流水记录相关（包含具体参数）
      '记一笔午餐支出68元，使用支付宝支付，分类为餐饮美食，日期2024-12-26',
      '记一笔工资收入8500元，使用银行转账，分类为工资收入，归属人自己',
      '记一笔交通出行支出25元，使用微信支付，分类为交通出行，描述"地铁通勤"',
      '记一笔购物支出299元，使用信用卡支付，分类为购物消费，日期今天',

      // 查询与查看相关
      '查看本月所有流水记录，按时间倒序排列',
      '查看2024年12月的餐饮类别消费统计',
      '查看最近30天的支出总额和收入总额',
      '查看使用微信支付的最近10笔交易',

      // 统计分析相关
      '分析本月各行业类型的消费占比',
      '统计本季度收入与支出的对比情况',
      '分析今年每月消费趋势变化',
      '查看支付方式使用频率统计',

      // 预算管理相关
      '设置本月总预算5000元',
      '设置餐饮类别月度预算1500元',
      '查看本月预算使用进度和剩余额度',
      '调整12月交通出行预算为800元',

      // 固定支出管理
      '添加每月房租固定支出2800元，支付方式银行转账',
      '查看所有固定支出项目及下次扣款日期',
      '更新手机话费固定支出为每月158元',

      // 高级功能
      '查找金额相同的重复流水记录',
      '查找可以互相抵消平账的流水记录',
      '批量更新上个月餐饮分类为"日常饮食"',
      '导出本月所有流水记录为Excel格式',

      // 数据筛选与选项
      '查看所有可用的支付方式列表',
      '查看所有归属人选项',
      '查看所有行业分类选项',
      '按日期范围筛选流水：2024-12-01到2024-12-31',

      // 综合操作
      '先查看本月消费统计，然后设置下月预算',
      '查找大额支出（金额大于1000元）的记录',
      '对比本月与上月的消费差异',
      '预测本月剩余时间的消费趋势',
    ];

    // 改进关键词匹配逻辑
    const input = userInput.toLowerCase().trim();

    // 如果输入为空或很短，返回通用建议
    if (input.length <= 1) {
      return defaultSuggestions.slice(0, count);
    }

    // 定义关键词到建议类别的映射
    const keywordCategories = [
      {
        keywords: ['记', '记录', '添加', '新建', '创建', '支出', '收入', '消费', '花钱'],
        filter: (suggestion: string) => suggestion.includes('记一笔'),
      },
      {
        keywords: ['查看', '查询', '搜索', '找', '显示', '列表'],
        filter: (suggestion: string) => suggestion.includes('查看') || suggestion.includes('所有'),
      },
      {
        keywords: ['统计', '分析', '趋势', '占比', '比例', '图表'],
        filter: (suggestion: string) => suggestion.includes('分析') || suggestion.includes('统计') ||
                                        suggestion.includes('占比') || suggestion.includes('趋势'),
      },
      {
        keywords: ['预算', '额度', '限额', '计划'],
        filter: (suggestion: string) => suggestion.includes('预算'),
      },
      {
        keywords: ['固定', '定期', '每月', '周期'],
        filter: (suggestion: string) => suggestion.includes('固定支出'),
      },
      {
        keywords: ['重复', '相同', '类似'],
        filter: (suggestion: string) => suggestion.includes('重复'),
      },
      {
        keywords: ['平账', '抵消', '对冲'],
        filter: (suggestion: string) => suggestion.includes('平账'),
      },
      {
        keywords: ['餐饮', '吃饭', '午餐', '晚餐', '美食'],
        filter: (suggestion: string) => suggestion.includes('餐饮') || suggestion.includes('午餐') ||
                                        suggestion.includes('晚餐') || suggestion.includes('美食'),
      },
      {
        keywords: ['交通', '出行', '地铁', '公交', '打车'],
        filter: (suggestion: string) => suggestion.includes('交通') || suggestion.includes('出行') ||
                                        suggestion.includes('地铁') || suggestion.includes('公交'),
      },
      {
        keywords: ['工资', '收入', '薪水', '报酬'],
        filter: (suggestion: string) => suggestion.includes('工资') || suggestion.includes('收入'),
      },
    ];

    // 计算每个建议的匹配分数
    const scoredSuggestions = defaultSuggestions.map(suggestion => {
      let score = 0;

      // 检查是否匹配任何关键词类别
      for (const category of keywordCategories) {
        const hasKeyword = category.keywords.some(keyword => input.includes(keyword));
        if (hasKeyword && category.filter(suggestion)) {
          score += 10; // 主要匹配加分
        }
      }

      // 额外加分：建议中包含输入中的词汇
      const words = input.split(/[\s,，、]+/).filter(word => word.length > 1);
      for (const word of words) {
        if (suggestion.includes(word)) {
          score += 5;
        }
      }

      return { suggestion, score };
    });

    // 按分数排序，分数相同的保持原顺序
    scoredSuggestions.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // 分数相同时保持原数组顺序
      return defaultSuggestions.indexOf(a.suggestion) - defaultSuggestions.indexOf(b.suggestion);
    });

    // 获取分数最高的建议，但确保多样性
    const topSuggestions: string[] = [];
    const seenCategories = new Set<string>();

    for (const item of scoredSuggestions) {
      if (topSuggestions.length >= count) {break;}

      // 确定建议的主要类别
      let category = '其他';
      for (const cat of keywordCategories) {
        if (cat.filter(item.suggestion)) {
          category = cat.keywords[0];
          break;
        }
      }

      // 如果该类别还没有被选择，或者分数很高，则添加
      if (!seenCategories.has(category) || item.score > 5) {
        topSuggestions.push(item.suggestion);
        seenCategories.add(category);
      }
    }

    // 如果还不够，添加分数最高的其他建议
    if (topSuggestions.length < count) {
      for (const item of scoredSuggestions) {
        if (topSuggestions.length >= count) {break;}
        if (!topSuggestions.includes(item.suggestion)) {
          topSuggestions.push(item.suggestion);
        }
      }
    }

    return topSuggestions.slice(0, count);
  }
}

export const aiService = new AIService();
