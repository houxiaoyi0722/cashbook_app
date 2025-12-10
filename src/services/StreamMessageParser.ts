/**
 * 流式消息解析器
 * 负责解析流式响应中的标记，包括思考块、工具调用块和文本块
 */
export class StreamMessageParser {
  public buffer: string = '';
  public accumulatedContent: string = '';
  public accumulatedThinking: string = '';
  public toolCalls: Array<{name: string, arguments: any}> = [];

  // 状态变量
  public inThinkingBlock: boolean = false;
  public inToolCallBlock: boolean = false;
  public currentBlockType: 'thinking' | 'tool_calls' | 'text' | 'none' = 'none';
  public currentBlockBuffer: string = '';
  public markCacheNum: number = 0;

  // 标记定义
  private readonly MARKERS = {
    toolCallsStart: '<json>',
    toolCallsEnd: '</json>',
  };

  /**
   * 处理一个数据块，返回解析出的消息
   * @param chunk 数据块
   * @param isFinal 是否为最终块
   * @returns 解析结果
   */
  processChunk(chunk: string, isFinal: boolean = false): {
    content: string;
    thinking: string | null;
    toolCalls: Array<{name: string, arguments: any}>;
  } {

    this.accumulatedContent = '';
    this.accumulatedThinking = '';
    this.toolCalls = [];
    // 出现小于号时需要缓存后6次输出结果来判断是否有标记，一个<json><\json>标记可能会分字符返回
    const lessThanSignIndex = chunk.indexOf('<');
    // 将新块添加到缓冲区
    this.buffer += chunk;

    const tag1 = this.buffer.indexOf(this.MARKERS.toolCallsStart);
    const tag2 = this.buffer.indexOf(this.MARKERS.toolCallsEnd);

    if (tag1 === -1 && tag2 === -1) {
      if (lessThanSignIndex !== -1 || (this.markCacheNum > 0 && this.markCacheNum < 6)) {
        console.log('标签缓冲计数：',this.markCacheNum);
        this.markCacheNum++;
        return {
          content: this.accumulatedContent,
          thinking: this.accumulatedThinking || null,
          toolCalls: this.toolCalls,
        };
      }
    }

    this.markCacheNum = 0;

    // 处理缓冲区
    this.processBuffer(isFinal);

    return {
      content: this.accumulatedContent,
      thinking: this.accumulatedThinking || null,
      toolCalls: this.toolCalls,
    };
  }

  /**
   * 处理缓冲区，提取完整的标记
   * @param isFinal 是否为最终块
   */
  private processBuffer(isFinal: boolean = false): void {
    // 如果不在任何块中，查找所有可能的开始标记
    if (this.currentBlockType === 'none') {
      // 查找所有开始标记的位置
      const markers = [
        { type: 'tool_calls' as const, start: this.MARKERS.toolCallsStart },
      ];

      let earliestIndex = Infinity;
      let selectedMarker = null;

      for (const marker of markers) {
        const index = this.buffer.indexOf(marker.start);
        if (index !== -1 && index < earliestIndex) {
          earliestIndex = index;
          selectedMarker = marker;
        }
      }

      if (selectedMarker) {
        // 找到开始标记，处理标记之前的内容
        const beforeBlock = this.buffer.substring(0, earliestIndex);
        if (beforeBlock) {
          // 如果[TEXT]块存在，将内容添加到accumulatedContent，否则直接添加
          this.accumulatedContent += beforeBlock;
        }

        // 移除开始标记和之前的内容
        this.buffer = this.buffer.substring(earliestIndex + selectedMarker.start.length);
        this.currentBlockType = selectedMarker.type;
        this.currentBlockBuffer = '';

        // 根据块类型设置状态变量
        if (selectedMarker.type === 'tool_calls') {
          this.inToolCallBlock = true;
        }

        // 继续处理剩余缓冲区
        if (this.buffer.length > 0) {
          this.processBuffer(isFinal);
        }
        return;
      }
    }

    // 如果在某个块中，查找对应的结束标记
    if (this.currentBlockType !== 'none') {
      let endMarker = '';
      switch (this.currentBlockType) {
        case 'tool_calls':
          // 尝试新格式结束标记
          endMarker = this.MARKERS.toolCallsEnd;
          break;
      }

      const endIndex = this.buffer.indexOf(endMarker);
      if (endIndex !== -1) {
        // 找到结束标记，提取块内容
        const blockContent = this.buffer.substring(0, endIndex);
        this.currentBlockBuffer += blockContent;

        // 处理完整的块内容
        this.processCompleteBlock(this.currentBlockBuffer,true);

        // 移除块内容和结束标记
        this.buffer = this.buffer.substring(endIndex + endMarker.length);

        // 重置块状态
        this.resetBlockState();

        // 继续处理剩余缓冲区
        if (this.buffer.length > 0) {
          this.processBuffer(isFinal);
        }
      } else if (isFinal) {
        // 如果是最终块且没有结束标记，将剩余内容作为块内容
        if (this.buffer.trim()) {
          this.currentBlockBuffer += this.buffer;
        }

        // 处理完整的块内容
        if (this.currentBlockBuffer.trim()) {
          this.processCompleteBlock(this.currentBlockBuffer, false);
        }

        // 重置状态
        this.buffer = '';
        this.resetBlockState();
      } else {
        // 没有找到结束标记，将整个缓冲区添加到块缓冲区
        this.currentBlockBuffer += this.buffer;
        // 实时返回思考消息
        if (this.currentBlockBuffer.trim()) {
          this.processCompleteBlock(this.currentBlockBuffer, false);
        }
        this.buffer = '';
      }
      return;
    }

    // 如果不在任何块中，且缓冲区有内容，将其作为常规内容
    if (this.currentBlockType === 'none' && this.buffer.length > 0) {
      this.accumulatedContent += this.buffer;
      this.buffer = '';
    }
  }

  /**
   * 处理完整的块内容
   * @param blockContent 块内容
   * @param endMarker 结束标记
   */
  private processCompleteBlock(blockContent: string, endMarker: boolean): void {
    switch (this.currentBlockType) {
      case 'tool_calls':
        // 工具调用块：只有有结束标记时才解析
        if (endMarker) {
          // 工具调用块：尝试解析JSON
          try {
            // 清理内容：移除可能的空白字符
            const cleanedContent = blockContent.trim();
            let parsed;

            // 尝试直接解析JSON
            try {
              parsed = JSON.parse(cleanedContent);
            } catch (e) {
              // 如果直接解析失败，尝试从代码块中提取
              const jsonMatch = cleanedContent.match(/<json>\s*([\s\S]*?)\s*<\/json>/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1].trim());
              } else {
                throw e;
              }
            }

            if (parsed.toolCalls && Array.isArray(parsed.toolCalls)) {
              this.toolCalls = parsed.toolCalls;
              console.log('🔧 解析到工具调用', {
                toolCallCount: this.toolCalls.length,
                toolNames: this.toolCalls.map(t => t.name),
              });
            }
          } catch (error) {
            console.warn('解析工具调用JSON失败:', error, {
              blockContentPreview: blockContent.substring(0, 200),
            });
          }
        }
        break;
    }
  }

  /**
   * 重置块状态
   */
  private resetBlockState(): void {
    this.currentBlockType = 'none';
    this.currentBlockBuffer = '';
    this.inThinkingBlock = false;
    this.inToolCallBlock = false;
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.buffer = '';
    this.accumulatedContent = '';
    this.accumulatedThinking = '';
    this.toolCalls = [];
    this.resetBlockState();
  }

  /**
   * 获取当前缓冲区内容（用于调试）
   * @returns 缓冲区内容
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * 检查是否有未完成的标记
   * @returns 是否有未完成的标记
   */
  hasIncompleteTags(): boolean {
    return this.currentBlockType !== 'none' || this.buffer.length > 0;
  }
}
