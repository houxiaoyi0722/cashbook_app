import { aiConfigService } from './AIConfigService';
import { mcpBridge } from './MCPBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AIResponse {
  text: string;
  thinking?: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
  error?: string;
  streamCallback?: (content: string, isComplete: boolean) => void;
}

class AIService {
  private conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }> = [];

  private currentBookId: string | null = null;
  private currentBookName: string | null = null;

  // 更新当前账本信息
  updateBookInfo(bookId: string | null, bookName?: string | null) {
    this.currentBookId = bookId;
    this.currentBookName = bookName || null;
    console.log(`AIService: 当前账本已更新为 ${bookId} (${bookName})`);
  }

  async sendMessage(userMessage: string, streamCallback?: (content: string, isComplete: boolean) => void): Promise<AIResponse> {
    const config = await aiConfigService.getConfig();
    if (!config?.apiKey) {
      throw new Error('AI配置未完成，请先配置API Key');
    }

    this.addToHistory('user', userMessage);

    try {
      // 获取上下文信息
      const appContext = await this.getContext();
      const systemPrompt = this.buildSystemPrompt(appContext);

      console.log('🤖 AI交互开始', {
        userMessageLength: userMessage.length,
        hasContext: !!appContext,
        contextInfo: appContext,
        currentBookId: this.currentBookId,
        currentBookName: this.currentBookName,
        streamMode: !!streamCallback,
      });

      // 初始化迭代变量
      let currentIteration = 0;
      const maxIterations = 100;
      let currentUserMessage = userMessage;
      let accumulatedResponse = '';
      let lastAIResponse: AIResponse | null = null;

      // 用于累积所有迭代的流式内容
      let allStreamedContent = '';
      // 用于跟踪当前迭代的流式内容
      let currentIterationStreamedContent = '';

      // 主迭代循环
      while (currentIteration < maxIterations) {
        currentIteration++;
        console.log(`🔄 开始第 ${currentIteration} 次迭代`, {
          remainingIterations: maxIterations - currentIteration,
          currentUserMessageLength: currentUserMessage.length,
          hasAccumulatedResponse: accumulatedResponse.length > 0,
        });

        // 重置当前迭代的流式内容
        currentIterationStreamedContent = '';

        // 内部流式回调函数
        const internalStreamCallback = (content: string, isComplete: boolean) => {
          if (content) {
            // 累积到当前迭代的内容
            currentIterationStreamedContent += content;
            // 累积到总内容
            allStreamedContent += content;
          }

          // 如果有外部回调，传递内容
          if (streamCallback) {
            // 对于流式响应，传递当前内容
            const contentToSend = content || '';

            // 判断是否是最终完成（最后一次迭代且工具调用完成）
            const isFinalComplete = isComplete && currentIteration >= maxIterations;

            // 发送内容
            streamCallback(contentToSend, isFinalComplete);

            // 如果是完成状态，并且不是最终完成，添加工具调用提示
            if (isComplete && !isFinalComplete && contentToSend === '') {
              // 工具调用即将开始，添加提示
              const toolCallMsg = '\n\n🔄 正在执行工具调用...\n';
              // 添加到累积内容中
              allStreamedContent += toolCallMsg;
              currentIterationStreamedContent += toolCallMsg;
              streamCallback(toolCallMsg, false);
            }
          }
        };

        // 调用AI API
        const aiResult = await this.callAIAPI(config, systemPrompt, currentUserMessage, internalStreamCallback);

        // 更新迭代流式内容到aiResult
        if (streamCallback && currentIterationStreamedContent) {
          // 保留思考块信息，只更新文本内容
          aiResult.text = currentIterationStreamedContent;
          // 注意：思考块信息已经在aiResult.thinking中
        }

        // 保存最后一次AI响应
        lastAIResponse = aiResult;

        // 检查是否有工具调用
        if (aiResult.toolCalls && aiResult.toolCalls.length > 0) {
          console.log(`🔧 第 ${currentIteration} 次迭代检测到工具调用`, {
            toolCount: aiResult.toolCalls.length,
            toolNames: aiResult.toolCalls.map(t => t.name),
            currentBookId: this.currentBookId,
          });

          // 检查是否有当前账本信息
          if (!this.currentBookId) {
            console.warn('⚠️ 没有当前账本信息，工具调用可能失败');
          }

          // 执行工具调用，并添加进度反馈
          const toolResults = await this.executeToolCallsWithProgress(
            aiResult.toolCalls,
            streamCallback ?
              (progressMsg: string) => {
                streamCallback(progressMsg, false);
                allStreamedContent += progressMsg;
                currentIterationStreamedContent += progressMsg;
              }
              : undefined
          );

          // 记录工具执行结果
          console.log(`📊 第 ${currentIteration} 次迭代工具执行结果`, {
            successCount: toolResults.filter(r => r.success).length,
            totalCount: toolResults.length,
            toolResults: toolResults.map(r => ({ name: r.name, success: r.success })),
          });

          // 工具调用完成后，通过streamCallback发送完成提示
          const successCount = toolResults.filter(r => r.success).length;
          const toolCompleteMsg = `\n✅ 工具调用完成 (${successCount}/${toolResults.length} 成功)\n`;
          // 添加到 allStreamedContent
          allStreamedContent += toolCompleteMsg;
          currentIterationStreamedContent += toolCompleteMsg;
          if (streamCallback) {
            streamCallback(toolCompleteMsg, false);
          }

          // 检查是否所有工具都执行成功
          const allToolsSuccessful = toolResults.every(r => r.success);

          if (allToolsSuccessful && currentIteration < maxIterations) {
            // 构建工具执行结果消息，用于下一次迭代
            const toolResultsMessage = this.buildToolResultsMessage(toolResults);

            // 更新当前用户消息为工具执行结果，以便下一次迭代
            currentUserMessage = toolResultsMessage;

            // 将工具执行结果添加到历史记录中
            this.addToHistory('user', toolResultsMessage);

            // 继续下一次迭代
            console.log(`⏭️ 准备第 ${currentIteration + 1} 次迭代`, {
              toolResultsMessageLength: toolResultsMessage.length,
            });
            continue;
          } else {
            // 如果有工具执行失败，或者达到最大迭代次数，生成最终响应
            const finalResponse = await this.generateFinalResponse(
              userMessage,
              aiResult,
              toolResults,
              config,
              allStreamedContent // 传递所有流式内容
            );

            // 更新累积响应
            accumulatedResponse = finalResponse;

            // 确保allStreamedContent包含最终响应
            if (!allStreamedContent.includes(finalResponse)) {
              allStreamedContent += finalResponse;
            }

            // 确保当前迭代内容也包含最终响应
            if (!currentIterationStreamedContent.includes(finalResponse)) {
              currentIterationStreamedContent = finalResponse;
            }

            this.addToHistory('assistant', finalResponse);

            console.log(`✅ AI交互完成 - 工具调用模式（第 ${currentIteration} 次迭代）`, {
              finalResponseLength: finalResponse.length,
              toolResults: toolResults.map(r => ({ name: r.name, success: r.success })),
              usedBookId: this.currentBookId,
              iteration: currentIteration,
              reason: allToolsSuccessful ? '达到最大迭代次数' : '有工具执行失败',
            });

            // 发送最终的流式完成回调
            if (streamCallback) {
              // 确保所有内容都已发送
              streamCallback('', true);
            }

            return {
              text: finalResponse,
              thinking: aiResult.thinking
            };
          }
        } else {
          // 没有工具调用，迭代结束
          console.log(`✅ AI交互完成 - 直接回复模式（第 ${currentIteration} 次迭代）`, {
            responseLength: aiResult.text.length,
            currentBookId: this.currentBookId,
            streamMode: !!streamCallback,
            iteration: currentIteration,
            accumulatedResponseLength: accumulatedResponse.length,
            allStreamedContentLength: allStreamedContent.length,
            currentIterationStreamedContentLength: currentIterationStreamedContent.length,
          });

          // 确保 currentIterationStreamedContent 包含 aiResult.text
          // 如果流式回调已经处理了内容，currentIterationStreamedContent 应该已经包含了
          // 但为了安全，如果 aiResult.text 不在其中，则添加
          if (aiResult.text && !currentIterationStreamedContent.includes(aiResult.text)) {
            currentIterationStreamedContent += aiResult.text;
          }

          // 确保 allStreamedContent 包含 currentIterationStreamedContent
          // 检查是否已经包含，避免重复添加
          if (currentIterationStreamedContent) {
            // 检查 allStreamedContent 是否以 currentIterationStreamedContent 结尾
            if (!allStreamedContent.endsWith(currentIterationStreamedContent)) {
              // 检查是否已经包含
              if (!allStreamedContent.includes(currentIterationStreamedContent)) {
                allStreamedContent += currentIterationStreamedContent;
              }
            }
          }

          // 更新累积响应：将当前迭代的内容追加到累积响应中
          if (aiResult.text) {
            // 如果 accumulatedResponse 已经有内容，添加分隔符
            if (accumulatedResponse) {
              accumulatedResponse += '\n\n' + aiResult.text;
            } else {
              accumulatedResponse = aiResult.text;
            }
          }

          // 使用累积响应作为最终响应
          const finalResponse = accumulatedResponse || aiResult.text;

          this.addToHistory('assistant', finalResponse);

          // 发送最终的流式完成回调
          if (streamCallback) {
            // 确保所有内容都已发送
            streamCallback('', true);
          }

          return {
            text: finalResponse,
            thinking: aiResult.thinking,
            toolCalls: aiResult.toolCalls
          };
        }
      }

      // 达到最大迭代次数
      console.warn(`⚠️ 达到最大迭代次数（${maxIterations}）`, {
        lastAIResponse: lastAIResponse,
        accumulatedResponseLength: accumulatedResponse.length,
      });

      // 生成超时响应
      const timeoutResponse = `已达到最大处理次数（${maxIterations}）。\n\n${accumulatedResponse || '处理可能未完成。'}`;

      this.addToHistory('assistant', timeoutResponse);

      // 发送最终的流式完成回调
      if (streamCallback) {
        streamCallback('', true);
      }

      return {
        text: timeoutResponse,
        thinking: lastAIResponse?.thinking
      };

    } catch (error) {
      console.error('❌ AI调用失败:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userMessage: userMessage.substring(0, 100),
        currentBookId: this.currentBookId,
        streamMode: !!streamCallback,
      });

      // 如果错误与账本相关，提供更明确的错误信息
      let errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('未选择账本') || errorMessage.includes('bookId')) {
        errorMessage = `AI处理失败：${errorMessage}\n\n请确保已选择账本后再使用AI功能。`;
      }

      // 发送错误完成回调
      if (streamCallback) {
        streamCallback('', true);
      }

      return {
        text: `抱歉，AI处理失败：${errorMessage}\n\n请检查网络连接或稍后重试。`,
        error: errorMessage,
      };
    }
  }

  private async getContext(): Promise<any> {
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

  private buildSystemPrompt(context: any): string {
    const tools = mcpBridge.getTools();

    // 为每个工具创建详细的参数说明表格
    const toolsDetailedDescription = tools.map(tool => {
      let toolInfo = `## ${tool.name}\n`;
      toolInfo += `**描述**: ${tool.description}\n\n`;

      // 添加参数说明
      if (tool.inputSchema && tool.inputSchema.properties) {
        toolInfo += '**参数说明**:\n';
        const props = tool.inputSchema.properties;
        const required = tool.inputSchema.required || [];

        // 创建参数表格
        toolInfo += '| 参数名 | 类型 | 必需 | 格式/枚举 | 示例值 | 描述 |\n';
        toolInfo += '|--------|------|------|-----------|--------|------|\n';

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
          toolInfo += `\n**必需参数**: ${required.join(', ')}\n`;
        }
      }

      // 添加工具特定说明
      switch (tool.name) {
        case 'get_flows':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 日期格式必须为YYYY-MM-DD\n';
          toolInfo += '2. 如果不提供startDate，默认为当前月份第一天\n';
          toolInfo += '3. 如果不提供endDate，默认为当前日期\n';
          toolInfo += '4. pageSize最大值为100\n';
          break;
        case 'create_flow':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. money可以是正数（收入）或负数（支出）\n';
          toolInfo += '2. 如果不提供date，使用当前日期\n';
          toolInfo += '3. industryType、payType、attribution都有默认值\n';
          toolInfo += '4. 金额单位是人民币（元）\n';
          break;
        case 'get_monthly_summary':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. month格式必须为YYYY-MM\n';
          toolInfo += '2. 如果不提供month，使用当前月份\n';
          break;
        case 'classify_flow':
          toolInfo += '\n**注意事项**:\n';
          toolInfo += '1. 根据流水名称中的关键词推荐行业分类\n';
          toolInfo += '2. 金额会影响分类结果（大额可能被分类为投资）\n';
          toolInfo += '3. 返回的confidence表示分类置信度\n';
          break;
      }

      toolInfo += '\n---\n';
      return toolInfo;
    }).join('\n');

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

    return `你是一个专业的记账助手，操作修改数据前给用户进行简要说明，
    可以调用以下工具来帮助用户管理财务：

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
3. **金额处理**: 
   - 金额单位是人民币（元）
   - 金额，不能小于0。
4. **参数映射**: 当用户使用别名时，需要映射到正确的参数名：
   - amount → money
   - category → industryType
   - type → flowType
   - desc/description → description
   - time/date → date
   - note → description
5. **参数补全**: 当用户输入中缺少必要参数时，需要根据上下文进行推断

## 参数推断指导
### 针对create_flow工具：
**必需参数推断规则**:
1. **name推断**:
   - 从用户描述中提取关键信息，如"交通支出30元" → name="交通支出"
   - 如果用户提到具体类别，name可以是"类别+类型"，如"餐饮消费"
   - 默认值："日常记账" + 当前日期

2. **flowType推断**:
   - 关键词"收入"、"赚钱"、"收到" → "收入"
   - 关键词"支出"、"花费"、"支付" → "支出"
   - 关键词"转账"、"还款"、"不计收支" → "不计收支"

3. **industryType推断**:
   - 从输入中提取常见类别：餐饮、交通、购物、娱乐、医疗、教育、投资等
   - 默认值："其他"

4. **date推断**:
   - "今天"、"现在" → 当前日期
   - "昨天" → 前一天日期
   - "上周" → 7天前日期
   - "上月" → 上个月日期
   - 默认：当前日期

### 针对get_flows工具：
**日期范围推断**:
- "查看本月流水" → startDate=当月第一天，endDate=当前日期
- "查看上周流水" → startDate=7天前，endDate=当前日期
- "查看2024年流水" → startDate="2024-01-01"，endDate="2024-12-31"

## 常见错误避免
1. **参数格式错误**:
   - 日期必须为YYYY-MM-DD格式
   - 月份必须为YYYY-MM格式
   - 金额必须是数字类型

2. **必需参数缺失**:
   - create_flow必须提供name、money、flowType
   - get_analytics必须提供type参数

3. **枚举值错误**:
   - flowType只能是"收入"、"支出"、"不计收支"
   - get_analytics的type只能是"attribution"、"payType"、"industryType"、"daily"

## 工具调用示例
### 示例1：创建流水记录
用户输入："记一笔午餐消费50元"
\`\`\`json
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
\`\`\`

### 示例2：查询本月流水
用户输入："查看本月支出"
\`\`\`json
{
  "toolCalls": [
    {
      "name": "get_flows",
      "arguments": {
        "startDate": "2024-12-01",
        "endDate": "2024-12-09",
        "flowType": "支出",
        "pageNum": 1,
        "pageSize": 20
      }
    }
  ]
}
\`\`\`

### 示例3：获取月度统计
用户输入："查看12月统计"
\`\`\`json
{
  "toolCalls": [
    {
      "name": "get_monthly_summary",
      "arguments": {
        "month": "2024-12"
      }
    }
  ]
}
\`\`\`

### 示例4：更新流水记录
用户输入："把ID为123的流水名称改为'晚餐消费'"
\`\`\`json
{
  "toolCalls": [
    {
      "name": "update_flow",
      "arguments": {
        "id": 123,
        "name": "晚餐消费"
      }
    }
  ]
}
\`\`\`

## 回复要求
1. 尽量用简洁、友好的中文回复用户
2. 如果用户询问统计信息，优先使用分析工具
3. 工具调用成功后，简要总结执行结果
4. 如果工具调用失败，向用户解释可能的原因并提供解决方案

当需要调用工具时，请严格按照上述格式返回JSON工具调用指令。
你可以同时调用多个工具，系统会按顺序执行。

请根据用户的需求和当前上下文，选择最合适的工具来帮助他们，并确保所有必要参数都被正确补全。`;
  }

  private getDefaultEndpoint(provider: string): string {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages', // Anthropic原生端点，需要OpenAI兼容
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', // 需要OpenAI兼容
      custom: '',
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
      custom: '',
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
      // OpenAI兼容格式（包括DeepSeek、OpenAI等）
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

  private async makeAPIRequest(
    endpoint: string,
    headers: Record<string, string>,
    body: any,
    config: any,
    retryCount = 0
  ): Promise<Response> {
    const maxRetries = 2;
    const retryDelay = 1000; // 1 second

    try {
      const fetchOptions: RequestInit = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      };

      console.log('📡 发送AI请求', {
        endpoint,
        provider: config.provider,
        model: config.model,
        retryAttempt: retryCount,
        bodySize: JSON.stringify(body).length,
      });

      const response = await fetch(endpoint, fetchOptions);

      if (!response.ok) {
        // 如果是服务器错误（5xx）且还有重试次数，进行重试
        if (response.status >= 500 && response.status < 600 && retryCount < maxRetries) {
          console.log(`🔄 服务器错误 ${response.status}，第${retryCount + 1}次重试...`);
          // @ts-ignore
          await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
          return this.makeAPIRequest(endpoint, headers, body, config, retryCount + 1);
        }

        const errorText = await response.text();
        console.error('❌ AI API响应错误', {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          errorPreview: errorText.substring(0, 300),
        });

        let errorMessage = this.getErrorMessage(response.status, errorText, config.provider);
        throw new Error(errorMessage);
      }

      return response;
    } catch (error) {
      // 如果是网络错误且还有重试次数，进行重试
      if (retryCount < maxRetries && error instanceof TypeError) {
        console.log(`🌐 网络错误，第${retryCount + 1}次重试...`);
        // @ts-ignore
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return this.makeAPIRequest(endpoint, headers, body, config, retryCount + 1);
      }
      throw error;
    }
  }

  private getErrorMessage(status: number, errorText: string, provider: string): string {
    // 尝试解析错误信息
    let errorDetail = `API请求失败: ${status}`;
    try {
      const errorData = JSON.parse(errorText);
      errorDetail = errorData.error?.message || errorData.message || errorDetail;
    } catch (e) {
      // 如果无法解析JSON，使用原始文本
      if (errorText) {
        errorDetail = `${errorDetail} - ${errorText.substring(0, 100)}`;
      }
    }

    // 根据状态码提供更友好的错误信息
    switch (status) {
      case 401:
        return `认证失败：请检查API Key是否正确（${provider}）`;
      case 403:
        return `权限不足：请检查API Key是否有足够的权限（${provider}）`;
      case 404:
        return `端点不存在：请检查API地址是否正确（${provider}）`;
      case 429:
        return `请求过于频繁：请稍后再试（${provider}）`;
      case 500:
      case 502:
      case 503:
      case 504:
        return `服务器暂时不可用：请稍后再试（${provider}）`;
      default:
        return errorDetail;
    }
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
      // 直接添加/v1/chat/completions到现有路径后
      // 但为了兼容性，我们假设用户提供的路径是正确的
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

  private async callAIAPI(config: any, systemPrompt: string, userMessage: string, streamCallback?: (content: string, isComplete: boolean) => void): Promise<AIResponse> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.getRecentHistory(),
      { role: 'user', content: userMessage },
    ];

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

    // 记录端点信息
    console.log('🌐 最终API端点信息', {
      provider: config.provider,
      originalBaseURL: config.baseURL || '未设置',
      adjustedEndpoint: apiEndpoint,
      isDefault: !config.baseURL,
      model: model,
      streamMode: !!streamCallback,
    });

    console.log('🚀 准备AI API调用', {
      provider: config.provider,
      endpoint: apiEndpoint,
      model: model,
      messageCount: messages.length,
      hasCustomEndpoint: !!config.baseURL,
      isDeepSeek: config.provider === 'deepseek',
      isOpenAI: config.provider === 'openai',
      isAnthropic: config.provider === 'anthropic',
      isGoogle: config.provider === 'google',
      isCustom: config.provider === 'custom',
      streamMode: !!streamCallback,
    });

    try {
      // 构建请求头和请求体
      const headers = this.buildHeaders(config);
      const useStream = !!streamCallback;
      const requestBody = this.buildRequestBody(config, messages, useStream);

      console.log('📦 请求体信息', {
        provider: config.provider,
        model: requestBody.model,
        messageCount: requestBody.messages?.length || 0,
        maxTokens: requestBody.max_tokens,
        temperature: requestBody.temperature,
        stream: requestBody.stream,
      });

      // 发送请求
      if (useStream) {
        // 流式响应处理
        const content = await this.processStreamResponse(apiEndpoint, headers, requestBody, streamCallback);
        const parsedResponse = this.parseAIResponse(content);
        console.log('🌊 流式响应解析完成', {
          contentLength: content.length,
          hasThinking: !!parsedResponse.thinking,
          thinkingLength: parsedResponse.thinking?.length || 0,
          thinkingPreview: parsedResponse.thinking?.substring(0, 100) || '无',
          hasToolCalls: !!(parsedResponse.toolCalls && parsedResponse.toolCalls.length > 0),
          toolCallCount: parsedResponse.toolCalls?.length || 0,
          textLength: parsedResponse.text.length,
        });
        return parsedResponse;
      } else {
        // 非流式响应处理
        const response = await this.makeAPIRequest(apiEndpoint, headers, requestBody, config);

        // 解析响应 - 统一使用OpenAI兼容格式
        const data = await response.json();

        // 检查是否有错误
        if (data.error) {
          throw new Error(`API错误: ${data.error.message || JSON.stringify(data.error)}`);
        }

        // 统一解析响应内容
        let content = '';

        // 尝试OpenAI兼容格式
        if (data.choices && data.choices[0] && data.choices[0].message) {
          content = data.choices[0].message.content || '';
        }
        // 尝试Anthropic兼容格式
        else if (data.content && Array.isArray(data.content) && data.content[0] && data.content[0].text) {
          content = data.content[0].text;
        }
        // 尝试Google兼容格式
        else if (data.candidates && data.candidates[0] && data.candidates[0].content &&
                 data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
          content = data.candidates[0].content.parts[0].text || '';
        }
        // 其他格式
        else {
          console.warn('无法识别的响应格式，尝试直接获取文本', {
            dataKeys: Object.keys(data),
            dataPreview: JSON.stringify(data).substring(0, 200),
          });
          // 尝试获取任何可能的文本字段
          const textFields = ['text', 'message', 'content', 'result'];
          for (const field of textFields) {
            if (typeof data[field] === 'string') {
              content = data[field];
              break;
            }
          }
        }

        console.log('✅ AI API调用成功', {
          responseLength: content.length,
          hasContent: !!content,
          provider: config.provider,
          finishReason: data.choices?.[0]?.finish_reason || data.stop_reason || 'unknown',
          modelUsed: data.model || 'unknown',
          endpointUsed: apiEndpoint,
          streamMode: false,
        });

        const parsedResponse = this.parseAIResponse(content);
        console.log('🧠 解析后的AI响应', {
          hasThinking: !!parsedResponse.thinking,
          thinkingLength: parsedResponse.thinking?.length || 0,
          thinkingPreview: parsedResponse.thinking?.substring(0, 100) || '无',
          hasToolCalls: !!(parsedResponse.toolCalls && parsedResponse.toolCalls.length > 0),
          toolCallCount: parsedResponse.toolCalls?.length || 0,
          textLength: parsedResponse.text.length,
          textPreview: parsedResponse.text.substring(0, 100),
        });
        return parsedResponse;
      }

    } catch (error) {
      console.error('❌ AI API调用失败', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        provider: config.provider,
        endpoint: apiEndpoint,
        model: config.model,
        hasBaseURL: !!config.baseURL,
        originalBaseURL: config.baseURL || '未设置',
        timestamp: new Date().toISOString(),
        streamMode: !!streamCallback,
        isDeepSeek: config.provider === 'deepseek',
      });

      // 提供更具体的错误信息
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('Network request failed')) {
          throw new Error(`网络连接失败：请检查网络连接后重试（${config.provider}）`);
        }
        // 检查是否是特定供应商的错误
        if (config.provider === 'deepseek') {
          if (error.message.includes('404')) {
            throw new Error(`DeepSeek端点未找到：请确保使用正确的API端点（当前：${apiEndpoint}）。DeepSeek官方端点是 https://api.deepseek.com/v1/chat/completions`);
          }
          if (error.message.includes('401')) {
            throw new Error('DeepSeek认证失败：请检查API Key是否正确。DeepSeek API Key可以在官网获取');
          }
          if (error.message.includes('429')) {
            throw new Error('DeepSeek请求频率限制：请稍后再试，或检查API Key的配额');
          }
          if (error.message.includes('流式请求失败')) {
            throw new Error(`DeepSeek流式响应处理失败：${error.message}。请检查网络连接和API配置`);
          }
          // DeepSeek特定错误处理
          console.log('🔍 DeepSeek特定错误诊断', {
            endpoint: apiEndpoint,
            expectedEndpoint: 'https://api.deepseek.com/v1/chat/completions',
            isCorrectEndpoint: apiEndpoint === 'https://api.deepseek.com/v1/chat/completions',
            hasModel: !!config.model,
            model: config.model,
          });
        } else if (config.provider === 'anthropic') {
          if (error.message.includes('404') || error.message.includes('Not Found')) {
            throw new Error(`Anthropic端点未找到：请确保使用OpenAI兼容的端点或配置正确的baseURL（当前：${apiEndpoint}）`);
          }
          if (error.message.includes('401') || error.message.includes('403')) {
            throw new Error('Anthropic认证失败：请检查API Key和端点配置');
          }
        } else if (config.provider === 'google') {
          if (error.message.includes('404') || error.message.includes('Not Found')) {
            throw new Error(`Google端点未找到：请确保使用OpenAI兼容的端点或配置正确的baseURL（当前：${apiEndpoint}）`);
          }
          if (error.message.includes('401') || error.message.includes('403')) {
            throw new Error('Google认证失败：请检查API Key和端点配置');
          }
        } else if (config.provider === 'custom') {
          if (error.message.includes('404') || error.message.includes('Not Found')) {
            throw new Error(`自定义端点未找到：请检查baseURL配置是否正确（当前：${apiEndpoint}）`);
          }
          if (error.message.includes('401') || error.message.includes('403')) {
            throw new Error('自定义端点认证失败：请检查API Key和端点配置');
          }
        }
        throw error;
      }
      throw new Error(`未知错误：${String(error)}`);
    }
  }

  private async processStreamResponse(
    endpoint: string,
    headers: Record<string, string>,
    body: any,
    streamCallback: (content: string, isComplete: boolean) => void
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🌊 开始处理流式响应', {
          endpoint: endpoint,
          headers: headers,
          bodySize: JSON.stringify(body).length,
          provider: body.model?.includes('deepseek') ? 'DeepSeek' : 'Other',
          timestamp: new Date().toISOString(),
        });

        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
        };

        console.log('📡 发送流式请求', {
          method: 'POST',
          url: endpoint,
          headersCount: Object.keys(headers).length,
          hasAuthorization: !!headers.Authorization,
          contentType: headers['Content-Type'],
        });

        const response = await fetch(endpoint, fetchOptions);

        // 记录响应状态和headers
        console.log('📥 收到流式响应', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          url: response.url,
          redirected: response.redirected,
          type: response.type,
          bodyUsed: response.bodyUsed,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ 流式请求失败', {
            status: response.status,
            statusText: response.statusText,
            errorText: errorText,
            endpoint: endpoint,
            headers: headers,
          });
          reject(new Error(`流式请求失败: ${response.status} ${response.statusText} - ${errorText}`));
          return;
        }

        // 检查response.body是否存在（React Native可能不支持）
        // 使用类型断言来避免TypeScript错误
        const responseAny = response as any;

        if (responseAny.body && typeof responseAny.body.getReader === 'function') {
          // 标准Web API方式：使用response.body
          console.log('✅ 使用标准Web API流式处理（response.body）');
          await this.processStreamWithBody(responseAny, streamCallback, resolve, reject);
        } else {
          // React Native备选方案：使用response.text()然后手动解析
          console.log('⚠️ response.body不可用，使用React Native备选方案');
          await this.processStreamWithText(response, streamCallback, resolve, reject);
        }
      } catch (error) {
        console.error('❌ 流式响应处理失败', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          endpoint: endpoint,
          timestamp: new Date().toISOString(),
        });
        reject(error);
      }
    });
  }

  private async processStreamWithBody(
    response: any,
    streamCallback: (content: string, isComplete: boolean) => void,
    resolve: (value: string) => void,
    reject: (reason?: any) => void
  ): Promise<void> {
    try {
      if (!response.body) {
        console.error('❌ 响应体为空');
        reject(new Error('响应体为空'));
        return;
      }

      const reader = response.body.getReader();
      // @ts-ignore
      const decoder = new TextDecoder('utf-8');
      let accumulatedContent = '';
      let chunkCount = 0;
      let lineCount = 0;
      let dataCount = 0;

      console.log('🔄 开始读取流式数据（标准Web API）');

      try {
        while (true) {
          const { done, value } = await reader.read();
          chunkCount++;

          if (done) {
            console.log('✅ 流式响应完成', {
              totalChunks: chunkCount,
              totalLines: lineCount,
              totalDataEvents: dataCount,
              accumulatedLength: accumulatedContent.length,
              finalContentPreview: accumulatedContent.substring(0, 100),
            });
            streamCallback('', true);
            resolve(accumulatedContent);
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          lineCount += lines.length;

          console.log(`📦 收到流式数据块 ${chunkCount}`, {
            chunkSize: value.length,
            decodedLength: chunk.length,
            linesInChunk: lines.length,
            firstLinePreview: lines[0]?.substring(0, 50),
          });

          for (const line of lines) {
            const trimmedLine = line.trim();

            // 跳过空行和结束标记
            if (!trimmedLine) {
              continue;
            }

            // 处理不同的结束标记
            if (trimmedLine === 'data: [DONE]' || trimmedLine === '[DONE]') {
              console.log('🏁 收到流式结束标记');
              continue;
            }

            // 处理不同的数据格式
            let jsonStr = '';
            if (trimmedLine.startsWith('data: ')) {
              jsonStr = trimmedLine.substring(6);
              dataCount++;
            } else if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
              // 直接JSON格式（某些API可能不包含"data: "前缀）
              jsonStr = trimmedLine;
              dataCount++;
            } else {
              // 非JSON数据，记录但跳过
              console.log('⚠️ 跳过非JSON行', {
                linePreview: trimmedLine.substring(0, 100),
                lineLength: trimmedLine.length,
              });
              continue;
            }

            if (jsonStr.trim() === '') {
              continue;
            }

            try {
              const data = JSON.parse(jsonStr);

              // 支持多种流式响应格式
              let delta = '';

              // 1. OpenAI兼容格式
              if (data.choices?.[0]?.delta?.content !== undefined) {
                delta = data.choices[0].delta.content || '';
              }
              // 2. 直接content字段（某些API）
              else if (data.content !== undefined) {
                delta = data.content || '';
              }
              // 3. 可能使用的格式
              else if (data.result?.choices?.[0]?.delta?.content !== undefined) {
                delta = data.result.choices[0].delta.content || '';
              }
              // 4. 直接text字段
              else if (data.text !== undefined) {
                delta = data.text || '';
              }
              // 5. 消息格式
              else if (data.message?.content !== undefined) {
                delta = data.message.content || '';
              }

              if (delta) {
                accumulatedContent += delta;

                // 在流式过程中尝试提取思考块
                // 如果检测到思考块，可以提前通知UI
                const tempParsed = this.parseAIResponse(accumulatedContent);
                if (tempParsed.thinking && !tempParsed.thinking.includes('undefined')) {
                  // 如果检测到思考块，可以通过streamCallback的特殊标记通知
                  // 这里我们只是记录日志，实际处理在最终解析时完成
                  if (dataCount === 1) {
                    console.log('💭 流式过程中检测到思考块', {
                      thinkingPreview: tempParsed.thinking.substring(0, 100),
                      accumulatedLength: accumulatedContent.length,
                    });
                  }
                }

                streamCallback(delta, false);

                // 记录详细的数据信息（仅前几次）
                if (dataCount <= 5) {
                  console.log('📝 解析流式数据成功', {
                    dataCount: dataCount,
                    deltaLength: delta.length,
                    deltaPreview: delta.substring(0, 50),
                    accumulatedLength: accumulatedContent.length,
                    dataKeys: Object.keys(data),
                    hasChoices: !!data.choices,
                    hasResult: !!data.result,
                    model: data.model || 'unknown',
                  });
                }
              } else {
                // 记录非内容数据（如工具调用等）
                if (data.choices?.[0]?.delta?.tool_calls || data.choices?.[0]?.finish_reason) {
                  console.log('🔧 非内容数据', {
                    finishReason: data.choices[0].finish_reason,
                    hasToolCalls: !!data.choices[0].delta?.tool_calls,
                    dataPreview: JSON.stringify(data).substring(0, 200),
                  });
                }
              }
            } catch (parseError) {
              console.warn('❌ 解析流式数据失败', {
                error: parseError instanceof Error ? parseError.message : String(parseError),
                jsonStr: jsonStr.substring(0, 200),
                lineNumber: lineCount,
                chunkNumber: chunkCount,
              });
            }
          }
        }
      } catch (streamError) {
        console.error('❌ 流式读取过程中发生错误', {
          error: streamError instanceof Error ? streamError.message : String(streamError),
          chunkCount: chunkCount,
          lineCount: lineCount,
          dataCount: dataCount,
          accumulatedLength: accumulatedContent.length,
        });
        reject(streamError);
      } finally {
        reader.releaseLock();
        console.log('🔒 流式读取器已释放', {
          totalChunksProcessed: chunkCount,
          totalContentLength: accumulatedContent.length,
        });
      }
    } catch (error) {
      console.error('❌ 标准Web API流式处理失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      reject(error);
    }
  }

  private async processStreamWithText(
    response: Response,
    streamCallback: (content: string, isComplete: boolean) => void,
    resolve: (value: string) => void,
    reject: (reason?: any) => void
  ): Promise<void> {
    try {
      console.log('📝 使用React Native备选方案处理流式响应');

      // 获取完整的响应文本
      const responseText = await response.text();

      if (!responseText) {
        console.error('❌ 响应文本为空');
        reject(new Error('响应文本为空'));
        return;
      }

      console.log('📄 收到完整响应文本', {
        textLength: responseText.length,
        preview: responseText.substring(0, 200),
      });

      let accumulatedContent = '';

      // 按行分割响应文本
      const lines = responseText.split('\n');
      console.log(`📊 共 ${lines.length} 行数据`);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 跳过空行
        if (!trimmedLine) {
          continue;
        }

        // 处理结束标记
        if (trimmedLine === 'data: [DONE]' || trimmedLine === '[DONE]') {
          console.log('🏁 收到流式结束标记');
          continue;
        }

        // 处理数据行
        let jsonStr = '';
        if (trimmedLine.startsWith('data: ')) {
          jsonStr = trimmedLine.substring(6);
        } else if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
          jsonStr = trimmedLine;
        } else {
          // 非JSON数据，跳过
          continue;
        }

        if (jsonStr.trim() === '') {
          continue;
        }

        try {
          const data = JSON.parse(jsonStr);

          // 支持多种流式响应格式
          let delta = '';

          // 1. OpenAI兼容格式
          if (data.choices?.[0]?.delta?.content !== undefined) {
            delta = data.choices[0].delta.content || '';
          }
          // 2. 直接content字段（某些API）
          else if (data.content !== undefined) {
            delta = data.content || '';
          }
          // 3. DeepSeek可能使用的格式
          else if (data.result?.choices?.[0]?.delta?.content !== undefined) {
            delta = data.result.choices[0].delta.content || '';
          }
          // 4. 直接text字段
          else if (data.text !== undefined) {
            delta = data.text || '';
          }
          // 5. 消息格式
          else if (data.message?.content !== undefined) {
            delta = data.message.content || '';
          }

          if (delta) {
            accumulatedContent += delta;

            // 在流式过程中尝试提取思考块
            const tempParsed = this.parseAIResponse(accumulatedContent);
            if (tempParsed.thinking && !tempParsed.thinking.includes('undefined')) {
              if (i === 0) {
                console.log('💭 React Native流式过程中检测到思考块', {
                  thinkingPreview: tempParsed.thinking.substring(0, 100),
                  accumulatedLength: accumulatedContent.length,
                });
              }
            }

            // 模拟流式回调，立即调用
            streamCallback(delta, false);

            // 记录前几条数据
            if (i < 5) {
              console.log('📝 解析流式数据成功（React Native）', {
                lineNumber: i + 1,
                deltaLength: delta.length,
                deltaPreview: delta.substring(0, 50),
                accumulatedLength: accumulatedContent.length,
              });
            }
          }
        } catch (parseError) {
          console.warn('❌ 解析流式数据失败（React Native）', {
            error: parseError instanceof Error ? parseError.message : String(parseError),
            jsonStr: jsonStr.substring(0, 200),
            lineNumber: i + 1,
          });
        }
      }

      // 完成所有数据处理
      console.log('✅ React Native流式处理完成', {
        totalLines: lines.length,
        accumulatedLength: accumulatedContent.length,
        finalContentPreview: accumulatedContent.substring(0, 100),
      });

      resolve(accumulatedContent);

    } catch (error) {
      console.error('❌ React Native流式处理失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      reject(error);
    }
  }

  private parseAIResponse(content: string): AIResponse {
    // 首先，尝试提取思考块
    let thinkingContent: string | undefined;
    let remainingContent = content;

    // 定义更全面的思考块正则表达式模式
    const thinkingPatterns = [
      // 中文模式
      /思考[：:]\s*([\s\S]*?)(?=\n\n|\n(?:结论|所以|因此|回答|工具调用|```|$))/i,
      /让我想想[：:]\s*([\s\S]*?)(?=\n\n|\n(?:结论|所以|因此|回答|工具调用|```|$))/i,
      /让我分析一下[：:]\s*([\s\S]*?)(?=\n\n|\n(?:结论|所以|因此|回答|工具调用|```|$))/i,
      /分析[：:]\s*([\s\S]*?)(?=\n\n|\n(?:结论|所以|因此|回答|工具调用|```|$))/i,
      /首先[，,]\s*([\s\S]*?)(?=\n\n|\n(?:其次|然后|接着|最后|结论|所以|因此|回答|工具调用|```|$))/i,

      // 英文模式
      /Thinking[：:]\s*([\s\S]*?)(?=\n\n|\n(?:Conclusion|So|Therefore|Answer|Tool call|```|$))/i,
      /thought[：:]\s*([\s\S]*?)(?=\n\n|\n(?:Conclusion|So|Therefore|Answer|Tool call|```|$))/i,
      /analysis[：:]\s*([\s\S]*?)(?=\n\n|\n(?:Conclusion|So|Therefore|Answer|Tool call|```|$))/i,
      /let me think[：:]\s*([\s\S]*?)(?=\n\n|\n(?:Conclusion|So|Therefore|Answer|Tool call|```|$))/i,

      // 表情符号模式
      /💭\s*([\s\S]*?)(?=\n\n|\n(?:💡|✨|🎯|🔧|```|$))/,
      /🤔\s*([\s\S]*?)(?=\n\n|\n(?:💡|✨|🎯|🔧|```|$))/,

      // 标记模式
      /<thinking>([\s\S]*?)<\/thinking>/i,
      /\[思考\]\s*([\s\S]*?)\[\/思考\]/i,
      /\[thinking\]\s*([\s\S]*?)\[\/thinking\]/i,

      // 通用模式：以思考相关词汇开头，后面跟着结论性词汇
      /(?:思考|分析|让我想想|Thinking|Analysis)[：:]\s*([\s\S]*?)(?=\n\n|\n(?:所以|因此|结论|回答|工具调用|```|$))/i,
    ];

    // 尝试匹配思考块
    for (const pattern of thinkingPatterns) {
      const match = remainingContent.match(pattern);
      if (match) {
        // 获取匹配的内容（可能是第一个捕获组或整个匹配）
        const matchedContent = match[1] || match[0];
        if (matchedContent && matchedContent.trim()) {
          thinkingContent = matchedContent.trim();

          // 从原始内容中移除思考块，但保留其他内容
          // 使用更精确的替换，只移除思考块部分
          const fullMatch = match[0];
          remainingContent = remainingContent.replace(fullMatch, '').trim();

          console.log('💭 检测到思考块', {
            pattern: pattern.toString().substring(0, 50),
            thinkingLength: thinkingContent.length,
            thinkingPreview: thinkingContent.substring(0, 150),
            remainingLength: remainingContent.length,
          });
          break;
        }
      }
    }

    // 如果找到思考块但剩余内容为空，尝试从原始内容中提取非思考部分
    if (thinkingContent && remainingContent.trim() === '') {
      // 尝试找到思考块后的内容
      const afterThinking = content.split(thinkingContent)[1];
      if (afterThinking && afterThinking.trim()) {
        remainingContent = afterThinking.trim();
      }
    }

    // 清理剩余内容：移除多余的空行
    remainingContent = remainingContent.replace(/\n{3,}/g, '\n\n').trim();

    // 然后，尝试解析JSON工具调用
    try {
      const jsonMatch = remainingContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        console.log('🔍 检测到JSON工具调用');
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.toolCalls && Array.isArray(parsed.toolCalls)) {
          console.log('✅ 解析工具调用成功', {
            toolCallCount: parsed.toolCalls.length,
            hasThinking: !!thinkingContent,
            thinkingLength: thinkingContent?.length || 0,
          });
          return {
            text: remainingContent.replace(/```json[\s\S]*?```/, '').trim(),
            thinking: thinkingContent,
            toolCalls: parsed.toolCalls,
          };
        }
      }
    } catch (error) {
      console.log('⚠️ 非JSON响应或解析失败，返回纯文本', {
        error: error instanceof Error ? error.message : String(error),
        contentPreview: remainingContent.substring(0, 200),
        hasThinking: !!thinkingContent,
        thinkingPreview: thinkingContent?.substring(0, 100) || '无',
      });
    }

    // 返回包含思考块和文本的响应
    const result = {
      text: remainingContent.trim(),
      thinking: thinkingContent
    };

    console.log('📋 最终解析结果', {
      hasThinking: !!result.thinking,
      thinkingLength: result.thinking?.length || 0,
      textLength: result.text.length,
      textPreview: result.text.substring(0, 100),
    });

    return result;
  }

  private async executeToolCalls(toolCalls: Array<{name: string, arguments: any}>): Promise<Array<{
    name: string;
    success: boolean;
    result?: any;
    error?: string;
  }>> {
    return this.executeToolCallsWithProgress(toolCalls);
  }

  private async executeToolCallsWithProgress(
    toolCalls: Array<{name: string, arguments: any}>,
    progressCallback?: (progressMsg: string) => void
  ): Promise<Array<{
    name: string;
    success: boolean;
    result?: any;
    error?: string;
  }>> {
    const results = [];

    // 获取当前账本信息
    let currentBookInfo = null;
    if (this.currentBookId) {
      currentBookInfo = {
        bookId: this.currentBookId,
        bookName: this.currentBookName || '当前账本',
      };
    }

    // 如果没有账本信息，记录错误
    if (!currentBookInfo) {
      console.error('❌ 无法获取当前账本信息，工具调用可能失败');
    } else {
      console.log('📋 当前账本信息:', currentBookInfo);
    }

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      const toolNumber = i + 1;
      const totalTools = toolCalls.length;

      // 发送进度提示
      if (progressCallback) {
        const progressMsg = `\n🔧 [${toolNumber}/${totalTools}] 正在执行 ${toolCall.name}...\n`;
        progressCallback(progressMsg);
      }

      try {
        console.log('🛠️ 执行工具调用', {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments).substring(0, 200),
          hasBookInfo: !!currentBookInfo,
          bookId: currentBookInfo?.bookId,
        });

        // 传递当前账本信息给MCPBridge
        const result = await mcpBridge.callTool(toolCall.name, toolCall.arguments, currentBookInfo!);

        console.log('✅ 工具调用成功', {
          name: toolCall.name,
          resultType: typeof result.data,
          hasData: !!result.data,
          usedBookId: currentBookInfo?.bookId,
        });

        // 发送成功提示
        if (progressCallback) {
          const successMsg = `✅ [${toolNumber}/${totalTools}] ${toolCall.name} 执行成功\n`;
          progressCallback(successMsg);
        }

        results.push({
          name: toolCall.name,
          success: true,
          result: result.data,
        });
      } catch (error) {
        console.error('❌ 工具调用失败', {
          name: toolCall.name,
          error: error instanceof Error ? error.message : String(error),
          arguments: JSON.stringify(toolCall.arguments).substring(0, 200),
          hasBookInfo: !!currentBookInfo,
          bookId: currentBookInfo?.bookId,
        });

        // 如果错误是因为没有账本信息，提供更明确的错误信息
        let errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('未选择账本') || errorMessage.includes('bookId')) {
          errorMessage = `工具调用失败：${errorMessage}\n\n请确保已选择账本或提供账本信息。`;
        }

        // 发送失败提示
        if (progressCallback) {
          const errorMsg = `❌ [${toolNumber}/${totalTools}] ${toolCall.name} 执行失败: ${errorMessage.substring(0, 100)}\n`;
          progressCallback(errorMsg);
        }

        results.push({
          name: toolCall.name,
          success: false,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  private buildToolResultsMessage(toolResults: Array<{
    name: string;
    success: boolean;
    result?: any;
    error?: string;
  }>): string {
    const messages = toolResults.map((result, index) => {
      const toolNumber = index + 1;
      if (result.success) {
        return `工具调用 ${toolNumber} (${result.name}) 执行成功。结果：${JSON.stringify(result.result, null, 2)}`;
      } else {
        return `工具调用 ${toolNumber} (${result.name}) 执行失败。错误：${result.error || '未知错误'}`;
      }
    });

    return `工具执行结果：\n${messages.join('\n\n')}\n\n请根据以上结果继续处理或给出最终回答。`;
  }

  private async generateFinalResponse(
    userMessage: string,
    initialAIResponse: AIResponse,
    toolResults: any[],
    config: any,
    streamedContent: string // 新增参数：已流式显示的内容
  ): Promise<string> {
    // 统计工具执行结果
    const successCount = toolResults.filter(r => r.success).length;
    const totalCount = toolResults.length;

    console.log('🔄 生成最终回复', {
      toolResultsCount: totalCount,
      successCount: successCount,
      allSuccessful: successCount === totalCount,
      streamedContentLength: streamedContent?.length || 0,
      toolResults: toolResults.map(r => ({
        name: r.name,
        success: r.success,
        result: r.result,
      })),
    });

    // 如果没有工具需要执行，返回初始响应（包含流式内容）
    if (totalCount === 0) {
      console.log('⚠️ 没有工具需要执行，返回初始响应');
      // 如果流式内容不为空，优先使用流式内容
      if (streamedContent && streamedContent.trim()) {
        return streamedContent;
      }
      return initialAIResponse.text;
    }

    // 构建工具执行结果摘要
    const toolSummary = toolResults.map((result, index) => {
      const status = result.success ? '✅' : '❌';
      const toolName = result.name || `工具${index + 1}`;
      const statusText = result.success ? '成功' : `失败: ${result.error || '未知错误'}`;
      return `${status} ${toolName}: ${statusText}`;
    }).join('\n');

    // 根据执行情况生成不同的回复，追加到流式内容后面
    let finalContent = streamedContent || initialAIResponse.text;

    // 确保流式内容以换行结束
    if (finalContent && !finalContent.endsWith('\n')) {
      finalContent += '\n';
    }

    // 添加分隔线
    finalContent += '\n---\n\n';

    // 根据工具执行结果添加不同的总结
    if (successCount === 0) {
      // 所有工具都失败
      finalContent += `抱歉，所有操作都失败了。\n\n执行情况：\n${toolSummary}\n\n请检查网络连接或稍后重试。`;
    } else if (successCount < totalCount) {
      // 部分成功
      finalContent += `已完成部分操作。\n\n执行情况：\n${toolSummary}\n\n${successCount}/${totalCount} 个操作成功完成。`;
    } else {
      // 所有成功
      finalContent += `✅ 所有操作已完成。\n\n执行情况：\n${toolSummary}\n\n${successCount}/${totalCount} 个操作成功完成。`;
    }

    console.log('✅ 最终回复已生成', {
      finalContentLength: finalContent.length,
      streamedContentLength: streamedContent?.length || 0,
      addedSummaryLength: finalContent.length - (streamedContent?.length || 0),
    });

    return finalContent;
  }

  private addToHistory(role: 'user' | 'assistant' | 'system', content: string) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }

  private getRecentHistory() {
    return this.conversationHistory
      .slice(-10)
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
}

export const aiService = new AIService();
