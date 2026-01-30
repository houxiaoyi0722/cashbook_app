// src/services/UserInputAnalysisManager.ts
import {AISuggestion, userInputHistoryAnalysisService} from './UserInputHistoryAnalysisService.ts';

/**
 * 用户输入分析管理器
 * 负责协调用户输入历史记录、高频输入分析和AI整理功能
 */
class UserInputAnalysisManager {
  private isInitialized: boolean = false;

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('用户输入分析管理器已经初始化');
      return;
    }

    try {
      console.log('初始化用户输入分析管理器...');

      // 1. 初始化高频输入分析器
      await userInputHistoryAnalysisService.initialize();

      // 2. 检查是否有足够的数据进行初始分析
      const stats = await userInputHistoryAnalysisService.getStatistics();
      console.log('用户输入统计:', stats);

      if (stats.totalRecords >= 10) {
        // 有足够的数据，立即进行一次分析
        console.log('有足够的历史数据，立即进行初始分析...');
        await userInputHistoryAnalysisService.triggerManualAnalysis();
      } else {
        console.log(`历史数据不足（${stats.totalRecords}/10），跳过初始分析`);
      }

      this.isInitialized = true;
      console.log('用户输入分析管理器初始化完成');
    } catch (error) {
      console.error('用户输入分析管理器初始化失败:', error);
      // 即使初始化失败，也不影响主要功能
    }
  }

  /**
   * 记录用户输入
   */
  async recordUserInput(text: string, bookId?: string | null, category?: string): Promise<void> {
    try {
      // 将 null 转换为 undefined，以匹配 userInputHistoryService.recordUserInput 的签名
      const bookIdForRecord = bookId === null ? undefined : bookId;
      // 记录到历史
      await userInputHistoryAnalysisService.recordUserInput(text, bookIdForRecord, category);

      // 检查是否需要立即分析（例如，当达到一定数量时）
      const stats = await userInputHistoryAnalysisService.getStatistics();
      if (stats.totalRecords % 10 === 0) {
        // 每记录10条输入，检查一次是否需要分析
        console.log(`已记录${stats.totalRecords}条输入，检查是否需要分析...`);
        await userInputHistoryAnalysisService.checkAndAnalyze();
      } else {
        console.log('未满足条件...');
      }
    } catch (error) {
      console.warn('记录用户输入失败:', error);
      // 不阻止主要流程
    }
  }

  /**
   * 获取AI整理的建议
   */
  async getAISuggestions(limit: number): Promise<AISuggestion[] | undefined> {
    return await userInputHistoryAnalysisService.getLatestAISuggestions(limit);
  }
}

// 导出单例
export const userInputAnalysisManager = new UserInputAnalysisManager();
