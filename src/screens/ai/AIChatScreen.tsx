import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard, ScrollView,
  Image,
  Animated,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'react-native-image-picker';
import type {MessageStreamCallback} from '../../services/AIService';
import {aiService} from '../../services/AIService';
import {aiConfigService} from '../../services/AIConfigService';
import {getColors, useTheme} from '../../context/ThemeContext';
import BookSelector from '../../components/BookSelector';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import {useBookkeeping} from '../../context/BookkeepingContext.tsx';
import {
  AIMessage,
  BaseMessage,
  createAIMessage,
  createImageMessage,
  createTextMessage,
  ImageMessage,
  Message,
  TextMessage,
  ThinkingMessage,
  ToolCallMessage,
  ToolResultMessage,
} from '../../types';
import dayjs from "dayjs";

// 配置状态缓存
const DEFAULT_MESSAGE = '你好！我是你的记账助手，可以帮你：\n• 记录收支流水\n• 查询账单记录\n• 分析消费习惯\n• 平账于账本去重\n• 重新分类流水数据\n• 提供省钱建议\n• 其他app功能\n\n试试对我说："记一笔午餐支出50元" 或 "查看本月消费统计"';

interface AIChatScreenProps {
  navigation?: any;
}

// OCR扫描动画组件
const OCRScanAnimation: React.FC<{
  isActive: boolean;
  containerStyle?: any;
}> = ({ isActive, containerStyle }) => {
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) {
      scanLineAnim.setValue(0);
      return;
    }

    const startAnimation = () => {
      scanLineAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.delay(500),
        ])
      ).start();
    };

    startAnimation();

    return () => {
      scanLineAnim.stopAnimation();
    };
  }, [isActive, scanLineAnim]);

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200], // 图片高度
  });

  if (!isActive) {
    return null;
  }

  return (
    <View style={[styles.ocrAnimationContainer, containerStyle]}>
      {/* 扫描线 */}
      <Animated.View
        style={[
          styles.scanLine,
          {
            transform: [{ translateY }],
          },
        ]}
      />
      {/* 光晕效果 */}
      <View style={styles.glowEffect} />
      <Text style={styles.scanningText}>扫描中...</Text>
    </View>
  );
};

const AIChatScreen: React.FC<AIChatScreenProps> = ({ navigation }) => {
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  // 获取当前账本
  const { currentBook } = useBookkeeping();

  const [messages, setMessages] = useState<Message[]>([
    createTextMessage(
      DEFAULT_MESSAGE,
      false,
      {
        id: '1',
        timestamp: new Date(),
      }
    ),
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
  // 图片选择相关状态
  const [isSelectingImage, setIsSelectingImage] = useState(false);
  // AI提示建议相关状态
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [aiSuggestionEnabled, setAiSuggestionEnabled] = useState(false);
  const [lastInputForSuggestions, setLastInputForSuggestions] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const shouldIgnoreResponseRef = useRef(false);
  const currentProcessingIdRef = useRef<string | null>(null);
  // 控制是否应该自动滚动到底部
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  // 使用 ref 来获取最新的 shouldAutoScroll 值，避免闭包问题
  const shouldAutoScrollRef = useRef(shouldAutoScroll);
  // 跟踪用户是否在底部
  const [isAtBottom, setIsAtBottom] = useState(true);
  // 用于防抖的定时器引用
  // @ts-ignore
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 用于跟踪是否正在滚动到底部，防止按钮闪烁
  const isScrollingToBottomRef = useRef(false);

  // 滚动到底部的函数
  const scrollToBottom = () => {
    // 设置标志位，表示正在滚动到底部
    isScrollingToBottomRef.current = true;

    // 立即设置 isAtBottom 为 true，防止按钮在滚动过程中消失
    setIsAtBottom(true);

    setShouldAutoScroll(true);
    shouldAutoScrollRef.current = true;

    flatListRef.current?.scrollToEnd({
      animated: true,
    });

    // 滚动完成后重置标志位
    setTimeout(() => {
      isScrollingToBottomRef.current = false;
    }, 500);
  };

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
        createTextMessage(
          DEFAULT_MESSAGE,
          false,
          {
            id: '1',
            timestamp: new Date(),
          }
        ),
      ];
    }

    try {
      const storageKey = `ai_chat_${bookId}`;
      const chatData = await AsyncStorage.getItem(storageKey);

      if (chatData) {
        const parsedMessages: any[] = JSON.parse(chatData);
        // 确保时间戳是Date对象
        const messagesWithDates = parsedMessages.map(msg => {
          // 根据消息类型重建消息对象
          const timestamp = new Date(msg.timestamp);
          // 使用类型断言来访问type属性
          const msgWithType = msg as any;
          switch (msgWithType.type) {
            case 'ai':
              // 确保messageList存在，如果不存在则使用空数组
              const messageList = msgWithType.messageList || [];
              return createAIMessage(
                messageList,
                {
                  id: msg.id,
                  timestamp,
                  metadata: msg.metadata,
                  collapsed: msg.collapsed,
                  error: msgWithType.error,
                  loading: msgWithType.loading,
                }
              );
            case 'image':
              const imageMessage = msg as ImageMessage;
              // 确保messageList存在，如果不存在则使用空数组
              return createImageMessage(imageMessage.imageUri, true, {
                id: imageMessage.id,
                timestamp: timestamp,
                caption: imageMessage.caption,
              });
            default:
              // 默认为文本消息
              return createTextMessage(
                msgWithType.content,
                msgWithType.isUser,
                {
                  id: msg.id,
                  timestamp,
                  metadata: msg.metadata,
                  collapsed: msg.collapsed,
                }
              );
          }
        });

        aiService.initHistory(messagesWithDates);
        console.log(`已加载账本 ${bookId} 的聊天记录，消息数：${messagesWithDates.length}`);
        return messagesWithDates;
      }
    } catch (error) {
      console.error('加载聊天记录失败:', error);
    }

    // 如果没有保存的记录，返回默认消息
    return [
      createTextMessage(
        DEFAULT_MESSAGE,
        false,
        {
          id: '1',
          timestamp: new Date(),
        }
      ),
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

  // 生成AI提示建议的防抖函数
  const debouncedGenerateSuggestions = useCallback(
    debounce(async (input: string) => {
      // 如果输入为空或AI未配置，不生成建议
      if (!input.trim() || !isConfigured) {
        setSuggestions([]);
        return;
      }

      // 如果输入与上次相同，不重复生成
      if (input.trim() === lastInputForSuggestions) {
        return;
      }

      console.log('开始生成AI提示建议，输入:', input);
      setIsGeneratingSuggestions(true);
      setLastInputForSuggestions(input.trim());

      try {
        // 调用AIService生成建议
        const generatedSuggestions = await aiService.generatePromptSuggestions(input.trim(), 3);
        console.log('AI提示建议生成成功:', generatedSuggestions);
        setSuggestions(generatedSuggestions);
      } catch (error) {
        console.error('生成AI提示建议失败:', error);
        // 生成失败时使用备用建议
        setSuggestions(getFallbackSuggestions(input.trim()));
      } finally {
        setIsGeneratingSuggestions(false);
      }
    }, 500),
    [isConfigured, lastInputForSuggestions, debounce]
  );

  // 获取备用建议（当AI不可用时）
  const getFallbackSuggestions = useCallback((userInput: string): string[] => {
    const defaultSuggestions = [
      '记一笔餐饮支出50元',
      '查看本月消费统计',
      '分析餐饮类别的花费',
      '设置本月预算3000元',
      '查看最近的流水记录',
      '统计年度收入总额',
      '查找重复的流水记录',
      '查看可以平账的流水',
    ];

    // 如果用户输入包含关键词，尝试匹配相关建议
    const input = userInput.toLowerCase();
    const filteredSuggestions = defaultSuggestions.filter(suggestion => {
      if (input.includes('记') || input.includes('支出') || input.includes('收入')) {
        return suggestion.includes('记一笔');
      }
      if (input.includes('查看') || input.includes('统计')) {
        return suggestion.includes('查看') || suggestion.includes('统计');
      }
      if (input.includes('分析')) {
        return suggestion.includes('分析');
      }
      if (input.includes('预算')) {
        return suggestion.includes('预算');
      }
      if (input.includes('重复')) {
        return suggestion.includes('重复');
      }
      if (input.includes('平账')) {
        return suggestion.includes('平账');
      }
      return true;
    });

    // 返回指定数量的建议
    return filteredSuggestions.slice(0, 3);
  }, []);

  // 检查AI配置 - 带缓存和重试逻辑
  const checkAIConfig = useCallback(async (retryCount = 0): Promise<void> => {
    try {
      console.log(`开始检查AI配置，重试次数：${retryCount}`);
      const configured = await aiConfigService.isConfigured();
      const suggestionsEnabled = await aiConfigService.isAiSuggestionEnabled();
      setAiSuggestionEnabled(suggestionsEnabled);
      setIsConfigured(configured);
      setCheckingConfig(false);

      if (!configured) {
        setMessages([createTextMessage(
          '请先配置AI助手\n\n要使用AI助手功能，需要先设置API Key。点击下方按钮进行配置。',
          false,
          {
            id: '1',
            timestamp: new Date(),
          }
        )]);
      }

      console.log(`AI配置检查完成：${configured ? '已配置' : '未配置'}`);

    } catch (error) {
      console.error('检查配置失败:', error);

      // 重试逻辑（最多重试2次）
      if (retryCount < 2) {
        console.log(`配置检查失败，第${retryCount + 1}次重试...`);
        setTimeout(() => {
          checkAIConfig(retryCount + 1);
        }, 1000 * (retryCount + 1)); // 递增延迟
        return;
      }

      // 重试失败后显示错误
      setCheckingConfig(false);
      setConfigError('配置检查失败，请检查网络连接');
      setIsConfigured(false);
    }
  }, []);

  // 防抖的配置检查
  const debouncedCheckConfig = useCallback(
    debounce(() => {
      checkAIConfig();
    }, 300),
    [checkAIConfig, debounce]
  );

  // 手动刷新配置
  const handleRefreshConfig = useCallback(() => {
    console.log('手动刷新配置检查');
    setRefreshing(true);
    checkAIConfig().finally(() => {
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

      console.log(`账本切换：从 ${currentBookIdRef.current} 到 ${currentBook.bookName}`);

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
  }, []);

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
  }, []);

  // 初始加载和屏幕聚焦时检查配置
  useEffect(() => {
    debouncedCheckConfig(false);
  }, [debouncedCheckConfig]);

  // 监听输入变化，生成AI提示建议
  useEffect( () => {
    if (!aiSuggestionEnabled) {
      setSuggestions([]);
    } else {
      if (inputText.trim() && isConfigured) {
        debouncedGenerateSuggestions(inputText);
      } else {
        // 如果输入为空或AI未配置，清空建议
        setSuggestions([]);
      }
    }
  }, [inputText, isConfigured, debouncedGenerateSuggestions]);

  // 更新 shouldAutoScrollRef 当 shouldAutoScroll 变化时
  useEffect(() => {
    shouldAutoScrollRef.current = shouldAutoScroll;
  }, [shouldAutoScroll]);

  // 键盘显示/隐藏监听
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        // 键盘显示时，确保可以自动滚动并滚动到底部
        setShouldAutoScroll(true);
        setTimeout(() => {
          if (shouldAutoScrollRef.current) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    );

    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        // 键盘隐藏时，确保可以自动滚动并调整滚动位置
        setShouldAutoScroll(true);
        setTimeout(() => {
          if (shouldAutoScrollRef.current) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // 屏幕聚焦时刷新配置（非阻塞）
  useEffect(() => {
    // 添加屏幕聚焦监听器
    let isMounted = true;

    const handleFocus = () => {
      if (!isMounted) {return;}
      // 如果缓存超过1分钟，在后台刷新
      console.log('屏幕聚焦，后台刷新配置检查');
      checkAIConfig();
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
        // 清理图片选择状态
        setIsSelectingImage(false);
      };
    } else {
      // 如果没有 navigation，只在组件挂载时执行一次
      handleFocus();
      return () => {
        isMounted = false;
        // 清理图片选择状态
        setIsSelectingImage(false);
      };
    }
  }, [navigation, checkAIConfig]);

  // 处理复制消息到剪贴板
  const handleCopyMessage = useCallback((content: string) => {
    if (!content || content.trim() === '') {
      return;
    }

    // 复制到剪贴板
    if (Clipboard && Clipboard.setString) {
      try {
        Clipboard.setString(content.trim());
        Alert.alert('已复制到剪贴板');
      } catch (error) {
        Alert.alert('复制失败');
      }
    } else {
      Alert.alert('提示', '剪贴板功能不可用');
    }
  }, []);

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
    const userMsgId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const aiMsgId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentProcessingIdRef.current = aiMsgId;

    // 添加用户消息
    const userMsg = createTextMessage(userMessage, true, {
      id: userMsgId,
      timestamp: new Date(),
    });


    setMessages(prev => [...prev, userMsg]);

    try {
      // 确保AIService中的账本信息是最新的
      if (currentBook && aiService.updateBookInfo) {
        const bookId = currentBook.bookId;
        const bookName = currentBook.bookName;
        aiService.updateBookInfo(bookId, bookName);
      }

      // 创建结构化消息回调函数
      const messageStreamCallback: MessageStreamCallback = (message: Message, isComplete: boolean) => {
        // 检查是否应该忽略响应（用户点击了终止按钮）
        if (shouldIgnoreResponseRef.current) {
          console.log('忽略流式响应内容，因为用户已终止');
          return;
        }

        if (isComplete) {}

        // console.log('收到结构化消息：', JSON.stringify(message));
        // 处理消息
        setMessages(prev => {
          let newMessages = [...prev];
          // 如果是单个消息
          // 检查是否已存在相同ID的消息（用于更新）
          const existingIndex = newMessages.findIndex(msg => msg.id === message.id);
          if (existingIndex !== -1) {
            // 更新现有消息
            newMessages[existingIndex] = message;
          } else {
            // 添加新消息
            newMessages.push(message);
          }
          if (currentBookIdRef.current && newMessages.length > 0) {
            saveChatForCurrentBook(currentBookIdRef.current, newMessages);
          }
          return newMessages;
        });
      };

      // 发送到AI服务，使用结构化消息回调
       await aiService.sendMessage(createTextMessage(userMessage,true), messageStreamCallback);

      // 检查是否应该忽略响应（用户点击了终止按钮）
      if (shouldIgnoreResponseRef.current) {
        console.log('忽略已终止的AI响应');
        // 移除加载消息
        setMessages(prev => prev.filter(msg => msg.id !== aiMsgId));
        return;
      }

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
      setMessages(prev => prev.map(msg => {
        if (msg.id === aiMsgId && msg.type === 'text') {
          const textMsg = msg as TextMessage;
          return {
            ...textMsg,
            content: `错误: ${error.message || '处理失败'}\n\n请检查网络连接或AI配置。`,
            loading: false,
            error: true,
          };
        }
        return msg;
      }));

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

      // 确保可以自动滚动，并滚动到底部
      setShouldAutoScroll(true);
      setTimeout(() => {
        if (shouldAutoScrollRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 100);
    }
  };

  // 拍照记账
  const handleTakePhotoForAccounting = useCallback(async () => {
    if (isSelectingImage || isProcessing) {return;}

    // 检查OCR功能是否启用
    try {
      const isOCREnabled = await aiConfigService.isOCREnabled();
      if (!isOCREnabled) {
        Alert.alert(
          'OCR功能未启用',
          '要使用小票记账功能，请先在AI设置中启用OCR功能。',
          [
            { text: '取消', style: 'cancel' },
            {
              text: '前往设置',
              onPress: () => {
                if (navigation) {
                  const parentNav = navigation.getParent ? navigation.getParent() : null;
                  if (parentNav) {
                    parentNav.navigate('AIConfig');
                  } else {
                    navigation.navigate('AIConfig');
                  }
                }
              },
            },
          ]
        );
        return;
      }
    } catch (error) {
      console.error('检查OCR功能状态失败:', error);
      Alert.alert('错误', '检查OCR功能状态失败，请稍后重试');
      return;
    }

    setIsSelectingImage(true);
    const options: ImagePicker.CameraOptions = {
      mediaType: 'photo' as const,
      includeBase64: true,
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 0.8,
      cameraType: 'back',
      saveToPhotos: true,
    };

    ImagePicker.launchCamera(options, async (response) => {
      setIsSelectingImage(false);
      if (response.didCancel) {
        console.log('用户取消了拍照');
        return;
      }
      if (response.errorCode) {
        Alert.alert('拍照失败', `错误: ${response.errorMessage || '未知错误'}`);
        return;
      }
      if (response.assets && response.assets.length > 0) {
        const asset = response.assets[0];
        const imageUri = asset.uri || asset.base64;
        if (imageUri) {
          // 发送图片给AI助手处理
          await sendImageForAccounting(imageUri);
        } else {
          Alert.alert('错误', '无法获取图片数据');
        }
      }
    });
  }, [isSelectingImage, isProcessing, navigation]);

  // 选择图片记账
  const handleSelectImageForAccounting = useCallback(async () => {
    if (isSelectingImage || isProcessing) {return;}
    // 检查OCR功能是否启用
    try {
      const isOCREnabled = await aiConfigService.isOCREnabled();
      if (!isOCREnabled) {
        Alert.alert(
          'OCR功能未启用',
          '要使用小票记账功能，请先在AI设置中启用OCR功能。',
          [
            { text: '取消', style: 'cancel' },
            {
              text: '前往设置',
              onPress: () => {
                if (navigation) {
                  const parentNav = navigation.getParent ? navigation.getParent() : null;
                  if (parentNav) {
                    parentNav.navigate('AIConfig');
                  } else {
                    navigation.navigate('AIConfig');
                  }
                }
              },
            },
          ]
        );
        return;
      }
    } catch (error) {
      console.error('检查OCR功能状态失败:', error);
      Alert.alert('错误', '检查OCR功能状态失败，请稍后重试');
      return;
    }

    setIsSelectingImage(true);
    const options: ImagePicker.ImageLibraryOptions = {
      mediaType: 'photo' as const,
      includeBase64: true,
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 0.8,
      selectionLimit: 1,
    };

    ImagePicker.launchImageLibrary(options, async (response) => {
      setIsSelectingImage(false);
      if (response.didCancel) {
        console.log('用户取消了选择图片');
        return;
      }
      if (response.errorCode) {
        Alert.alert('选择图片失败', `错误: ${response.errorMessage || '未知错误'}`);
        return;
      }
      if (response.assets && response.assets.length > 0) {
        const asset = response.assets[0];
        const imageUri = asset.uri || asset.base64;
        if (imageUri) {
          // 发送图片给AI助手处理
          await sendImageForAccounting(imageUri);
        } else {
          Alert.alert('错误', '无法获取图片数据');
        }
      }
    });
  }, [isSelectingImage, isProcessing, navigation]);

  // 发送图片给AI助手处理
  const sendImageForAccounting = useCallback(async (imageUri: string) => {
    if (!imageUri) {return;}

    // 生成唯一的消息ID
    const userMsgId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const aiMsgId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 设置处理状态
    setIsProcessing(true);
    setIsCancelling(false);
    shouldIgnoreResponseRef.current = false;
    currentProcessingIdRef.current = aiMsgId;

    // 创建图片消息对象
    const userMsg = createImageMessage(imageUri, true, {
      id: userMsgId,
      timestamp: new Date(),
      caption: '',
    });

    // 添加用户消息到列表
    setMessages(prev => {
      let newMessages = [...prev, userMsg];
      if (currentBookIdRef.current && newMessages.length > 0) {
        saveChatForCurrentBook(currentBookIdRef.current, newMessages);
      }
      return newMessages;
    });

    try {
      // 确保AIService中的账本信息是最新的
      if (currentBook && aiService.updateBookInfo) {
        const bookId = currentBook.bookId;
        const bookName = currentBook.bookName;
        aiService.updateBookInfo(bookId, bookName);
      }

      // 创建结构化消息回调函数
      const messageStreamCallback: MessageStreamCallback = (message: Message, isComplete: boolean) => {
        // 检查是否应该忽略响应（用户点击了终止按钮）
        if (shouldIgnoreResponseRef.current) {
          console.log('忽略流式响应内容，因为用户已终止');
          return;
        }

        if (isComplete) {}

        // 处理消息
        setMessages(prev => {
          let newMessages = [...prev];
          // 检查是否已存在相同ID的消息（用于更新）
          const existingIndex = newMessages.findIndex(msg => msg.id === message.id);
          if (existingIndex !== -1) {
            // 更新现有消息
            newMessages[existingIndex] = message;
          } else {
            // 添加新消息
            newMessages.push(message);
          }
          if (currentBookIdRef.current && newMessages.length > 0) {
            saveChatForCurrentBook(currentBookIdRef.current, newMessages);
          }
          return newMessages;
        });
      };

      // 发送到AI服务，使用结构化消息回调
      await aiService.sendMessage(userMsg, messageStreamCallback);

      // 检查是否应该忽略响应（用户点击了终止按钮）
      if (shouldIgnoreResponseRef.current) {
        console.log('忽略已终止的AI响应');
        // 移除加载消息
        setMessages(prev => prev.filter(msg => msg.id !== aiMsgId));
        return;
      }

    } catch (error: any) {
      // 检查是否应该忽略错误（用户点击了终止按钮）
      if (shouldIgnoreResponseRef.current) {
        console.log('忽略已终止的AI错误');
        // 移除加载消息
        setMessages(prev => prev.filter(msg => msg.id !== aiMsgId));
        return;
      }

      console.error('发送图片消息失败:', error);

      // 创建错误消息
      const errorMsg = createTextMessage(
        `错误: ${error.message || '处理图片失败'}\n\n请检查网络连接或AI配置。`,
        false,
        {
          id: aiMsgId,
          timestamp: new Date(),
          error: true,
        }
      );

      setMessages(prev => [...prev, errorMsg]);

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

      // 确保可以自动滚动，并滚动到底部
      setShouldAutoScroll(true);
      setTimeout(() => {
        if (shouldAutoScrollRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 100);
    }
  }, [currentBook, navigation, handleRefreshConfig, saveChatForCurrentBook]);

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
            const defaultMessages: Message[] = [
              createTextMessage(
                DEFAULT_MESSAGE,
                false,
                {
                  id: '1',
                  timestamp: new Date(),
                }
              ),
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

            // 清除AI服务的内部对话历史
            try {
                aiService.clearHistory();
                console.log('AI服务内部对话历史已清除');
            } catch (error) {
                console.error('清除AI服务内部对话历史失败:', error);
                // 不阻止后续操作，仅记录错误
            }

            // 可选：滚动到顶部
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            // 确保可以自动滚动
            setShouldAutoScroll(true);

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

    // 断开SSE连接
    console.log('正在断开SSE连接...');
    aiService.cancelCurrentStream();

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
    const cancelMsg = createTextMessage('已终止AI处理。你可以开始新的对话。', false, {
      id: `cancel_${Date.now()}`,
      timestamp: new Date(),
    });
    setMessages(prev => [...prev, cancelMsg]);
    // 确保可以自动滚动
    setShouldAutoScroll(true);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.isUser;
    // 使用类型守卫来检查消息类型
    const isAIMsg = isAIMessage(item);
    const isToolCallMsg = isToolCallMessage(item);
    const isThinkingMsg = isThinkingMessage(item);
    const isToolResultMsg = isToolResultMessage(item);
    const isImageMsg = isImageMessage(item);

    const messageStyle = [
      styles.messageContainer,
      isUser ? styles.userMessage : styles.assistantMessage,
      isUser ? {backgroundColor: colors.primary + '20'} : {backgroundColor: colors.card},
      item.error && styles.errorMessage,
      item.error && {backgroundColor: colors.error + '20', borderColor: colors.error},
      isToolCallMsg && styles.toolCallMessage,
      isThinkingMsg && styles.thinkingMessage,
      isToolResultMsg && styles.toolResultMessage,
      isImageMsg && styles.imageMessage,
    ];

    // 渲染消息内容
    const renderMessageContent = () => {
      // 根据类型渲染不同内容
      if (isAIMsg) {
        return renderAIMessage(item);
      } else if (isImageMsg) {
        return renderImageMessage(item);
      } else {
        // 默认为文本消息
        return renderTextMessage(item as TextMessage);
      }
    };

    return (
      <View style={messageStyle}>
        <View style={styles.messageHeader}>
          <Text style={[styles.messageRole, {color: colors.text}]}>
            {isUser ? '你' : 'AI助手'}
            {isToolCallMsg && ' 🔧'}
            {isThinkingMsg && ' 💭'}
            {isToolResultMsg && ' 📊'}
          </Text>
          <Text style={[styles.messageTime, {color: colors.secondaryText}]}>
            {item.timestamp ? dayjs(item.timestamp).format('YYYY/MM/DD HH:mm:ss') : ''}
          </Text>
        </View>
        {renderMessageContent()}
      </View>
    );
  };

  // 渲染图片消息
  const renderImageMessage = (item: ImageMessage) => {
    const error = item.error;
    const imageUri = item.imageUri;
    const caption = item.caption;

    if (error) {
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={() => handleCopyMessage(caption || '')}
          delayLongPress={500}
        >
          <>
            <Text style={[
              styles.messageText,
              {color: colors.text},
              error && {color: colors.error},
            ]}>
              {caption}
            </Text>
            <TouchableOpacity
              style={[styles.configureButton, {backgroundColor: colors.primary}]}
              onPress={handleConfigure}
            >
              <Text style={styles.configureButtonText}>检查配置</Text>
            </TouchableOpacity>
          </>
        </TouchableOpacity>
      );
    }

    // 显示图片预览
    return (
      <View style={styles.imageMessageContainer}>
        <View style={[styles.imagePreviewWrapper, {backgroundColor: colors.card}]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.imagePreview}
            resizeMode="cover"
          />
        </View>
        {caption && caption.trim() !== '' && (
          <Text style={[styles.messageText, {color: colors.text, marginTop: 8}]}>
            {caption}
          </Text>
        )}
      </View>
    );
  };

  // 渲染文本消息
  const renderTextMessage = (item: TextMessage) => {
    const error = item.error;

    if (error) {
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={() => handleCopyMessage(item.content)}
          delayLongPress={500}
        >
          <>
            <Text style={[
              styles.messageText,
              {color: colors.text},
              error && {color: colors.error},
            ]}>
              {item.content}
            </Text>
            <TouchableOpacity
              style={[styles.configureButton, {backgroundColor: colors.primary}]}
              onPress={handleConfigure}
            >
              <Text style={styles.configureButtonText}>检查配置</Text>
            </TouchableOpacity>
          </>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => handleCopyMessage(item.content)}
        delayLongPress={500}
        style={styles.messageTouchable}
      >
        <MarkdownRenderer
          content={item.content}
          isDarkMode={isDarkMode}
          containerStyle={styles.markdownContainer}
          textStyle={{
            ...styles.messageText,
            color: colors.text,
          }}
        />
      </TouchableOpacity>
    );
  };

  const isThinkingMessage = (msg: BaseMessage): msg is ThinkingMessage => {
    return (msg as ThinkingMessage).type === 'thinking';
  };

  const isToolCallMessage = (msg: BaseMessage): msg is ToolCallMessage => {
    return (msg as ToolCallMessage).type === 'tool_call';
  };

  const isToolResultMessage = (msg: BaseMessage): msg is ToolResultMessage => {
    return (msg as ToolResultMessage).type === 'tool_result';
  };

  const isAIMessage = (msg: BaseMessage): msg is AIMessage => {
    return (msg as AIMessage).type === 'ai';
  };

  const isImageMessage = (msg: BaseMessage): msg is ImageMessage => {
    return (msg as ImageMessage).type === 'image';
  };

  // 渲染AI复合消息 - 按顺序循环渲染messageList中的消息
  const renderAIMessage = (item: AIMessage) => {
    // 获取折叠状态
    return (
      <View style={styles.aiMessageContainer}>
        {/* 按顺序渲染messageList中的每个消息 */}
        {item.messageList.map((msg) => {
          // 为每个消息生成唯一的折叠状态key，使用消息ID而不是索引，提高稳定性
          const isCollapsed = msg.collapsed;

          // 根据消息类型渲染不同的UI
          switch (msg.type) {
            case 'thinking': {
              const thinkingMsg = msg as ThinkingMessage;
              return (
                <View key={msg.id} style={styles.aiSection}>
                  <View style={styles.aiSectionHeader}>
                    <Text style={[styles.aiSectionTitle, {color: colors.text}]}>
                      💭 思考过程
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleToggleMessageCollapse(item.id, msg.id)}
                      style={styles.collapseButton}
                    >
                      <Text style={[styles.collapseButtonText, {color: colors.primary}]}>
                        {isCollapsed ? '展开' : '折叠'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {!isCollapsed && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onLongPress={() => handleCopyMessage(thinkingMsg.thinkingContent)}
                      delayLongPress={500}
                      style={styles.messageTouchable}
                    >
                      <Text style={[styles.aiThinkingContent, {color: colors.secondaryText}]}>
                        {thinkingMsg.thinkingContent}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            case 'tool_call': {
              const toolCallMsg = msg as ToolCallMessage;

              // 获取工具调用状态图标
              const getToolCallStatusIcon = () => {
                if (toolCallMsg.loading) {
                  return '⏳'; // 执行中
                }

                if (toolCallMsg.resultMessage) {
                  return toolCallMsg.resultMessage.success ? '🔧 ✅' : '🔧 ❌';
                }

                return '🔧'; // 默认，未开始或状态未知
              };

              const statusIcon = getToolCallStatusIcon();

              // 检查是否为OCR识别工具
              const isOCRRecognize = toolCallMsg.toolName === 'ocr_recognize';
              let imageUri: string | null = null;

              if (isOCRRecognize && toolCallMsg.arguments) {
                try {
                  // 尝试从参数中提取imageUri
                  const args = typeof toolCallMsg.arguments === 'string'
                    ? JSON.parse(toolCallMsg.arguments)
                    : toolCallMsg.arguments;
                  if (args && args.imageUri) {
                    imageUri = args.imageUri;
                  }
                } catch (error) {
                  console.log('解析OCR参数失败:', error);
                }
              }

              return (
                <View key={msg.id} style={styles.aiSection}>
                  <View style={styles.aiSectionHeader}>
                    <Text style={[styles.aiSectionTitle, {color: colors.text}]}>
                      {statusIcon} 工具调用: {toolCallMsg.toolName}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleToggleMessageCollapse(item.id, msg.id)}
                      style={styles.collapseButton}
                    >
                      <Text style={[styles.collapseButtonText, {color: colors.primary}]}>
                        {isCollapsed ? '展开' : '折叠'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {!isCollapsed && (
                    <View style={[styles.toolCallItem, {backgroundColor: colors.card}]}>
                      <View style={styles.toolCallHeader}>
                        <Text style={[styles.toolCallName, {color: colors.text}]}>
                          {statusIcon} {toolCallMsg.toolName}
                        </Text>
                      </View>

                      {/* OCR识别工具的特殊显示 */}
                      {isOCRRecognize && imageUri && (
                        <View style={styles.ocrPreviewContainer}>
                          <Text style={[styles.ocrPreviewTitle, {color: colors.secondaryText}]}>
                            小票图片预览:
                          </Text>
                          <View style={[styles.imagePreviewWrapper, {backgroundColor: colors.card}]}>
                            <Image
                              source={{ uri: imageUri }}
                              style={styles.imagePreview}
                              resizeMode="cover"
                            />
                            {/* 扫描动画 */}
                            <OCRScanAnimation
                              isActive={toolCallMsg.loading || false}
                              containerStyle={styles.ocrAnimationOverlay}
                            />
                          </View>
                        </View>
                      )}

                      {/* 参数 */}
                      {toolCallMsg.arguments && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onLongPress={() => {
                            const contentToCopy = typeof toolCallMsg.arguments === 'string'
                              ? toolCallMsg.arguments
                              : JSON.stringify(toolCallMsg.arguments, null, 2);
                            handleCopyMessage(contentToCopy);
                          }}
                          delayLongPress={500}
                          style={styles.toolCallSection}
                        >
                          <Text style={[styles.toolCallSectionTitle, {color: colors.secondaryText}]}>
                            参数:
                          </Text>
                          <Text style={[styles.toolCallContent, {color: colors.text}]}>
                            {typeof toolCallMsg.arguments === 'string'
                              ? toolCallMsg.arguments
                              : JSON.stringify(toolCallMsg.arguments, null, 2)}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* 结果 */}
                      {toolCallMsg.resultMessage?.result !== undefined && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onLongPress={() => {
                            const contentToCopy = typeof toolCallMsg.resultMessage?.result === 'string'
                              ? toolCallMsg.resultMessage.result
                              : JSON.stringify(toolCallMsg.resultMessage?.result, null, 2);
                            handleCopyMessage(contentToCopy);
                          }}
                          delayLongPress={500}
                          style={styles.toolCallSection}
                        >
                          <Text style={[styles.toolCallSectionTitle, {color: colors.success}]}>
                            结果:
                          </Text>
                          <Text style={[styles.toolCallContent, {color: colors.text}]}>
                            {typeof toolCallMsg.resultMessage.result === 'string'
                              ? toolCallMsg.resultMessage.result
                              : JSON.stringify(toolCallMsg.resultMessage.result, null, 2)}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* 错误 */}
                      {toolCallMsg.resultMessage?.errorMessage && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onLongPress={() => handleCopyMessage(toolCallMsg.resultMessage?.errorMessage || '')}
                          delayLongPress={500}
                          style={styles.toolCallSection}
                        >
                          <Text style={[styles.toolCallSectionTitle, {color: colors.error}]}>
                            错误:
                          </Text>
                          <Text style={[styles.toolCallContent, {color: colors.text}]}>
                            {toolCallMsg.resultMessage.errorMessage}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            }

            case 'text': {
              const textMsg = msg as TextMessage;
              // 用户消息不应该在这里出现，但为了安全起见，只渲染非用户消息
              if (textMsg.isUser) {
                return null;
              }
              return (
                <TouchableOpacity
                  key={msg.id}
                  activeOpacity={0.7}
                  onLongPress={() => handleCopyMessage(textMsg.content)}
                  delayLongPress={500}
                  style={styles.aiSectionTouchable}
                >
                  <View style={styles.aiSection}>
                    <MarkdownRenderer
                      content={textMsg.content}
                      isDarkMode={isDarkMode}
                      containerStyle={styles.markdownContainer}
                      textStyle={{
                        ...styles.messageText,
                        color: colors.text,
                      }}
                    />
                  </View>
                </TouchableOpacity>
              );
            }

            default:
              return null;
          }
        })}

        {/* 加载状态 */}
        {item.loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, {color: colors.secondaryText}]}>AI思考中...</Text>
          </View>
        )}

        {/* 错误状态 */}
        {item.error && (
          <TouchableOpacity
            style={[styles.configureButton, {backgroundColor: colors.primary}]}
            onPress={handleConfigure}
          >
            <Text style={styles.configureButtonText}>检查配置</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // 切换单个消息的折叠状态
  const handleToggleMessageCollapse = (messageId: string, msgId: string) => {
    // 暂时禁用自动滚动，防止展开/折叠时滚动到底部
    setShouldAutoScroll(false);
    shouldAutoScrollRef.current = false;

    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && isAIMessage(msg)) {
        msg.messageList.map(msgItem => {
          if (msgItem.id === msgId) {
            msgItem.collapsed = !msgItem.collapsed;
          }
        });
      }
      return msg;
    }));

    // 短暂延迟后重新启用自动滚动（用于其他情况）
    setTimeout(() => {
      setShouldAutoScroll(true);
      shouldAutoScrollRef.current = true;
    }, 500);
  };

  // 配置检查中
  if (checkingConfig && isConfigured === null) {
    return (
      <SafeAreaView style={[styles.centeredContainer, {backgroundColor: colors.background}]} edges={['top']}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
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
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['top']}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* 顶部区域：BookSelector和标题 */}
      <View style={[styles.topSection, {backgroundColor: colors.background}]}>
        {/* BookSelector - 确保在状态栏下方 */}
        <BookSelector />
      </View>

      {/* 主内容区域：聊天列表和输入框 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        {/* 聊天消息列表 */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.messagesList,
            { paddingBottom: Platform.select({ios: 140, android: 120}) }, // 增加paddingBottom，为浮动操作栏和输入框留出空间
          ]}
          onScroll={(event) => {
            // 如果正在滚动到底部，不更新 isAtBottom 状态
            if (isScrollingToBottomRef.current) {
              return;
            }

            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            // 判断是否接近底部（距离底部50像素以内）
            const isCloseToBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 50;

            // 使用防抖逻辑，避免频繁更新状态
            // 清除之前的定时器
            if (scrollTimeoutRef.current) {
              clearTimeout(scrollTimeoutRef.current);
            }

            // 设置新的定时器，延迟更新状态
            scrollTimeoutRef.current = setTimeout(() => {
              // 只有在不在滚动到底部的过程中才更新状态
              if (!isScrollingToBottomRef.current) {
                setIsAtBottom(isCloseToBottom);
              }
            }, 100);
          }}
          onContentSizeChange={() => {
            // 只在应该自动滚动时才滚动到底部
            if (shouldAutoScrollRef.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
              // 滚动到底部后，更新isAtBottom状态
              setIsAtBottom(true);
            }
          }}
          onLayout={() => {
            setTimeout(() => {
              if (shouldAutoScrollRef.current) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }, 100);
          }}
          style={styles.flatList}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
        />

        {/* 悬浮按钮栏 */}
        <View style={[styles.floatingActionBar]}>
          <TouchableOpacity
            style={[styles.floatingActionButton, {backgroundColor: colors.success}]}
            onPress={handleTakePhotoForAccounting}
            disabled={isSelectingImage || isProcessing}
          >
            <Text style={styles.floatingActionButtonText}>📷 拍摄图片记账</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.floatingActionButton, {backgroundColor: colors.primary}]}
            onPress={handleSelectImageForAccounting}
            disabled={isSelectingImage || isProcessing}
          >
            <Text style={styles.floatingActionButtonText}>🖼️ 上传图片记账</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.floatingActionButton, {backgroundColor: colors.warning}]}
            onPress={handleClearChat}
            disabled={messages.length <= 1}
          >
            <Text style={styles.floatingActionButtonText}>🗑️ 清除记录</Text>
          </TouchableOpacity>
        </View>

        {/* 输入区域 */}
        <View style={[styles.inputContainer, {backgroundColor: colors.card, borderTopColor: colors.border}]}>
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
            {isProcessing ? (
                (
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
                )
              ) : (
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    {backgroundColor: colors.primary},
                    (!inputText.trim() || isProcessing) && [styles.sendButtonDisabled, {backgroundColor: colors.secondaryText}],
                  ]}
                  onPress={handleSend}
                  disabled={!inputText.trim() || isProcessing}
                >
                  <Text style={styles.sendButtonText}>发送</Text>
                </TouchableOpacity>
              )}
          </View>

          {/* AI提示建议 */}
          {aiSuggestionEnabled ? (
            <View style={styles.hintsContainerWrapper}>
              {isGeneratingSuggestions ? (
                <ActivityIndicator size="small" color={colors.primary}/>
              ) : (
                <ScrollView
                  style={styles.hintsScrollView}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hintsScrollContent}
                >
                  {(suggestions.length > 0 ? suggestions : getFallbackSuggestions(inputText)).map((hint, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.hintButton, {backgroundColor: colors.card, borderColor: colors.border}]}
                      onPress={() => setInputText(hint)}
                      disabled={isProcessing}
                    >
                      <Text style={[styles.hintText, {color: colors.primary}]}>{hint}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>) : (<View />)}
        </View>
      </KeyboardAvoidingView>

      {/* 回到底部浮动按钮 */}
      {!isAtBottom && (
        <TouchableOpacity
          style={[styles.scrollToBottomButton, { backgroundColor: colors.primary }]}
          onPress={scrollToBottom}
          activeOpacity={0.8}
        >
          <Text style={styles.scrollToBottomButtonIcon}>↓</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messageTouchable: {
    // 确保TouchableOpacity不会影响布局
  },
  aiSectionTouchable: {
    // 确保TouchableOpacity不会影响布局
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  topSection: {
    // 顶部区域，包含BookSelector和标题
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  headerButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    marginBottom: 4,
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
    includeFontPadding: false, // 移除字体内边距，使文本垂直居中更好
    lineHeight: 18, // 减少行高，适应缩小后的按钮高度，确保文本完美垂直居中
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 150, // 调整位置，因为输入容器现在包含浮动操作栏
    right: 12,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    zIndex: 1000,
  },
  scrollToBottomButtonIcon: {
    fontSize: 20, // 从24减少到20
    color: '#fff',
    fontWeight: 'bold',
  },
  scrollToBottomButtonText: {
    fontSize: 12,
    color: '#fff',
    marginTop: 2,
  },
  flatList: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  messageContainer: {
    maxWidth: '85%',
    minWidth: '85%',
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
  imageMessage: {
    // 可以添加特定的图片消息样式
  },
  aiMessageContainer: {
    width: '100%',
  },
  aiSection: {
    marginBottom: 16,
  },
  aiSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  aiThinkingContent: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 12,
    borderRadius: 8,
  },
  aiContent: {
    fontSize: 16,
    lineHeight: 22,
  },
  toolCallsContainer: {
    gap: 12,
  },
  toolCallItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  toolCallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolCallName: {
    fontSize: 14,
    fontWeight: '600',
  },
  toolCallStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  toolCallSection: {
    marginBottom: 8,
  },
  toolCallSectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  toolCallContent: {
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  toolCallContainer: {
    marginTop: 8,
  },
  toolCallTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  thinkingContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 8,
  },
  thinkingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  thinkingTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  thinkingContent: {
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  toolResultContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 8,
  },
  toolResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  toolResultTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  toolResultMeta: {
    fontSize: 11,
    marginBottom: 4,
  },
  toolResultSection: {
    marginTop: 6,
  },
  toolResultSectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  toolResultContent: {
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 6,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  collapseButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  collapseButtonText: {
    fontSize: 12,
    fontWeight: '500',
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
  floatingActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 2,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  floatingActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  floatingActionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  inputContainer: {
    paddingTop: 4,
    paddingHorizontal: 8,
    paddingBottom: 2,
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
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 6,
    borderWidth: 1,
  },
  sendButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 38, // 从40减少到38，使发送按钮更紧凑
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hintsContainerWrapper: {
    marginTop: 2,
    minHeight: 44, // 增加最小高度以适应更高的按钮
    maxHeight: 88, // 增加最大高度以适应两行更高的按钮
  },
  hintsScrollView: {
    flexGrow: 0,
    marginTop: 0,
  },
  hintsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16, // 添加右侧内边距，让最后一个按钮有空间
    paddingVertical: 2, // 添加垂直内边距，确保按钮有足够的空间
  },
  hintButton: {
    paddingHorizontal: 14,
    paddingVertical: 5, // 减少垂直内边距，为文本提供更多空间
    borderRadius: 20,
    marginRight: 10, // 从12减少到10，使建议按钮之间的间距更紧凑
    borderWidth: 1,
    height: 40, // 从44减少到40，缩小按钮高度
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0, // 防止按钮被压缩
  },
  markdownContainer: {
    marginTop: 4,
  },
  // 图片消息容器
  imageMessageContainer: {
    width: '100%',
  },
  imageSourceBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  imageSourceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  imageHintText: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  // OCR相关样式
  ocrPreviewContainer: {
    marginBottom: 12,
  },
  ocrPreviewTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  imagePreviewWrapper: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
    marginHorizontal: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  ocrAnimationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  ocrAnimationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  glowEffect: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  scanningText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});

export default AIChatScreen;
