import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiService } from '../../services/AIService';
import { aiConfigService } from '../../services/AIConfigService';
import { useTheme, getColors } from '../../context/ThemeContext';
import BookSelector from '../../components/BookSelector';
import {useBookkeeping} from '../../context/BookkeepingContext.tsx';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  loading?: boolean;
  error?: boolean;
  // 新增字段
  type?: 'text' | 'tool_call' | 'thinking' | 'tool_result';
  toolDetails?: {
    name: string;
    arguments: any;
    result?: any;
    success?: boolean;
    error?: string;
    duration?: number;
  };
  thinkingContent?: string;
  collapsed?: boolean;
  metadata?: {
    [key: string]: any;
  };
}

// 配置状态缓存
const CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

interface AIChatScreenProps {
  navigation?: any;
}

const AIChatScreen: React.FC<AIChatScreenProps> = ({ navigation }) => {
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  // 获取当前账本
  const { currentBook } = useBookkeeping();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: '你好！我是你的记账助手，可以帮你：\n• 记录收支流水\n• 查询账单记录\n• 分析消费习惯\n• 提供省钱建议\n\n试试对我说："记一笔午餐支出50元" 或 "查看本月消费统计"',
      isUser: false,
      timestamp: new Date(),
    },
  ]);

  // 用于跟踪当前账本ID，防止重复加载
  const currentBookIdRef = useRef<string | null>(null);

  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [checkingConfig, setCheckingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const shouldIgnoreResponseRef = useRef(false);
  const currentProcessingIdRef = useRef<string | null>(null);

  // 使用 useRef 缓存配置状态和检查时间
  const configCacheRef = useRef<{
    isConfigured: boolean | null;
    lastChecked: number | null;
    isChecking: boolean;
  }>({
    isConfigured: null,
    lastChecked: null,
    isChecking: false,
  });

  // 保存当前账本的聊天记录
  const saveChatForCurrentBook = useCallback(async (bookId: string, chatMessages: Message[]) => {
    if (!bookId) {return;}

    try {
      const storageKey = `ai_chat_${bookId}`;
      const chatData = JSON.stringify(chatMessages);
      await AsyncStorage.setItem(storageKey, chatData);
      console.log(`已保存账本 ${bookId} 的聊天记录，消息数：${chatMessages.length}`);
    } catch (error) {
      console.error('保存聊天记录失败:', error);
    }
  }, []);

  // 加载指定账本的聊天记录
  const loadChatForBook = useCallback(async (bookId: string): Promise<Message[]> => {
    if (!bookId) {
      return [
        {
          id: '1',
          text: '你好！我是你的记账助手，可以帮你：\n• 记录收支流水\n• 查询账单记录\n• 分析消费习惯\n• 提供省钱建议\n\n试试对我说："记一笔午餐支出50元" 或 "查看本月消费统计"',
          isUser: false,
          timestamp: new Date(),
        },
      ];
    }

    try {
      const storageKey = `ai_chat_${bookId}`;
      const chatData = await AsyncStorage.getItem(storageKey);

      if (chatData) {
        const parsedMessages: Message[] = JSON.parse(chatData);
        // 确保时间戳是Date对象
        const messagesWithDates = parsedMessages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        console.log(`已加载账本 ${bookId} 的聊天记录，消息数：${messagesWithDates.length}`);
        return messagesWithDates;
      }
    } catch (error) {
      console.error('加载聊天记录失败:', error);
    }

    // 如果没有保存的记录，返回默认消息
    return [
      {
        id: '1',
        text: '你好！我是你的记账助手，可以帮你：\n• 记录收支流水\n• 查询账单记录\n• 分析消费习惯\n• 提供省钱建议\n\n试试对我说："记一笔午餐支出50元" 或 "查看本月消费统计"',
        isUser: false,
        timestamp: new Date(),
      },
    ];
  }, []);

  // 防抖函数
  const debounce = useCallback((func: Function, delay: number) => {
    // @ts-ignore
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }, []);

  // 检查AI配置 - 带缓存和重试逻辑
  const checkAIConfig = useCallback(async (forceRefresh = false, retryCount = 0): Promise<void> => {
    const cache = configCacheRef.current;

    // 如果正在检查中且不是强制刷新，直接返回缓存结果
    if (cache.isChecking && !forceRefresh) {
      console.log('配置检查正在进行中，跳过重复检查');
      return;
    }

    // 检查缓存是否有效
    const now = Date.now();
    if (!forceRefresh &&
        cache.isConfigured !== null &&
        cache.lastChecked &&
        (now - cache.lastChecked) < CONFIG_CACHE_DURATION) {
      console.log('使用缓存的配置状态');
      setIsConfigured(cache.isConfigured);
      setCheckingConfig(false);
      setConfigError(null);
      return;
    }

    // 设置检查状态
    cache.isChecking = true;
    setCheckingConfig(true);
    setConfigError(null);

    try {
      console.log(`开始检查AI配置${forceRefresh ? '（强制刷新）' : ''}，重试次数：${retryCount}`);
      const configured = await aiConfigService.isConfigured();

      // 更新缓存
      cache.isConfigured = configured;
      cache.lastChecked = Date.now();
      cache.isChecking = false;

      setIsConfigured(configured);
      setCheckingConfig(false);

      if (!configured) {
        setMessages([{
          id: '1',
          text: '请先配置AI助手\n\n要使用AI助手功能，需要先设置API Key。点击下方按钮进行配置。',
          isUser: false,
          timestamp: new Date(),
        }]);
      }

      console.log(`AI配置检查完成：${configured ? '已配置' : '未配置'}`);

    } catch (error) {
      console.error('检查配置失败:', error);
      cache.isChecking = false;

      // 重试逻辑（最多重试2次）
      if (retryCount < 2) {
        console.log(`配置检查失败，第${retryCount + 1}次重试...`);
        setTimeout(() => {
          checkAIConfig(forceRefresh, retryCount + 1);
        }, 1000 * (retryCount + 1)); // 递增延迟
        return;
      }

      // 重试失败后显示错误
      setCheckingConfig(false);
      setConfigError('配置检查失败，请检查网络连接');

      // 如果有缓存，使用缓存值
      if (cache.isConfigured !== null) {
        setIsConfigured(cache.isConfigured);
        console.log('使用缓存的配置状态（检查失败时）');
      } else {
        setIsConfigured(false);
      }
    }
  }, []);

  // 防抖的配置检查
  const debouncedCheckConfig = useCallback(
    debounce((forceRefresh: boolean) => {
      checkAIConfig(forceRefresh);
    }, 300),
    [checkAIConfig, debounce]
  );

  // 手动刷新配置
  const handleRefreshConfig = useCallback(() => {
    console.log('手动刷新配置检查');
    setRefreshing(true);
    checkAIConfig(true).finally(() => {
      setRefreshing(false);
    });
  }, [checkAIConfig]);

  // 监听账本变化，切换聊天记录
  useEffect(() => {
    const handleBookChange = async () => {
      if (!currentBook) {return;}

      const newBookId = currentBook.bookId;

      // 如果账本没有变化，不执行任何操作
      if (currentBookIdRef.current === newBookId) {
        return;
      }

      console.log(`账本切换：从 ${currentBookIdRef.current} 到 ${newBookId}`);

      // 保存当前账本的聊天记录（如果有的话）
      if (currentBookIdRef.current && messages.length > 0) {
        await saveChatForCurrentBook(currentBookIdRef.current, messages);
      }

      // 加载新账本的聊天记录
      const newMessages = await loadChatForBook(newBookId);

      // 更新当前账本ID引用
      currentBookIdRef.current = newBookId;

      // 更新消息状态
      setMessages(newMessages);

      // 重置处理状态
      setIsProcessing(false);
      setIsCancelling(false);
      shouldIgnoreResponseRef.current = false;
      currentProcessingIdRef.current = null;

      // 通知AIService更新账本信息
      if (aiService.updateBookInfo) {
        aiService.updateBookInfo(newBookId, currentBook?.bookName);
      }

      console.log(`已切换到账本 ${newBookId} 的聊天记录`);
    };

    handleBookChange();
  }, [currentBook, saveChatForCurrentBook, loadChatForBook, messages]);

  // 组件卸载时保存当前聊天记录
  useEffect(() => {
    return () => {
      const saveBeforeUnmount = async () => {
        if (currentBookIdRef.current && messages.length > 0) {
          await saveChatForCurrentBook(currentBookIdRef.current, messages);
          console.log(`组件卸载，已保存账本 ${currentBookIdRef.current} 的聊天记录`);
        }
      };
      saveBeforeUnmount();
    };
  }, [messages, saveChatForCurrentBook]);

  // 初始化当前账本ID和AIService中的账本信息
  useEffect(() => {
    if (currentBook) {
      const bookId = currentBook.bookId;
      const bookName = currentBook.bookName;

      // 如果账本ID发生变化，更新AIService
      if (currentBookIdRef.current !== bookId) {
        // 更新AIService中的账本信息
        if (aiService.updateBookInfo) {
          aiService.updateBookInfo(bookId, bookName);
        }
      }

      // 如果是首次加载，设置当前账本ID并加载聊天记录
      if (!currentBookIdRef.current) {
        currentBookIdRef.current = bookId;
        // 初始加载聊天记录
        loadChatForBook(bookId).then(loadedMessages => {
          setMessages(loadedMessages);
        });
      }
    } else {
      // 如果没有当前账本，清空AIService中的账本信息
      if (aiService.updateBookInfo) {
        aiService.updateBookInfo(null, null);
      }
    }
  }, [currentBook, loadChatForBook]);

  // 初始加载和屏幕聚焦时检查配置
  useEffect(() => {
    debouncedCheckConfig(false);
  }, [debouncedCheckConfig]);

  // 屏幕聚焦时刷新配置（非阻塞）
  useEffect(() => {
    // 添加屏幕聚焦监听器
    let isMounted = true;

    const handleFocus = () => {
      if (!isMounted) {return;}

      const cache = configCacheRef.current;
      const now = Date.now();

      // 如果缓存超过1分钟，在后台刷新
      if (cache.lastChecked && (now - cache.lastChecked) > 60 * 1000) {
        console.log('屏幕聚焦，后台刷新配置检查');
        checkAIConfig(true);
      }
    };

    // 如果 navigation 存在，添加焦点监听
    if (navigation) {
      // 立即执行一次，处理初始聚焦
      handleFocus();

      // 添加焦点监听器
      const unsubscribe = navigation.addListener('focus', handleFocus);

      // 清理函数
      return () => {
        isMounted = false;
        unsubscribe();
      };
    } else {
      // 如果没有 navigation，只在组件挂载时执行一次
      handleFocus();
      return () => {
        isMounted = false;
      };
    }
  }, [navigation, checkAIConfig]);

  // 处理发送消息

  const handleSend = async () => {
    // 如果配置状态未知，先检查配置
    if (isConfigured === null) {
      Alert.alert('提示', '正在检查AI配置，请稍后再试');
      return;
    }

    if (!inputText.trim() || isProcessing || !isConfigured) {
      if (!isConfigured) {
        Alert.alert('AI助手未配置', '请先配置AI助手以使用此功能', [
          { text: '取消', style: 'cancel' },
          {
            text: '去配置',
            onPress: () => {
              if (navigation) {
                const parentNav = navigation.getParent ? navigation.getParent() : null;
                if (parentNav) {
                  parentNav.navigate('AIConfig');
                } else {
                  navigation.navigate('AIConfig');
                }
              } else {
                Alert.alert('提示', '导航不可用，请通过其他方式访问配置页面');
              }
            },
          },
        ]);
      }
      return;
    }

    const userMessage = inputText.trim();
    setInputText('');
    setIsProcessing(true);
    setIsCancelling(false);
    shouldIgnoreResponseRef.current = false;

    // 生成唯一的消息ID
    const userMsgId = Date.now().toString();
    const aiMsgId = (Date.now() + 1).toString();
    currentProcessingIdRef.current = aiMsgId;

    // 添加用户消息
    const userMsg: Message = {
      id: userMsgId,
      text: userMessage,
      isUser: true,
      timestamp: new Date(),
    };

    // 添加AI加载消息，初始内容为空
    const aiLoadingMsg: Message = {
      id: aiMsgId,
      text: '',
      isUser: false,
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, aiLoadingMsg]);

    try {
      // 确保AIService中的账本信息是最新的
      if (currentBook && aiService.updateBookInfo) {
        const bookId = currentBook.bookId;
        const bookName = currentBook.bookName;
        aiService.updateBookInfo(bookId, bookName);
      }

      // 创建流式回调函数来实时更新消息内容
      const streamCallback = (content: string, isComplete: boolean) => {
        // 检查是否应该忽略响应（用户点击了终止按钮）
        if (shouldIgnoreResponseRef.current) {
          console.log('忽略流式响应内容，因为用户已终止');
          return;
        }
        console.log('收到流式消息：', content);

        // 更新AI消息的内容
        setMessages(prev => prev.map(msg => {
          msg.loading = false;
          if (msg.id === aiMsgId) {
            // 如果是完成状态，移除loading状态
            if (isComplete) {}
            return {
              ...msg,
              text: msg.text + content,
              loading: false,
            };
          }
          return msg;
        }));

        // 滚动到底部以显示最新内容
        if (content && flatListRef.current) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 50);
        }
      };

      // 发送到AI服务，使用流式响应
      const response = await aiService.sendMessage(userMessage, streamCallback);

      // 检查是否应该忽略响应（用户点击了终止按钮）
      if (shouldIgnoreResponseRef.current) {
        console.log('忽略已终止的AI响应');
        // 移除加载消息
        setMessages(prev => prev.filter(msg => msg.id !== aiMsgId));
        return;
      }

      // 注意：在流式响应中，response.text可能为空，因为内容已通过streamCallback更新
      // 但我们仍然需要确保消息状态正确
      setMessages(prev => {
        const updated = prev.map(msg => {
          if (msg.id === aiMsgId) {
            const updatedMsg: Message = {
              ...msg,
              // 如果response.text有内容，使用它（作为后备），否则使用当前内容
              text: response.text || msg.text,
              loading: false,
            };
            // 如果有思考块，添加一个思考消息
            if (response.thinking && response.thinking.trim()) {
              // 在AI消息之前插入思考消息
              const thinkingMsg: Message = {
                id: `${aiMsgId}_thinking`,
                text: response.thinking,
                isUser: false,
                timestamp: new Date(),
                type: 'thinking',
                thinkingContent: response.thinking,
                collapsed: true, // 默认折叠
              };
              // 注意：这里不能直接修改数组，需要在外部处理
            }
            return updatedMsg;
          }
          return msg;
        });

        // 如果有思考块，插入思考消息
        if (response.thinking && response.thinking.trim()) {
          const thinkingMsg: Message = {
            id: `${aiMsgId}_thinking`,
            text: response.thinking,
            isUser: false,
            timestamp: new Date(),
            type: 'thinking',
            thinkingContent: response.thinking,
            collapsed: true, // 默认折叠
          };
          // 找到AI消息的索引
          const aiMsgIndex = updated.findIndex(msg => msg.id === aiMsgId);
          if (aiMsgIndex !== -1) {
            // 在AI消息之前插入思考消息
            updated.splice(aiMsgIndex, 0, thinkingMsg);
          }
        }

        return updated;
      });

    } catch (error: any) {
      // 检查是否应该忽略错误（用户点击了终止按钮）
      if (shouldIgnoreResponseRef.current) {
        console.log('忽略已终止的AI错误');
        // 移除加载消息
        setMessages(prev => prev.filter(msg => msg.id !== aiMsgId));
        return;
      }

      console.error('发送消息失败:', error);

      // 更新为错误消息
      setMessages(prev => prev.map(msg =>
        msg.id === aiMsgId
          ? {
              ...msg,
              text: `错误: ${error.message || '处理失败'}\n\n请检查网络连接或AI配置。`,
              loading: false,
              error: true,
            }
          : msg
      ));

      // 如果是配置问题，提示用户
      if (error.message.includes('配置') || error.message.includes('API')) {
        Alert.alert('配置错误', error.message, [
          { text: '取消', style: 'cancel' },
          {
            text: '检查配置',
            onPress: () => {
              if (navigation) {
                const parentNav = navigation.getParent ? navigation.getParent() : null;
                if (parentNav) {
                  parentNav.navigate('AIConfig');
                } else {
                  navigation.navigate('AIConfig');
                }
              } else {
                Alert.alert('提示', '导航不可用，请通过其他方式访问配置页面');
              }
            },
          },
          { text: '重试检查', onPress: () => handleRefreshConfig() },
        ]);
      }
    } finally {
      // 只有在没有终止的情况下才重置处理状态
      if (!shouldIgnoreResponseRef.current) {
        setIsProcessing(false);
        setIsCancelling(false);
      }
      currentProcessingIdRef.current = null;

      // 滚动到底部
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleConfigure = () => {
    if (navigation) {
      // 由于AIChat在Tab导航器中，而AIConfig在Stack导航器中，我们需要通过父导航器来导航
      // 使用getParent()获取父导航器（通常是Stack导航器）
      const parentNavigation = navigation.getParent ? navigation.getParent() : null;
      if (parentNavigation) {
        parentNavigation.navigate('AIConfig');
      } else {
        // 如果获取不到父导航器，直接使用当前导航器
        navigation.navigate('AIConfig');
      }
    } else {
      Alert.alert('提示', '导航不可用，请通过其他方式访问配置页面');
    }
  };

  // 清除聊天记录
  const handleClearChat = () => {
    Alert.alert(
      '清除聊天记录',
      `确定要清除当前账本${currentBook?.bookName ? `(${currentBook.bookName})` : ''}的聊天记录吗？此操作不可撤销。`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            // 重置消息，只保留系统提示词
            const defaultMessages = [
              {
                id: '1',
                text: '你好！我是你的记账助手，可以帮你：\n• 记录收支流水\n• 查询账单记录\n• 分析消费习惯\n• 提供省钱建议\n\n试试对我说："记一笔午餐支出50元" 或 "查看本月消费统计"',
                isUser: false,
                timestamp: new Date(),
              },
            ];

            setMessages(defaultMessages);

            // 同时从存储中清除当前账本的记录
            if (currentBook) {
              const bookId = currentBook.bookId;
              if (bookId) {
                try {
                  const storageKey = `ai_chat_${bookId}`;
                  await AsyncStorage.removeItem(storageKey);
                  console.log(`已清除账本 ${bookId} 的聊天记录`);
                } catch (error) {
                  console.error('清除存储中的聊天记录失败:', error);
                }
              }
            }

            // 重置相关状态
            setIsProcessing(false);
            setIsCancelling(false);
            shouldIgnoreResponseRef.current = false;
            currentProcessingIdRef.current = null;

            // 可选：滚动到顶部
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

            console.log('聊天记录已清除');
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 终止当前AI处理
  const handleCancelProcessing = () => {
    if (!isProcessing) {
      return;
    }

    console.log('用户请求终止AI处理');
    setIsCancelling(true);
    shouldIgnoreResponseRef.current = true;

    // 找到当前正在加载的消息并移除它
    if (currentProcessingIdRef.current) {
      setMessages(prev => prev.filter(msg =>
        !(msg.id === currentProcessingIdRef.current && msg.loading)
      ));
    }

    // 重置处理状态
    setIsProcessing(false);
    currentProcessingIdRef.current = null;

    // 添加一个系统提示消息
    const cancelMsg: Message = {
      id: `cancel_${Date.now()}`,
      text: '已终止AI处理。你可以开始新的对话。',
      isUser: false,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, cancelMsg]);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const messageStyle = [
      styles.messageContainer,
      item.isUser ? styles.userMessage : styles.assistantMessage,
      item.isUser ? {backgroundColor: colors.primary + '20'} : {backgroundColor: colors.card},
      item.error && styles.errorMessage,
      item.error && {backgroundColor: colors.error + '20', borderColor: colors.error},
      item.type === 'tool_call' && styles.toolCallMessage,
      item.type === 'thinking' && styles.thinkingMessage,
      item.type === 'tool_result' && styles.toolResultMessage,
    ];

    // 渲染消息内容
    const renderMessageContent = () => {
      // 加载状态
      if (item.loading) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, {color: colors.secondaryText}]}>AI思考中...</Text>
          </View>
        );
      }

      // 根据类型渲染不同内容
      switch (item.type) {
        case 'tool_call':
          return renderToolCallMessage(item);
        case 'thinking':
          return renderThinkingMessage(item);
        case 'tool_result':
          return renderToolResultMessage(item);
        default:
          return renderTextMessage(item);
      }
    };

    return (
      <View style={messageStyle}>
        <View style={styles.messageHeader}>
          <Text style={[styles.messageRole, {color: colors.text}]}>
            {item.isUser ? '你' : 'AI助手'}
            {item.type === 'tool_call' && ' 🔧'}
            {item.type === 'thinking' && ' 💭'}
            {item.type === 'tool_result' && ' 📊'}
          </Text>
          <Text style={[styles.messageTime, {color: colors.secondaryText}]}>
            {item.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        {renderMessageContent()}
      </View>
    );
  };

  // 渲染文本消息
  const renderTextMessage = (item: Message) => {
    return (
      <>
        <Text style={[
          styles.messageText,
          {color: colors.text},
          item.error && {color: colors.error},
        ]}>
          {item.text}
        </Text>
        {item.error && (
          <TouchableOpacity
            style={[styles.configureButton, {backgroundColor: colors.primary}]}
            onPress={handleConfigure}
          >
            <Text style={styles.configureButtonText}>检查配置</Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  // 渲染工具调用消息
  const renderToolCallMessage = (item: Message) => {
    const toolName = item.toolDetails?.name || '未知工具';
    const args = item.toolDetails?.arguments;

    return (
      <View style={styles.toolCallContainer}>
        <View style={styles.toolCallHeader}>
          <Text style={[styles.toolCallTitle, {color: colors.text}]}>
            🔧 调用工具: {toolName}
          </Text>
          {item.collapsed !== undefined && (
            <TouchableOpacity
              onPress={() => handleToggleCollapse(item.id)}
              style={styles.collapseButton}
            >
              <Text style={[styles.collapseButtonText, {color: colors.primary}]}>
                {item.collapsed ? '展开' : '折叠'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {(!item.collapsed || !item.collapsed) && (
          <>
            {args && (
              <View style={styles.toolCallSection}>
                <Text style={[styles.toolCallSectionTitle, {color: colors.secondaryText}]}>
                  参数:
                </Text>
                <Text style={[styles.toolCallContent, {color: colors.text}]}>
                  {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
                </Text>
              </View>
            )}
            <Text style={[styles.toolCallStatus, {color: colors.primary}]}>
              {item.loading ? '执行中...' : '等待结果...'}
            </Text>
          </>
        )}
      </View>
    );
  };

  // 渲染思考消息
  const renderThinkingMessage = (item: Message) => {
    const thinkingText = item.thinkingContent || item.text;

    return (
      <View style={styles.thinkingContainer}>
        <View style={styles.thinkingHeader}>
          <Text style={[styles.thinkingTitle, {color: colors.text}]}>
            💭 AI思考过程
          </Text>
          {item.collapsed !== undefined && (
            <TouchableOpacity
              onPress={() => handleToggleCollapse(item.id)}
              style={styles.collapseButton}
            >
              <Text style={[styles.collapseButtonText, {color: colors.primary}]}>
                {item.collapsed ? '展开' : '折叠'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {(!item.collapsed || !item.collapsed) && (
          <Text style={[styles.thinkingContent, {color: colors.secondaryText}]}>
            {thinkingText}
          </Text>
        )}
      </View>
    );
  };

  // 渲染工具结果消息
  const renderToolResultMessage = (item: Message) => {
    const success = item.toolDetails?.success;
    const result = item.toolDetails?.result;
    const error = item.toolDetails?.error;
    const duration = item.toolDetails?.duration;

    return (
      <View style={styles.toolResultContainer}>
        <View style={styles.toolResultHeader}>
          <Text style={[
            styles.toolResultTitle,
            {color: success ? colors.success : colors.error}
          ]}>
            {success ? '✅ 工具执行成功' : '❌ 工具执行失败'}
          </Text>
          {item.collapsed !== undefined && (
            <TouchableOpacity
              onPress={() => handleToggleCollapse(item.id)}
              style={styles.collapseButton}
            >
              <Text style={[styles.collapseButtonText, {color: colors.primary}]}>
                {item.collapsed ? '展开' : '折叠'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {(!item.collapsed || !item.collapsed) && (
          <>
            {duration && (
              <Text style={[styles.toolResultMeta, {color: colors.secondaryText}]}>
                耗时: {duration}ms
              </Text>
            )}
            {error && (
              <View style={styles.toolResultSection}>
                <Text style={[styles.toolResultSectionTitle, {color: colors.error}]}>
                  错误信息:
                </Text>
                <Text style={[styles.toolResultContent, {color: colors.text}]}>
                  {error}
                </Text>
              </View>
            )}
            {result && (
              <View style={styles.toolResultSection}>
                <Text style={[styles.toolResultSectionTitle, {color: colors.success}]}>
                  执行结果:
                </Text>
                <Text style={[styles.toolResultContent, {color: colors.text}]}>
                  {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  // 切换折叠状态
  const handleToggleCollapse = (messageId: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, collapsed: !msg.collapsed }
        : msg
    ));
  };

  // 配置检查中
  if (checkingConfig && isConfigured === null) {
    return (
      <SafeAreaView style={[styles.centeredContainer, {backgroundColor: colors.background}]}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <BookSelector />
        <View style={[styles.headerContainer, {backgroundColor: colors.card}]}>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, {color: colors.text}]}>AI助手</Text>
          </View>
        </View>
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, {color: colors.text, marginTop: 16}]}>检查AI配置...</Text>
          <Text style={[styles.hintText, {color: colors.secondaryText, marginTop: 8}]}>
            首次检查可能需要几秒钟
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 配置检查失败
  if (configError && isConfigured === false) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <BookSelector />
        <View style={[styles.headerContainer, {backgroundColor: colors.card}]}>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, {color: colors.text}]}>AI助手</Text>
          </View>
        </View>
        <View style={[styles.configureContainer, {backgroundColor: colors.background, flex: 1}]}>
          <View style={styles.configureHeader}>
            <Text style={[styles.configureTitle, {color: colors.error}]}>配置检查失败</Text>
            <Text style={[styles.configureSubtitle, {color: colors.secondaryText}]}>
              {configError}
            </Text>
          </View>

          <View style={styles.errorActions}>
            <TouchableOpacity
              style={[styles.retryButton, {backgroundColor: colors.warning}]}
              onPress={handleRefreshConfig}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.retryButtonText}>重试检查</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.configureButtonLarge, {backgroundColor: colors.primary}]}
              onPress={() => {
                if (navigation) {
                  const parentNav = navigation.getParent ? navigation.getParent() : null;
                  if (parentNav) {
                    parentNav.navigate('AIConfig');
                  } else {
                    navigation.navigate('AIConfig');
                  }
                } else {
                  Alert.alert('提示', '导航不可用，请通过其他方式访问配置页面');
                }
              }}
            >
              <Text style={styles.configureButtonTextLarge}>前往配置</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.configureHint, {color: colors.secondaryText}]}>
            如果问题持续，请检查网络连接
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 未配置
  if (isConfigured === false) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <BookSelector />
        <View style={[styles.headerContainer, {backgroundColor: colors.card}]}>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, {color: colors.text}]}>AI助手</Text>
          </View>
        </View>
        <View style={[styles.configureContainer, {backgroundColor: colors.background, flex: 1}]}>
          <View style={styles.configureHeader}>
            <Text style={[styles.configureTitle, {color: colors.text}]}>AI助手未配置</Text>
            <Text style={[styles.configureSubtitle, {color: colors.secondaryText}]}>
              要使用智能记账助手功能，需要先配置云端AI模型
            </Text>
          </View>

          <View style={styles.featuresContainer}>
            <Text style={[styles.featuresTitle, {color: colors.text}]}>AI助手功能：</Text>
            {[
              '💬 自然语言记账',
              '📊 智能财务分析',
              '🔍 消费习惯洞察',
              '💡 省钱建议',
              '📈 趋势预测',
            ].map((feature, index) => (
              <View key={index} style={[styles.featureItem, {backgroundColor: colors.card}]}>
                <Text style={[styles.featureText, {color: colors.text}]}>{feature}</Text>
              </View>
            ))}
          </View>

          <View style={styles.configureActions}>
            <TouchableOpacity
              style={[styles.refreshConfigButton, {backgroundColor: colors.card, borderColor: colors.border}]}
              onPress={handleRefreshConfig}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.refreshConfigText, {color: colors.primary}]}>刷新检查</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.configureButtonLarge, {backgroundColor: colors.primary}]}
              onPress={() => {
                if (navigation) {
                  const parentNav = navigation.getParent ? navigation.getParent() : null;
                  if (parentNav) {
                    parentNav.navigate('AIConfig');
                  } else {
                    navigation.navigate('AIConfig');
                  }
                } else {
                  Alert.alert('提示', '导航不可用，请通过其他方式访问配置页面');
                }
              }}
            >
              <Text style={styles.configureButtonTextLarge}>前往配置</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.configureHint, {color: colors.secondaryText}]}>
            配置需要 API Key，支持 OpenAI、DeepSeek 等
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* BookSelector */}
      <BookSelector />

      {/* 页面标题区域 */}
      <View style={[styles.headerContainer, {backgroundColor: colors.card}]}>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, {color: colors.text}]}>AI助手</Text>
        </View>

        <View style={styles.headerActions}>
          {/* 清除按钮 - 始终显示 */}
          <TouchableOpacity
            style={[styles.headerButton, {backgroundColor: colors.warning}]}
            onPress={handleClearChat}
            disabled={messages.length <= 1} // 只有系统消息时禁用
          >
            <Text style={styles.headerButtonText}>🗑️ 清除</Text>
          </TouchableOpacity>

          {/* 终止按钮（仅在处理时显示） */}
          {isProcessing && (
            <TouchableOpacity
              style={[styles.headerButton, {backgroundColor: colors.error}]}
              onPress={handleCancelProcessing}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.headerButtonText}>终止</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 聊天区域 */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
        style={{ flex: 1 }}
      />

      {/* 输入区域 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.inputContainer, {backgroundColor: colors.card, borderTopColor: colors.border}]}
      >
        <View style={styles.inputWrapper}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="输入你的问题或指令..."
            placeholderTextColor={colors.secondaryText}
            multiline
            maxLength={500}
            editable={!isProcessing}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              {backgroundColor: colors.primary},
              (!inputText.trim() || isProcessing) && [styles.sendButtonDisabled, {backgroundColor: colors.secondaryText}],
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>发送</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 快捷提示 */}
        <View style={styles.hintsContainer}>
          <Text style={[styles.hintsText, {color: colors.secondaryText}]}>试试说：</Text>
          {['记一笔交通支出30元', '本月花了多少钱', '分析餐饮消费'].map((hint, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.hintButton, {backgroundColor: colors.card, borderColor: colors.border}]}
              onPress={() => setInputText(hint)}
              disabled={isProcessing}
            >
              <Text style={[styles.hintText, {color: colors.primary}]}>{hint}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  configureContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  configureHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  configureTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  configureSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  featuresContainer: {
    width: '100%',
    marginBottom: 40,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  featureItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 16,
  },
  configureActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    width: '100%',
  },
  refreshConfigButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  refreshConfigText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorActions: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 20,
    width: '100%',
  },
  retryButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  configureButtonLarge: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  configureButtonTextLarge: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  configureHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  hintText: {
    fontSize: 14,
    textAlign: 'center',
  },
  messagesList: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  messageContainer: {
    maxWidth: '85%',
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
  },
  userMessage: {
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
  },
  errorMessage: {
    borderWidth: 1,
  },
  toolCallMessage: {
    borderLeftWidth: 3,
    borderLeftColor: '#FFA726',
  },
  thinkingMessage: {
    borderLeftWidth: 3,
    borderLeftColor: '#26C6DA',
  },
  toolResultMessage: {
    borderLeftWidth: 3,
    borderLeftColor: '#66BB6A',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  messageRole: {
    fontWeight: '600',
    fontSize: 14,
  },
  messageTime: {
    fontSize: 12,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  configureButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  configureButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    padding: 12,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
    borderWidth: 1,
  },
  sendButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hintsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  hintsText: {
    fontSize: 14,
    marginRight: 8,
    alignSelf: 'center',
  },
  hintButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  // 新增样式
  toolCallContainer: {
    width: '100%',
  },
  toolCallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolCallTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  toolCallSection: {
    marginBottom: 8,
  },
  toolCallSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  toolCallContent: {
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  toolCallStatus: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  thinkingContainer: {
    width: '100%',
  },
  thinkingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  thinkingTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  thinkingContent: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  toolResultContainer: {
    width: '100%',
  },
  toolResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolResultTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  toolResultMeta: {
    fontSize: 12,
    marginBottom: 8,
  },
  toolResultSection: {
    marginBottom: 8,
  },
  toolResultSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  toolResultContent: {
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  collapseButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  collapseButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default AIChatScreen;
