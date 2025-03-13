import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Book, Flow, DailyData, CalendarMark, ApiResponse, PageResponse, AnalyticsItem } from '../types';
import { useBook } from './BookContext';
import api from '../services/api';
import moment from 'moment';

// 记账上下文类型
interface BookkeepingContextType {
  isLoading: boolean;
  currentBook: Book | null;
  getFlowsByMonth: (month: string) => Promise<Flow[]>;
  fetchCalendarData: (month: string) => Promise<{
    dailyData: DailyData;
    calendarMarks: CalendarMark;
  }>;
  fetchDayFlows: (date: string) => Promise<Flow[]>;
  addFlow: (flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Flow>;
  updateFlow: (data: Partial<Omit<Flow,'createdAt' | 'updatedAt'>>) => Promise<Flow>;
  deleteFlow: (flowId: number) => Promise<void>;
  getFlowById: (flowId: number) => Promise<Flow>;
}

// 创建记账上下文
const BookkeepingContext = createContext<BookkeepingContextType | undefined>(undefined);

// 记账上下文提供者
export const BookkeepingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentBook } = useBook();
  const [isLoading, setIsLoading] = useState(false);

  // 获取指定月份的流水记录
  const getFlowsByMonth = useCallback(async (month: string): Promise<Flow[]> => {
    if (!currentBook) return [];

    try {
      setIsLoading(true);
      const startDate = `${month}-01`;
      const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');

      const response = await api.flow.page({
        bookId: currentBook.bookId,
        pageNum: 1,
        pageSize: 20,
        startDay: startDate,
        endDay: endDate,
      });

      if (response.c === 200 && response.d) {
        return response.d.data;
      }
      return [];
    } catch (error) {
      console.error('获取流水失败', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [currentBook]);

  // 获取日历数据
  const fetchCalendarData = useCallback(async (month: string) => {
    if (!currentBook) return { dailyData: {}, calendarMarks: {} };

    try {
      // 注意：这里不设置全局 loading 状态，而是让调用者处理
      // setIsLoading(true);

      // 使用 analytics.daily 替代 calendar API
      const response = await api.analytics.daily(currentBook.bookId);
      const dailyData: DailyData = {};
      const calendarMarks: CalendarMark = {};

      if (response.c === 200 && response.d) {
        response.d.forEach((item: AnalyticsItem) => {
          const date = item.type;
          // 只处理当前月份的数据
          if (date.startsWith(month)) {
            dailyData[date] = {
              inSum: item.inSum,
              outSum: item.outSum,
              zeroSum: item.zeroSum,
            };

            calendarMarks[date] = {
              marked: true,
              dotColor: item.outSum > 0 ? '#f44336' : '#4caf50',
            };
          }
        });
      }

      return { dailyData, calendarMarks };
    } catch (error) {
      console.error('获取日历数据失败', error instanceof Error ? error.message : String(error));
      return { dailyData: {}, calendarMarks: {} };
    } finally {
      // setIsLoading(false);
    }
  }, [currentBook]);

  // 获取某天的流水记录
  const fetchDayFlows = useCallback(async (date: string): Promise<Flow[]> => {
    if (!currentBook) return [];

    try {
      setIsLoading(true);
      const response = await api.flow.page({
        bookId: currentBook.bookId,
        pageNum: 1,
        pageSize: 100,
        startDay: date,
        endDay: date,
      });

      if (response.c === 200 && response.d) {
        return response.d.data;
      }
      return [];
    } catch (error) {
      console.error('获取日流水详情失败', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [currentBook]);

  // 添加流水记录
  const addFlow = useCallback(async (flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Flow> => {
    if (!currentBook) throw new Error('未选择账本');

    const response = await api.flow.create({
      ...flow,
      bookId: currentBook.id,
    });

    if (response.c === 200) {
      return response.d;
    }
    throw new Error(response.m);
  }, [currentBook]);

  // 更新流水记录
  const updateFlow = useCallback(async (data: Partial<Omit<Flow,'createdAt' | 'updatedAt'>>): Promise<Flow> => {
    const response = await api.flow.update(data);

    if (response.c === 200) {
      return response.d;
    }
    throw new Error(response.m);
  }, []);

  // 删除流水记录
  const deleteFlow = useCallback(async (flowId: number): Promise<void> => {
    const response = await api.flow.delete(flowId,currentBook?.bookId!);

    if (response.c !== 200) {
      throw new Error(response.m);
    }
  }, []);

  // 获取流水记录详情
  const getFlowById = useCallback(async (flowId: number): Promise<Flow> => {
    const response = await api.flow.get(flowId);

    if (response.c === 200) {
      return response.d;
    }
    throw new Error(response.m);
  }, []);

  return (
    <BookkeepingContext.Provider
      value={{
        isLoading,
        currentBook,
        getFlowsByMonth,
        fetchCalendarData,
        fetchDayFlows,
        addFlow,
        updateFlow,
        deleteFlow,
        getFlowById,
      }}
    >
      {children}
    </BookkeepingContext.Provider>
  );
};

// 使用记账上下文的Hook
export const useBookkeeping = () => {
  const context = useContext(BookkeepingContext);
  if (context === undefined) {
    throw new Error('useBookkeeping必须在BookkeepingProvider内部使用');
  }
  return context;
};
