// src/services/UserInputHistoryService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// 用户输入记录接口
export interface UserInputRecord {
  id: string;
  text: string;
  timestamp: number;
  bookId?: string | null; // 关联的账本ID，允许null
  category?: string; // 输入分类（可选）
}

// 高频输入分析结果
export interface FrequentInputAnalysis {
  frequentInputs: Array<{
    text: string;
    count: number;
    frequency: number; // 频率（次数/天）
    lastUsed: number;
  }>;
  totalInputs: number;
  uniqueInputs: number;
}

// AI整理的建议
export interface AISuggestion {
  id: string;
  suggestions: string[];
  createdAt: number;
  updatedAt: number;
}

class UserInputHistoryService {
  // 存储键
  private readonly USER_INPUTS_KEY = 'user_input_history';
  private readonly FREQUENT_INPUTS_KEY = 'frequent_inputs_analysis';
  private readonly AI_SUGGESTIONS_KEY = 'ai_suggestions_default';

  // 配置
  private readonly MAX_HISTORY_SIZE = 50; // 最大历史记录数

  /**
   * 记录用户输入
   */
  async recordUserInput(text: string, bookId?: string | null, category?: string): Promise<UserInputRecord> {
    try {
      // 获取现有历史记录
      const existingHistory = await this.getUserInputHistory();

      // 创建新记录
      const newRecord: UserInputRecord = {
        id: `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: text.trim(),
        timestamp: Date.now(),
        bookId,
        category,
      };

      // 添加到历史记录开头（最新的在前面）
      const updatedHistory = [newRecord, ...existingHistory];

      // 限制历史记录大小
      const trimmedHistory = updatedHistory.slice(0, this.MAX_HISTORY_SIZE);

      // 保存到存储
      await AsyncStorage.setItem(this.USER_INPUTS_KEY, JSON.stringify(trimmedHistory));

      console.log(`已记录用户输入: "${text.substring(0, 30)}..."`);
      return newRecord;
    } catch (error) {
      console.error('记录用户输入失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户输入历史记录
   */
  async getUserInputHistory(): Promise<UserInputRecord[]> {
    try {
      const historyStr = await AsyncStorage.getItem(this.USER_INPUTS_KEY);
      if (!historyStr) {
        return [];
      }

      const history = JSON.parse(historyStr) as UserInputRecord[];
      return history.sort((a, b) => b.timestamp - a.timestamp); // 按时间倒序排列
    } catch (error) {
      console.error('获取用户输入历史失败:', error);
      return [];
    }
  }

  /**
   * 分析高频输入
   */
  async analyzeFrequentInputs(): Promise<FrequentInputAnalysis> {
    try {
      const recentInputs = await this.getUserInputHistory();
      if (recentInputs.length === 0) {
        return {
          frequentInputs: [],
          totalInputs: 0,
          uniqueInputs: 0,
        };
      }
      console.log('recentInputs',recentInputs);
      // 统计输入频率
      const inputCounts: Record<string, { count: number; lastUsed: number; text: string }> = {};

      recentInputs.forEach(record => {
        const normalizedText = this.normalizeInputText(record.text);
        console.log('normalizedText',normalizedText);
        if (!inputCounts[normalizedText]) {
          inputCounts[normalizedText] = {
            count: 0,
            lastUsed: record.timestamp,
            text: record.text,
          };
        }
        inputCounts[normalizedText].count++;
        if (record.timestamp > inputCounts[normalizedText].lastUsed) {
          inputCounts[normalizedText].lastUsed = record.timestamp;
        }
      });

      console.log('inputCounts',inputCounts);
      // 转换为数组并排序（按频率降序）
      const frequentInputs = Object.entries(inputCounts)
        .map(([normalizedText, data]) => ({
          text: data.text,
          count: data.count,
          frequency: data.count,
          lastUsed: data.lastUsed,
        }))
        .sort((a, b) => {
          // 先按频率排序，频率相同按最近使用时间排序
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return b.lastUsed - a.lastUsed;
        })
        .slice(0, 10); // 取前10个高频输入
      console.log('frequentInputs',frequentInputs);
      // 保存分析结果
      const analysis: FrequentInputAnalysis = {
        frequentInputs,
        totalInputs: recentInputs.length,
        uniqueInputs: Object.keys(inputCounts).length,
      };

      console.log('analysis',analysis);


      await AsyncStorage.setItem(this.FREQUENT_INPUTS_KEY, JSON.stringify(analysis));

      return analysis;
    } catch (error) {
      console.error('分析高频输入失败:', error);
      throw error;
    }
  }

  /**
   * 获取最近的高频输入分析结果
   * @param bookId 可选的账本ID，用于筛选特定账本的记录
   * @param limit 限制返回的数量
   */
  async getRecentFrequentInputs(bookId?: string | null, limit: number = 10): Promise<Array<{text: string, count: number, frequency: number}>> {
    // 将 null 转换为 undefined
    const bookIdForQuery = bookId === null ? undefined : bookId;
    try {
      // 首先获取所有历史记录
      const history = await this.getUserInputHistory();

      // 根据bookId筛选记录
      const filteredHistory = bookIdForQuery
        ? history.filter(record => record.bookId === bookIdForQuery)
        : history;

      if (filteredHistory.length === 0) {
        return [];
      }

      // 统计最近30天的记录
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      const recentInputs = filteredHistory.filter(record => record.timestamp >= thirtyDaysAgo);

      if (recentInputs.length === 0) {
        return [];
      }

      // 统计输入频率
      const inputCounts: Record<string, { count: number; lastUsed: number; text: string }> = {};

      recentInputs.forEach(record => {
        const normalizedText = this.normalizeInputText(record.text);
        if (!inputCounts[normalizedText]) {
          inputCounts[normalizedText] = {
            count: 0,
            lastUsed: record.timestamp,
            text: record.text,
          };
        }
        inputCounts[normalizedText].count++;
        if (record.timestamp > inputCounts[normalizedText].lastUsed) {
          inputCounts[normalizedText].lastUsed = record.timestamp;
        }
      });

      // 转换为数组并排序（按频率降序）
      const frequentInputs = Object.entries(inputCounts)
        .map(([normalizedText, data]) => ({
          text: data.text,
          count: data.count,
          frequency: data.count / 30, // 30天内的平均频率
          lastUsed: data.lastUsed,
        }))
        .sort((a, b) => {
          // 先按频率排序，频率相同按最近使用时间排序
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return b.lastUsed - a.lastUsed;
        })
        .slice(0, limit);

      return frequentInputs;
    } catch (error) {
      console.error('获取高频输入分析结果失败:', error);
      return [];
    }
  }

  /**
   * 发送高频输入给AI进行整理
   */
  async sendToAIForSuggestion(
    frequentInputs: FrequentInputAnalysis,
    aiService: any
  ): Promise<AISuggestion> {
    try {
      // 构建发送给AI的提示
      const prompt = this.buildAIPrompt(frequentInputs);

      // 调用AI服务进行整理
      // 注意：这里需要根据实际的AI服务接口进行调整
      // 使用Promise.race添加超时机制，防止长时间等待
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI服务响应超时')), 30000); // 30秒超时
      });

      // 尝试调用AI服务
      let aiResponse;
      try {
        aiResponse = await Promise.race([
          aiService.sendMessage(prompt),
          timeoutPromise,
        ]);
      } catch (serviceError) {
        console.warn('AI服务调用失败，使用默认建议:', serviceError);
        // 如果AI服务失败，返回默认建议
        return this.createDefaultSuggestion(frequentInputs);
      }

      // 解析AI返回的建议
      const suggestions = this.parseAIResponse(aiResponse);

      // 如果解析出的建议为空，使用默认建议
      const finalSuggestions = suggestions.length > 0
        ? suggestions
        : this.getDefaultSuggestions();

      // 创建建议记录
      const suggestion: AISuggestion = {
        id: `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        suggestions: finalSuggestions,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 保存建议
      await this.saveAISuggestion(suggestion);

      return suggestion;
    } catch (error) {
      console.error('发送高频输入给AI整理失败，返回默认建议:', error);
      // 即使发生错误，也返回默认建议而不是抛出错误
      return this.createDefaultSuggestion(frequentInputs);
    }
  }

  /**
   * 保存AI整理的建议
   */
  async saveAISuggestion(suggestion: AISuggestion): Promise<void> {
    try {
      // 获取现有建议
      const existingSuggestions = await this.getAISuggestions();

      // 添加新建议
      const updatedSuggestions = [suggestion, ...existingSuggestions];

      // 限制建议数量（保留最新的5个）
      const trimmedSuggestions = updatedSuggestions.slice(0, 5);

      await AsyncStorage.setItem(this.AI_SUGGESTIONS_KEY, JSON.stringify(trimmedSuggestions));
    } catch (error) {
      console.error('保存AI建议失败:', error);
      throw error;
    }
  }

  /**
   * 获取AI整理的建议
   */
  async getAISuggestions(): Promise<AISuggestion[]> {
    try {
      const suggestionsStr = await AsyncStorage.getItem(this.AI_SUGGESTIONS_KEY);
      if (!suggestionsStr) {
        return [];
      }

      const suggestions = JSON.parse(suggestionsStr) as AISuggestion[];
      return suggestions.sort((a, b) => b.updatedAt - a.updatedAt); // 按更新时间倒序排列
    } catch (error) {
      console.error('获取AI建议失败:', error);
      return [];
    }
  }

  /**
   * 构建发送给AI的提示
   */
  private buildAIPrompt(frequentInputs: FrequentInputAnalysis): string {
    const { frequentInputs: inputs, totalInputs, uniqueInputs } = frequentInputs;

    let prompt = '请分析以下用户输入历史，并整理出最有用的默认建议（3-10条）：\n\n';
    prompt += `总输入次数：${totalInputs}\n`;
    prompt += `唯一输入数量：${uniqueInputs}\n\n`;
    prompt += '高频输入列表：\n';

    inputs.forEach((input, index) => {
      prompt += `${index + 1}. "${input.text}" (出现${input.count}次，频率${input.frequency.toFixed(2)}次/天)\n`;
    });

    prompt += '\n请根据以上高频输入，分析用户的常用需求和习惯，整理出3-10条最相关的默认建议。\n';
    prompt += '建议应该：\n';
    prompt += '1. 基于用户的实际输入模式\n';
    prompt += '2. 简洁明了，易于理解\n';
    prompt += '3. 具有实用性和可操作性\n';
    prompt += '4. 格式为清晰的列表项\n\n';
    prompt += '请直接返回建议内容，每行一条建议，不要添加额外说明。';

    return prompt;
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(aiResponse: any): string[] {
    try {
      let responseText = '';

      // 处理不同类型的AI响应格式
      if (typeof aiResponse === 'string') {
        responseText = aiResponse;
      } else if (aiResponse && typeof aiResponse === 'object') {
        // 尝试从不同字段获取文本内容
        responseText = aiResponse.text || aiResponse.content || aiResponse.message || '';

        // 如果响应包含messages数组，尝试从中提取文本
        if (!responseText && aiResponse.messages && Array.isArray(aiResponse.messages)) {
          const textMessages = aiResponse.messages.filter((msg: any) =>
            msg.type === 'text' || msg.content
          );
          if (textMessages.length > 0) {
            responseText = textMessages.map((msg: any) =>
              msg.content || msg.text || ''
            ).join('\n');
          }
        }
      }

      if (!responseText) {
        console.warn('AI响应中没有找到文本内容:', aiResponse);
        return this.getDefaultSuggestions();
      }

      // 按行分割，过滤空行和编号
      const lines = responseText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          // 移除行首的编号（如 "1. "、"• "、"* "等）
          return line.replace(/^(\d+[\.、)\]\s]*\s*|[-•*、]\s*)/, '');
        })
        .filter(line => line.length > 0);

      // 取前5条建议
      return lines.slice(0, 5);
    } catch (error) {
      console.error('解析AI响应失败:', error);
      return this.getDefaultSuggestions();
    }
  }

  /**
   * 获取默认建议列表
   */
  private getDefaultSuggestions(): string[] {
    return [
      '记录一笔收支流水',
      '查看本月消费统计',
      '分析消费习惯',
      '设置预算提醒',
      '导出账单数据',
      '查看年度收入总额',
      '查找重复的流水记录',
      '查看可以平账的流水',
    ];
  }

  /**
   * 创建默认建议
   */
  private createDefaultSuggestion(frequentInputs: FrequentInputAnalysis): AISuggestion {
    return {
      id: `default_suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      suggestions: this.getDefaultSuggestions(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * 标准化输入文本（用于频率统计）
   */
  private normalizeInputText(text: string): string {
    // 移除多余空格，转换为小写，移除标点符号
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, '') // 移除标点符号，保留中文和字母数字
      .replace(/\s+/g, ' ') // 合并多个空格
      .trim();
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    totalRecords: number;
    lastRecordTime: number | null;
    suggestionCount: number;
  }> {
    try {
      const history = await this.getUserInputHistory();
      const suggestions = await this.getAISuggestions();

      return {
        totalRecords: history.length,
        lastRecordTime: history.length > 0 ? history[0].timestamp : null,
        suggestionCount: suggestions.length,
      };
    } catch (error) {
      console.error('获取统计信息失败:', error);
      return {
        totalRecords: 0,
        lastRecordTime: null,
        suggestionCount: 0,
      };
    }
  }
}

// 导出单例
export const userInputHistoryService = new UserInputHistoryService();
export default userInputHistoryService;
