// src/services/UserInputHistoryAnalysisService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiService } from './AIService';
// 用户输入记录接口
export interface UserInputRecord {
  id: string;
  text: string;
  timestamp: number;
  bookId?: string | null; // 关联的账本ID，允许null
  category?: string; // 输入分类（可选）
}

// AI整理的建议
export interface AISuggestion {
  id: string;
  suggestion: string;
  createdAt: number;
}

class UserInputHistoryAnalysisService {
  // 存储键
  private readonly USER_INPUTS_KEY = 'user_input_history';
  private readonly AI_SUGGESTIONS_KEY = 'ai_suggestions_default';

  // 配置
  private readonly MAX_HISTORY_SIZE = 50; // 最大历史记录数
  private readonly MIN_INPUTS_FOR_ANALYSIS = 10; // 最少需要10条输入才进行分析
  private isAnalyzing: boolean = false;
  private lastStats: {
    totalRecords: number;
    lastRecordTime: number | null;
    suggestionCount: number;
  } | undefined;

  /**
   * 检查是否需要进行分析
   */
  async checkAndAnalyze(): Promise<boolean> {
    // 防止重复分析
    if (this.isAnalyzing) {
      console.log('分析正在进行中，跳过本次检查');
      return false;
    }

    // 检查是否有足够的输入数据
    const stats = await this.getStatistics();
    if (stats.totalRecords < this.MIN_INPUTS_FOR_ANALYSIS) {
      console.log(`输入记录不足（${stats.totalRecords}/${this.MIN_INPUTS_FOR_ANALYSIS}），跳过分析`);
      return false;
    }

    if (this.lastStats) {
      if (this.lastStats.totalRecords === stats.totalRecords && this.lastStats.lastRecordTime === stats.lastRecordTime) {
        console.log('历史记录未变化，跳过分析');
        return false;
      }
    } else {
      this.lastStats = stats;
    }

    // 开始分析
    this.isAnalyzing = true;
    console.log('开始高频输入分析...');

    try {
      // 发送给AI整理
      await this.sendToAIForSuggestion();
      console.log('AI整理完成，建议已保存');
      // 3. 更新最后分析时间
      this.isAnalyzing = false;
      return true;
    } catch (error) {
      console.error('高频输入分析失败:', error);
      this.isAnalyzing = false;
      return false;
    }
  }

  /**
   * 手动触发分析
   */
  async triggerManualAnalysis(): Promise<boolean> {
    console.log('手动触发高频输入分析...');
    return this.checkAndAnalyze();
  }

  /**
   * 初始化分析器
   */
  async initialize(): Promise<void> {
    console.log('初始化高频输入分析器...');
    // 启动定时检查
    // 每30分钟检查一次是否需要分析
    setInterval(() => {
      this.checkAndAnalyze().catch(error => {
        console.error('定期检查失败:', error);
      });
    }, 3 * 60 * 1000); // 3分钟

    console.log('高频输入分析器定时检查已启动（每3分钟检查一次）');
  }

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
   * 发送高频输入给AI进行整理
   * 使用AIService的新方法callAIForTextGeneration进行API调用
   */
  async sendToAIForSuggestion(): Promise<AISuggestion[]> {
    try {

      const recentInputs = await this.getUserInputHistory();
      // 构建发送给AI的提示
      const prompt = this.buildAIPrompt(recentInputs);

      // 动态导入AIConfigService来获取AI配置
      let aiConfig;
      try {
        const aiConfigModule = await import('./AIConfigService');
        const aiConfigService = aiConfigModule.aiConfigService;

        // 检查AI是否已配置
        const isConfigured = await aiConfigService.isConfigured();
        if (!isConfigured) {
          console.warn('AI未配置，使用默认建议');
          return this.createDefaultSuggestion();
        }

        // 获取聊天模型配置
        aiConfig = await aiConfigService.getSuggestionModelConfig() || await aiConfigService.getChatModelConfig();
        if (!aiConfig) {
          console.warn('无法获取AI配置，使用默认建议');
          return this.createDefaultSuggestion();
        }
      } catch (configError) {
        console.warn('获取AI配置失败，使用默认建议:', configError);
        return this.createDefaultSuggestion();
      }

      // 调用AI服务进行整理
      // 使用新的callAIForTextGeneration方法
      let aiResponseText;
      try {
        console.log('高频分析提示词',prompt);
        // 设置超时时间为30秒
        aiResponseText = await aiService.callAIForTextGeneration(prompt, aiConfig, ['严格遵循提示词'], 600000);
      } catch (serviceError) {
        console.warn('AI服务调用失败，使用默认建议:', serviceError);
        // 如果AI服务失败，返回默认建议
        return this.createDefaultSuggestion();
      }

      // 解析AI返回的建议
      const suggestions = this.parseAIResponse(aiResponseText);

      // 创建建议记录
      const suggestion: AISuggestion[] = suggestions.map(item => {
        return {
          id: `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          suggestion: item,
          createdAt: Date.now(),
        };
      });


      // 保存建议
      await this.saveAISuggestion(suggestion);

      return suggestion;
    } catch (error) {
      console.error('发送高频输入给AI整理失败，返回默认建议:', error);
      // 即使发生错误，也返回默认建议而不是抛出错误
      return this.createDefaultSuggestion();
    }
  }

  /**
   * 保存AI整理的建议
   */
  async saveAISuggestion(suggestion: AISuggestion[]): Promise<void> {
    try {
      // 获取现有建议
      const existingSuggestions = await this.getAISuggestions();

      // 添加新建议
      const updatedSuggestions = [...suggestion, ...existingSuggestions];

      // 限制建议数量（保留最新的20个）
      const trimmedSuggestions = updatedSuggestions.slice(0, 20);

      await AsyncStorage.setItem(this.AI_SUGGESTIONS_KEY, JSON.stringify(trimmedSuggestions));
    } catch (error) {
      console.error('保存高频建议失败:', error);
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
      return suggestions.sort((a, b) => b.createdAt - a.createdAt); // 按更新时间倒序排列
    } catch (error) {
      console.error('获取高频建议失败:', error);
      return [];
    }
  }

  /**
   * 获取最新AI整理的建议
   */
  async getLatestAISuggestions(limit: number): Promise<AISuggestion[]|undefined> {
    try {
      const suggestionsStr = await AsyncStorage.getItem(this.AI_SUGGESTIONS_KEY);
      if (!suggestionsStr) {
        return undefined;
      }

      const suggestions = JSON.parse(suggestionsStr) as AISuggestion[];
      return suggestions.sort((a, b) => b.createdAt - a.createdAt).slice(0,limit); // 按更新时间倒序排列
    } catch (error) {
      console.error('获取高频建议失败:', error);
      return undefined;
    }
  }

  /**
   * 构建发送给AI的提示
   */
  private buildAIPrompt(userInputRecord: UserInputRecord[]): string {
    let userInput = '';
    userInputRecord.forEach((input, index) => {
      userInput += `${index + 1}. "${input.text}"\n`;
    });
    let prompt = `# 用户历史输入模式分析器
## 任务定义
分析用户最近的${userInputRecord.length}条输入记录，识别用户的常用操作模式，提取3-10条最具代表性的高频输入模式，用于个性化提示建议生成。
## 分析要求
1. **模式识别优先**：不直接生成建议，而是提取用户最常用的输入模式或意图类别
2. **频率权重分析**：基于出现频率、时间远近（近期权重更高）和操作复杂度综合评估
3. **模式抽象层级**：
   - 具体操作模式（如"记一笔午餐支出"）
   - 功能类别模式（如"查询统计"）
   - 参数偏好模式（如"常使用具体日期筛选"）
4. **多样性覆盖**：确保提取的模式覆盖用户使用的主要功能模块
## 输出格式要求
- 直接返回分析结果，不添加解释性文字
- 每行一个高频模式描述，格式：\`[模式分类] 具体模式描述\`
- 按使用频率从高到低排列
- 使用简洁中文，长度不超过20字
## 模式分类标签
- \`记录流水\`：创建或更新流水记录相关
- \`查询统计\`：查看数据、统计分析相关  
- \`预算管理\`：预算设置、查询相关
- \`固定支出\`：固定支出管理相关
- \`数据维护\`：重复检测、平账等数据维护
- \`选项查询\`：获取支付方式、归属人等选项列表
## 处理逻辑
1. **聚类分析**：将相似输入归类（如"记一笔午餐"、"记晚餐"归为餐饮记录）
2. **意图提取**：从具体输入中提取核心意图（如"查看本月支出"→月度统计查询）
3. **参数习惯识别**：注意用户偏好的参数表达方式（如是否常指定日期、金额等）
4. **功能覆盖度**：确保至少覆盖用户使用的2-3个主要功能领域
## 示例分析
**输入列表**：
1. "记一笔午餐50元"
2. "查看今天支出"
3. "记一笔交通费20"
4. "本月预算多少"
5. "昨天花了多少"
**输出**：
[记录流水] 餐饮类小额支出记录
[查询统计] 当日/当月支出查询
[预算管理] 月度预算查询
[记录流水] 交通费用记录
---

**待分析的用户输入列表（时间倒序，最近${userInputRecord.length}条）**：
${userInput}

**请按上述要求分析并返回高频模式**：`;
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
  private createDefaultSuggestion(): AISuggestion[] {
    return this.getDefaultSuggestions().map(item => {
      return {
        id: `default_suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        suggestion: item,
        createdAt: Date.now(),
      };
    });
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

  /**
   * 重置高频输入历史
   */
  async resetSuggestions() {
    try {
      await AsyncStorage.removeItem(this.AI_SUGGESTIONS_KEY);
      await AsyncStorage.removeItem(this.USER_INPUTS_KEY);
    } catch (error) {
      console.error('重置高频输入历史失败:', error);
    }
  }
}

// 导出单例
export const userInputHistoryAnalysisService = new UserInputHistoryAnalysisService();
