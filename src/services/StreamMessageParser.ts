/**
 * 流式消息解析器
 * 负责解析流式响应中的标记，包括思考块、工具调用块和文本块
 */
export class StreamMessageParser {
  public toolCalls: Array<{name: string, arguments: any}> = [];

  // 用于累积 tool_calls 数据流的状态
  private currentToolCalls: Array<{
    index: number;
    id?: string;
    name?: string;
    arguments: string;
    type: 'function';
  }> = [];

  /**
   * 处理一个数据块，返回解析出的消息
   * @param chunk 数据块对象，包含content、thinking和tool_calls字段
   * @param isFinal 是否为最终块
   * @returns 解析结果
   */
  processChunk(chunk: {
    content: string;
    thinking: string;
    tool_calls?: any[] | null;
  }, isFinal: boolean = false): {
    content: string;
    thinking: string | null;
    toolCalls: Array<{name: string, arguments: any}>;
  } {
    // 处理工具调用数据流
    if (chunk.tool_calls && Array.isArray(chunk.tool_calls)) {
      this.processToolCallsChunk(chunk.tool_calls, isFinal);
    }
    // 如果是最终块，确保所有工具调用都被处理
    if (isFinal) {
      this.finalizeToolCalls();
    }
    return {
      content: chunk.content,
      thinking: chunk.thinking || null,
      toolCalls: this.toolCalls,
    };
  }

  /**
   * 处理工具调用数据块
   * @param toolCallsChunk 工具调用数据块
   * @param isFinal 是否为最终块
   */
  private processToolCallsChunk(toolCallsChunk: any[], isFinal: boolean): void {
    for (const toolCallDelta of toolCallsChunk) {
      const index = toolCallDelta.index;

      // 查找或创建当前索引的工具调用
      let currentToolCall = this.currentToolCalls.find(tc => tc.index === index);
      if (!currentToolCall) {
        currentToolCall = {
          index,
          id: toolCallDelta.id,
          name: toolCallDelta.function?.name,
          arguments: '',
          type: 'function',
        };
        this.currentToolCalls.push(currentToolCall);
      }

      // 更新工具调用ID
      if (toolCallDelta.id && !currentToolCall.id) {
        currentToolCall.id = toolCallDelta.id;
      }

      // 更新工具名称
      if (toolCallDelta.function?.name && !currentToolCall.name) {
        currentToolCall.name = toolCallDelta.function.name;
      }

      // 累积参数数据
      if (toolCallDelta.function?.arguments) {
        currentToolCall.arguments += toolCallDelta.function.arguments;
      }

      // 更新类型
      if (toolCallDelta.type) {
        currentToolCall.type = toolCallDelta.type;
      }
    }

    // 如果是最终块，尝试解析完整的工具调用
    if (isFinal) {
      this.finalizeToolCalls();
    }
  }

  /**
   * 完成工具调用的处理，解析完整的参数
   */
  private finalizeToolCalls(): void {
    // 清空之前的工具调用结果
    this.toolCalls = [];

    for (const toolCall of this.currentToolCalls) {
      // 确保有名称和参数
      if (toolCall.name && toolCall.arguments) {
        try {
          // 尝试解析参数为JSON
          const parsedArguments = JSON.parse(toolCall.arguments);

          this.toolCalls.push({
            name: toolCall.name,
            arguments: parsedArguments,
          });

          console.log('🔧 解析到工具调用', {
            name: toolCall.name,
            arguments: parsedArguments,
            index: toolCall.index,
          });
        } catch (error) {
          console.warn('解析工具调用参数失败:', error, {
            name: toolCall.name,
            argumentsPreview: toolCall.arguments.substring(0, 200),
            index: toolCall.index,
          });

          // 如果解析失败，将原始字符串作为参数
          this.toolCalls.push({
            name: toolCall.name,
            arguments: toolCall.arguments,
          });
        }
      } else if (toolCall.name) {
        // 只有名称没有参数的情况
        this.toolCalls.push({
          name: toolCall.name,
          arguments: {},
        });
      }
    }
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.toolCalls = [];
    this.currentToolCalls = [];
  }
}
