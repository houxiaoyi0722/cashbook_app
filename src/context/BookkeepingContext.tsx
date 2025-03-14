import React, {createContext, useContext, useState, useCallback, useEffect} from 'react';
import { Book, Flow, DailyData, CalendarMark, AnalyticsItem } from '../types';
import api from '../services/api';
import AsyncStorage from "@react-native-async-storage/async-storage";


// 记账上下文类型
interface BookkeepingContextType {
  isLoading: boolean;
  currentBook: Book | null;
  updateCurrentBook: (currentBook: Book) => Promise<void>;
  fetchCalendarData: () => Promise<{
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
const STORAGE_KEY = 'current_book';

// 记账上下文提供者
export const BookkeepingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(false);


  useEffect(() => {
    // 从本地存储加载当前账本
    const loadCurrentBook = async () => {
      try {
        const savedBook = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedBook) {
          setCurrentBook(JSON.parse(savedBook));
        }
      } catch (error) {
        console.error('加载当前账本失败', error);
      }
    };

    loadCurrentBook();
  }, [setCurrentBook]);
  // 更新当前账本
  const updateCurrentBook = useCallback(async (currentBook: Book): Promise<any> => {
    if (currentBook) {
      await AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(currentBook));
      setCurrentBook(currentBook);
    }
  },[setCurrentBook]);

  // 获取日历数据
  const fetchCalendarData = useCallback(async () => {
    if (!currentBook) return { dailyData: {}, calendarMarks: {} };

    try {
      // 使用 analytics.daily 替代 calendar API
      const response = await api.analytics.daily(currentBook.bookId);
      const dailyData: DailyData = {};
      const calendarMarks: CalendarMark = {};

      if (response.c === 200 && response.d) {
        response.d.forEach((item: AnalyticsItem) => {
          const date = item.type;
          // 只处理数据
          dailyData[date] = {
            inSum: item.inSum,
            outSum: item.outSum,
            zeroSum: item.zeroSum,
          };

          calendarMarks[date] = {
            marked: true,
            dotColor: item.outSum > 1000 ? '#f44336' : item.outSum > 100 ? '#ec8808' : '#4caf50',
          };
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
  }, [currentBook?.bookId]);

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
        updateCurrentBook,
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
