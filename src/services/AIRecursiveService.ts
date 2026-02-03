import {aiConfigService} from './AIConfigService';
import {mcpBridge} from './MCPBridge';
import {
  AIMessage,
  BaseMessage,
  createAIMessage,
  createTextMessage,
  createThinkingMessage,
  createToolCallMessage,
  createToolResultMessage,
  TextMessage,
  ThinkingMessage,
  ToolCallMessage,
  ToolResultMessage,
} from '../types';
import {AIResponse, AIService, MessageStreamCallback} from './AIService';

export interface RecursiveIterationState {
  currentIteration: number;
  maxIterations: number;
  currentUserMessage: string;
  allStreamedContent: string;
  aiMessage: AIMessage;
  streamCallback?: MessageStreamCallback;
}

export class AIRecursiveService {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  // 类型守卫函数（从AIService复制）
  private isTextMessage(msg: BaseMessage): msg is TextMessage {
    return msg.type === 'text';
  }

  private isThinkingMessage(msg: BaseMessage): msg is ThinkingMessage {
    return msg.type === 'thinking';
  }

  private isToolCallMessage(msg: BaseMessage): msg is ToolCallMessage {
    return msg.type === 'tool_call';
  }

  private isToolResultMessage(msg: BaseMessage): msg is ToolResultMessage {
    return msg.type === 'tool_result';
  }

  private isAIMessage(msg: BaseMessage): msg is AIMessage {
    return msg.type === 'ai';
  }

  // 辅助函数：添加或更新文本消息（从AIService复制）
  private addOrUpdateTextMessage(messageList: BaseMessage[], content: string, isUser: boolean = false): TextMessage {
    let existingIndex = -1;
    for (let i = messageList.length - 1; i >= 0; i--) {
      const msg = messageList[i];
      if (this.isTextMessage(msg) && msg.isUser === isUser) {
        existingIndex = i;
        break;
      }
    }

    let shouldCreateNew = true;

    if (existingIndex >= 0) {
      let hasOtherTypeMessages = false;
      for (let i = existingIndex + 1; i < messageList.length; i++) {
        const msg = messageList[i];
        if (
          this.isThinkingMessage(msg) ||
          this.isToolCallMessage(msg) ||
          this.isToolResultMessage(msg)
        ) {
          hasOtherTypeMessages = true;
          break;
        }
      }

      if (!hasOtherTypeMessages) {
        shouldCreateNew = false;
      }
    }

    if (!shouldCreateNew && existingIndex >= 0) {
      const existing = messageList[existingIndex] as TextMessage;
      const updated: TextMessage = {
        ...existing,
        content: existing.content + content,
        loading: false,
      };
      messageList[existingIndex] = updated;
      return updated;
    } else {
      const newMessage: TextMessage = createTextMessage(content, isUser, {
        id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      });
      messageList.push(newMessage);
      return newMessage;
    }
  }

  // 辅助函数：添加思考消息（从AIService复制）
  private addThinkingMessage(messageList: BaseMessage[], thinkingContent: string): ThinkingMessage {
    let existingIndex = -1;
    for (let i = messageList.length - 1; i >= 0; i--) {
      const msg = messageList[i];
      if (this.isThinkingMessage(msg)) {
        existingIndex = i;
        break;
      }
    }

    let shouldCreateNew = true;

    if (existingIndex >= 0) {
      let hasOtherTypeMessages = false;
      for (let i = existingIndex + 1; i < messageList.length; i++) {
        const msg = messageList[i];
        if (
          this.isTextMessage(msg) ||
          this.isToolCallMessage(msg) ||
          this.isToolResultMessage(msg)
        ) {
          hasOtherTypeMessages = true;
          break;
        }
      }

      if (!hasOtherTypeMessages) {
        shouldCreateNew = false;
      }
    }

    if (!shouldCreateNew && existingIndex >= 0) {
      const existing = messageList[existingIndex] as ThinkingMessage;
      const updated: ThinkingMessage = {
        ...existing,
        thinkingContent: existing.thinkingContent + thinkingContent,
        loading: false,
      };
      messageList[existingIndex] = updated;
      return updated;
    } else {
      const newMessage: ThinkingMessage = createThinkingMessage(thinkingContent, {
        id: `thinking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        collapsed: false,
      });
      messageList.push(newMessage);
      return newMessage;
    }
  }

  // 辅助函数：更新工具调用结果（从AIService复制）
  private updateToolCallResult(
    targetToolCallMessage: ToolCallMessage,
    aiMessage: AIMessage,
    toolName: string,
    result: any,
    success: boolean,
    error?: string,
    duration?: number,
    streamCallback?: MessageStreamCallback
  ) : ToolCallMessage {

    // 创建工具结果消息
    const toolResultMessage: ToolResultMessage = createToolResultMessage(
      toolName,
      success,
      {
        id: `tool_result_${Date.now()}_${targetToolCallMessage.id}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        result,
        errorMessage: error,
        duration,
        collapsed: true,
      }
    );

    targetToolCallMessage = {
      ...targetToolCallMessage,
      loading: false,
      resultMessage: toolResultMessage,
    };

    const index = aiMessage.messageList.findIndex(message => message.id === targetToolCallMessage.id);
    aiMessage.messageList[index] = targetToolCallMessage;

    if (streamCallback) {
      streamCallback(aiMessage, false);
    }
    return targetToolCallMessage;
  }

  // 执行工具调用（从AIService复制并调整）
  private async executeToolCalls(
    detectedToolCalls: Array<{name: string, arguments: any; id?: string}>,
    aiMessage: AIMessage,
    streamCallback?: MessageStreamCallback
  ): Promise<{
    results: ToolCallMessage[];
    updatedAiMessage: AIMessage;
  }> {
    const results = [];

    // 获取当前账本信息
    let currentBookInfo = null;
    if (this.aiService.currentBookId) {
      currentBookInfo = {
        bookId: this.aiService.currentBookId,
        bookName: this.aiService.currentBookName || '当前账本',
      };
    }

    for (const toolCall of detectedToolCalls) {
      const i = detectedToolCalls.indexOf(toolCall);
      // 为每个工具调用生成唯一ID，如果还没有的话
      const toolCallId = toolCall.id || `tool_call_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;

      // 创建工具调用消息，注意新结构包含 result 字段
      let toolCallMessage: ToolCallMessage = createToolCallMessage(
        toolCall.name,
        toolCall.arguments,
        {
          id: toolCallId,
          timestamp: new Date(),
          loading: true,
          collapsed: true,
        }
      );

      // 将消息添加到列表
      aiMessage.messageList.push(toolCallMessage);
      if (streamCallback) {
        streamCallback(aiMessage, false);
      }

      try {
        const result = await mcpBridge.callTool(toolCall.name, toolCall.arguments, currentBookInfo!);

        // 更新工具调用消息的result字段，传递工具调用ID
        results.push(this.updateToolCallResult(
          toolCallMessage,
          aiMessage,
          toolCall.name,
          result.data,
          true,
          undefined,
          0,
          streamCallback
        ));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.push(this.updateToolCallResult(
          toolCallMessage,
          aiMessage,
          toolCall.name,
          undefined,
          false,
          errorMessage,
          0,
          streamCallback
        ));
      }
    }
    return {
      results,
      updatedAiMessage: aiMessage,
    };
  }

  // 构建工具结果消息（从AIService复制）
  private buildToolResultsMessage(toolResults: ToolCallMessage[]): string {
    return `工具执行结果：\n${JSON.stringify(toolResults)}\n\n请根据以上结果继续处理或给出最终回答。`;
  }

  // 主递归函数
  async sendMessageRecursive(
    userMessage: string,
    streamCallback?: MessageStreamCallback,
    state?: RecursiveIterationState
  ): Promise<AIResponse> {
    // 检查是否正在取消操作
    if (this.aiService.isCancelling()) {
      console.log('🛑 检测到取消操作，停止递归迭代');
      // 返回空的响应
      return { messages: [], text: '操作已取消' };
    }

    // 获取聊天模型配置
    const config = await aiConfigService.getChatModelConfig();
    if (!config?.apiKey) {
      throw new Error('AI配置未完成，请先配置API Key');
    }

    // 初始化状态
    if (!state) {
      const aiMessageId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const aiMessage: AIMessage = createAIMessage([], {
        id: aiMessageId,
        timestamp: new Date(),
        loading: true,
      });

      state = {
        currentIteration: 0,
        maxIterations: 100,
        currentUserMessage: userMessage,
        allStreamedContent: '',
        aiMessage,
        streamCallback,
      };

      // 添加用户消息到历史记录
      this.aiService.addToHistory('user', userMessage);

      // 发送初始AI消息
      if (streamCallback) {
        streamCallback(aiMessage, false);
      }
    }

    // 检查迭代次数
    if (state.currentIteration >= state.maxIterations) {
      const timeoutResponse = `已达到最大处理次数（${state.maxIterations}）。\n\n${state.allStreamedContent || '处理可能未完成。'}`;

      const finalAiMessage: AIMessage = {
        ...state.aiMessage,
        loading: false,
        messageList: [...state.aiMessage.messageList],
      };

      if (state.streamCallback) {
        state.streamCallback(finalAiMessage, true);
      }

      this.aiService.addToHistory('assistant', timeoutResponse);

      return {
        messages: [finalAiMessage],
        text: timeoutResponse,
      };
    }

    state.currentIteration++;
    console.log(`🔄 开始第 ${state.currentIteration} 次迭代`);

    // 获取系统提示
    const appContext = await this.aiService.getContext();
    const systemPrompt = await this.aiService.buildSystemPrompt(appContext);
    // 用于存储当前迭代的工具调用
    let detectedToolCalls: Array<{name: string, arguments: any}> = [];
    let currentIterationStreamedContent = '';

    // 创建流式解析器（使用AIService内部的StreamMessageParser）
    const streamParser = this.aiService.streamParser;
    // 每次迭代清理流解析器状态
    if (streamParser) {
      streamParser.reset();
      console.log('🔄 流解析器状态已重置');
    }
    // 内部流式回调
    const internalStreamCallback = async (content: string, reasoning_content: string, tool_calls: any[] | null, isComplete: boolean) => {
      // 检查是否正在取消操作
      if (this.aiService.isCancelling()) {
        console.log('🛑 检测到取消操作，停止流式处理');
        return;
      }

      if (content || reasoning_content || tool_calls || isComplete) {
        // 使用解析器处理数据块
        const result = streamParser!.processChunk({
          content: content || '',
          thinking: reasoning_content || '',
          tool_calls: tool_calls || undefined,
        }, isComplete);

        currentIterationStreamedContent = result.content;
        // 检查是否有工具调用
        if (result.toolCalls && result.toolCalls.length > 0) {
          detectedToolCalls = result.toolCalls;
        }

        // 更新消息列表
        if (result.content) {
          this.addOrUpdateTextMessage(state!.aiMessage.messageList, result.content, false);
        }

        if (result.thinking) {
          this.addThinkingMessage(state!.aiMessage.messageList, result.thinking);
        }

        // 更新AI消息
        const updatedAiMessage: AIMessage = {
          ...state!.aiMessage,
          loading: false,
          messageList: [...state!.aiMessage.messageList],
        };

        if (state!.streamCallback) {
          state!.streamCallback(updatedAiMessage, false);
        }

        state!.aiMessage = updatedAiMessage;

        // 如果流式响应完成，处理工具调用
        if (isComplete) {
          console.log(`🌊 第 ${state!.currentIteration} 次迭代流式响应完成`);
        }
      }
    };

    try {
      // 调用AI API（只使用流式调用）
      await this.aiService.callAIAPI(
        config,
        systemPrompt,
        state.currentUserMessage,
        internalStreamCallback
      );

      // 流式响应完成后，检查是否有工具调用
      if (detectedToolCalls.length > 0) {
        // 检查是否正在取消操作
        if (this.aiService.isCancelling()) {
          console.log('🛑 检测到取消操作，停止工具调用执行');
          // 返回当前状态
          const finalAiMessage: AIMessage = {
            ...state.aiMessage,
            loading: false,
            messageList: [...state.aiMessage.messageList],
          };

          if (state.streamCallback) {
            state.streamCallback(finalAiMessage, true);
          }

          return {
            messages: [finalAiMessage],
            text: state.allStreamedContent || '操作已取消',
          };
        }

        console.log(`🔧 第 ${state.currentIteration} 次迭代检测到工具调用，开始执行`);
        // 执行工具调用
        const { results, updatedAiMessage } = await this.executeToolCalls(
          detectedToolCalls,
          state.aiMessage,
          state.streamCallback
        );

        state.aiMessage = updatedAiMessage;
        state.allStreamedContent += currentIterationStreamedContent;

        if (state.currentIteration < state.maxIterations) {
          // 检查是否正在取消操作
          if (this.aiService.isCancelling()) {
            console.log('🛑 检测到取消操作，停止后续迭代');
            // 返回当前状态
            const finalAiMessage: AIMessage = {
              ...state.aiMessage,
              loading: false,
              messageList: [...state.aiMessage.messageList],
            };

            if (state.streamCallback) {
              state.streamCallback(finalAiMessage, true);
            }

            return {
              messages: [finalAiMessage],
              text: state.allStreamedContent || '操作已取消',
            };
          }

          // 构建工具执行结果消息，用于下一次迭代
          const toolResultsMessage = this.buildToolResultsMessage(results);
          state.currentUserMessage = toolResultsMessage;
          this.aiService.addToHistory('user', toolResultsMessage);

          // 递归调用下一次迭代
          return this.sendMessageRecursive(userMessage, streamCallback, state);
        } else {
          // 生成最终响应
          const finalResponse = await this.generateFinalResponse(
            results,
            state.allStreamedContent
          );

          this.aiService.addToHistory('assistant', finalResponse);

          // 设置loading为false
          const finalAiMessage: AIMessage = {
            ...state.aiMessage,
            loading: false,
            messageList: [...state.aiMessage.messageList],
          };

          if (state.streamCallback) {
            state.streamCallback(finalAiMessage, true);
          }

          return {
            messages: [finalAiMessage],
            text: finalResponse,
          };
        }
      } else {
        return {};
      }
    } catch (error) {
      console.error('❌ AI调用失败:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorResponse = `抱歉，AI处理失败：${errorMessage}\n\n请检查网络连接或稍后重试。`;

      this.addOrUpdateTextMessage(
        state.aiMessage.messageList,
        errorResponse,
        false
      );

      const finalAiMessage: AIMessage = {
        ...state.aiMessage,
        loading: false,
        error: true,
        messageList: [...state.aiMessage.messageList],
      };

      if (state.streamCallback) {
        state.streamCallback(finalAiMessage, true);
      }

      return {
        messages: [finalAiMessage],
        text: errorResponse,
        error: errorMessage,
      };
    }
  }

  // 生成最终响应（从AIService复制并调整）
  private async generateFinalResponse(
    toolResults: any[],
    allStreamedContent: string
  ): Promise<string> {
    const successCount = toolResults.filter(r => r.success).length;
    const totalCount = toolResults.length;

    let finalContent = allStreamedContent || '';
    if (finalContent && !finalContent.endsWith('\n')) {
      finalContent += '\n';
    }

    finalContent += '\n---\n\n';

    const toolSummary = toolResults.map((result, index) => {
      const status = result.success ? '✅' : '❌';
      const toolName = result.name || `工具${index + 1}`;
      const statusText = result.success ? '成功' : `失败: ${result.error || '未知错误'}`;
      return `${status} ${toolName}: ${statusText}`;
    }).join('\n');

    if (successCount === 0) {
      finalContent += `抱歉，所有操作都失败了。\n\n执行情况：\n${toolSummary}\n\n请检查网络连接或稍后重试。`;
    } else if (successCount < totalCount) {
      finalContent += `已完成部分操作。\n\n执行情况：\n${toolSummary}\n\n${successCount}/${totalCount} 个操作成功完成。`;
    } else {
      finalContent += `✅ 所有操作已完成。\n\n执行情况：\n${toolSummary}\n\n${successCount}/${totalCount} 个操作成功完成。`;
    }

    return finalContent;
  }
}
