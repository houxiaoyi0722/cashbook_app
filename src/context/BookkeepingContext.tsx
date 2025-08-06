import React, {createContext, useContext, useState, useCallback, useEffect} from 'react';
import { Book, Flow, DailyData, CalendarMark, AnalyticsItem } from '../types';
import api from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import serverConfigManager from '../services/serverConfig.ts';
import {eventBus} from '../navigation';
import LocalDataService from '../services/LocalDataService';


// 记账上下文类型
interface BookkeepingContextType {
  isLoading: boolean;
  currentBook: Book | null;
  remoteAttributions: string[],
  remotePayType: string[],
  updateCurrentBook: (book: Book | null) => Promise<void>;
  fetchCalendarData: (bookId: string, month: string) => Promise<{ dailyData: DailyData; calendarMarks: CalendarMark }>;
  fetchDayFlows: (bookId: string, date: string) => Promise<Flow[]>;
  addFlow: (flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Flow>;
  updateFlow: (data: Partial<Omit<Flow,'createdAt' | 'updatedAt'>>) => Promise<Flow>;
  deleteFlow: (flowId: number) => Promise<void>;
}

// 创建记账上下文
const BookkeepingContext = createContext<BookkeepingContextType | undefined>(undefined);
const STORAGE_KEY = 'current_book';

// 记账上下文提供者
export const BookkeepingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [remoteAttributions, setRemoteAttributions] = useState<string[]>([]);
  const [remotePayType, setRemotePayType] = useState<string[]>([]);

  // 检查是否为离线模式
  const checkOfflineMode = useCallback(async (): Promise<boolean> => {
    try {
      const offlineMode = await AsyncStorage.getItem('offline_mode');
      return offlineMode === 'true';
    } catch (error) {
      console.error('检查离线模式失败:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    // 从本地存储加载当前账本
    const loadCurrentBook = async () => {
      try {
        const currentServer = await serverConfigManager.getCurrentServer();
        const savedBook = await AsyncStorage.getItem(`${STORAGE_KEY}:${currentServer?.id}`);
        if (savedBook) {
          let parse = JSON.parse(savedBook);
          setCurrentBook(parse);
        } else{
          setCurrentBook(null);
        }
      } catch (error) {
        console.error('加载当前账本失败', error);
      }
    };

    loadCurrentBook();

    eventBus.addListener('refreshCurrentBook', loadCurrentBook);
    return () => {
      eventBus.removeAllListeners('refreshCurrentBook');
    };
  }, []);
  // 更新当前账本
  const updateCurrentBook = useCallback(async (currentBook: Book | null): Promise<any> => {
    if (currentBook) {
      const currentServer = await serverConfigManager.getCurrentServer();
      await AsyncStorage.setItem(`${STORAGE_KEY}:${currentServer?.id}`,JSON.stringify(currentBook));
      setCurrentBook(currentBook);
    }
  },[]);

  // 获取日历数据
  const fetchCalendarData = useCallback(async () => {
    if (!currentBook) {return { dailyData: {}, calendarMarks: {} };}

    // 检查离线模式
    const isOfflineMode = await checkOfflineMode();
    if (isOfflineMode) {
      console.log('离线模式：跳过日历数据获取');
      return { dailyData: {}, calendarMarks: {} };
    }

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
            selected: false,
            marked: true,
            dotColor: item.outSum > 1000 ? '#f44336' : item.outSum > 100 ? '#ec8808' : '#4caf50',
          };
        });
      }

      const response1 = await api.flow.attributions(currentBook.bookId);
      setRemoteAttributions(response1.d);

      const response2 = await api.flow.payType(currentBook.bookId);
      setRemotePayType(response2.d.map(item => item.payType));

      return { dailyData, calendarMarks };
    } catch (error) {
      console.error('获取日历数据失败', error instanceof Error ? error.message : String(error));
      return { dailyData: {}, calendarMarks: {} };
    }
  }, [currentBook, checkOfflineMode]);

  // 获取某天的流水记录
  const fetchDayFlows = useCallback(async (date: string): Promise<Flow[]> => {
    if (!currentBook) {return [];}

    // 检查离线模式
    const isOfflineMode = await checkOfflineMode();
    if (isOfflineMode) {
      console.log('离线模式：跳过日流水数据获取');
      return [];
    }

    try {
      setIsLoading(true);
      const response = await api.flow.page({
        bookId: currentBook.bookId,
        moneySort: 'desc',
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
  }, [currentBook, checkOfflineMode]);

  // 添加流水记录
  const addFlow = useCallback(async (flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Flow> => {
    if (!currentBook) {throw new Error('未选择账本');}

    const isOfflineMode = await checkOfflineMode();

    if (isOfflineMode) {
      console.log('离线模式：保存流水到本地');
      console.log('流水数据:', flow);
      const result = await LocalDataService.addLocalFlow(flow);
      console.log('保存结果:', result);

      // 发送本地数据更新事件
      eventBus.emit('refreshLocalData');

      return flow as Flow; // 返回本地数据
    }

    console.log('在线模式：保存流水到服务器');
    const response = await api.flow.create({
      ...flow,
      bookId: currentBook.bookId,
    });

    if (response.c === 200) {
      return response.d;
    }
    throw new Error(response.m);
  }, [currentBook, checkOfflineMode]);

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

  return (
    <BookkeepingContext.Provider
      value={{
        isLoading,
        currentBook,
        remoteAttributions,
        remotePayType,
        updateCurrentBook,
        fetchCalendarData,
        fetchDayFlows,
        addFlow,
        updateFlow,
        deleteFlow,
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
