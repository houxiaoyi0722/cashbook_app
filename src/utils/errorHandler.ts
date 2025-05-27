import { Alert, Platform } from 'react-native';
import { logger } from '../services/LogService';

// 定义全局变量类型
declare const global: any;

/**
 * 设置全局未捕获异常处理
 * 捕获 JS 运行时异常和 Promise 未处理的拒绝，并记录到日志文件
 */
export const setupErrorHandlers = () => {
  // 处理未捕获的 JS 异常
  const originalErrorHandler = ErrorUtils.getGlobalHandler();
  console.log(1111)
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    // 记录到日志文件
    logger.error('GlobalError', '未捕获的 JS 异常', {
      message: error.message,
      stack: error.stack,
      isFatal: isFatal ?? false,
    });

    // 对于致命错误，显示用户友好提示
    if (isFatal) {
      Alert.alert(
        '应用遇到问题',
        '很抱歉，应用遇到了一个问题。错误信息已被记录，请尝试重启应用。',
        [{ text: '确定' }]
      );
    }

    // 调用原始错误处理程序
    originalErrorHandler(error, isFatal);
  });

  // 处理未捕获的 Promise 拒绝
  if (__DEV__) {
    // 开发环境下才设置这个，避免在生产环境触发多余的警告
    const originalPromiseRejectionHandler =
      // @ts-ignore - React Native 内部 API
      global.RN_HMRClient?.registerBundle ?? null;

    if (originalPromiseRejectionHandler) {
      // @ts-ignore - React Native 内部 API
      global.RN_HMRClient.registerBundle = (...args) => {
        try {
          return originalPromiseRejectionHandler(...args);
        } catch (error) {
          logger.error('HMRError', '热重载错误', error);
          throw error;
        }
      };
    }
  }

  // 处理未捕获的 Promise 拒绝
  const handlePromiseRejection = (id: string, reason: any) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('PromiseRejection', '未处理的 Promise 拒绝', {
      id,
      message: error.message,
      stack: error.stack,
    });
  };

  // 针对不同平台设置不同的 Promise 拒绝处理
  if (Platform.OS === 'ios') {
    // iOS 特定处理
    // 遗憾的是 React Native 没有直接暴露未处理 Promise 拒绝的 API
  } else {
    // Android 特定处理
    if (global.HermesInternal) {
      // Hermes 引擎
      console.warn('Running on Hermes JavaScript engine');
    }
  }

  // 注册全局的 unhandledrejection 事件监听器
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('unhandledrejection', (event: any) => {
      const reason = event?.reason || 'Unknown Promise Rejection';
      logger.error('PromiseRejection', '未处理的 Promise 拒绝', reason);
    });
  }
};

/**
 * 全局 try-catch 包装器
 * @param fn 要执行的函数
 * @param tag 日志标签
 * @param showAlert 是否显示错误弹窗
 * @returns 包装后的函数
 */
export const withErrorHandling = <T extends (...args: any[]) => any>(
  fn: T,
  tag: string = 'Function',
  showAlert: boolean = false
): ((...args: Parameters<T>) => ReturnType<T> | undefined) => {
  return (...args: Parameters<T>): ReturnType<T> | undefined => {
    try {
      return fn(...args);
    } catch (error) {
      logger.error(tag, `函数执行错误: ${fn.name || '匿名函数'}`, error);

      if (showAlert) {
        Alert.alert(
          '操作失败',
          '执行操作时遇到错误，请稍后重试。'
        );
      }

      return undefined;
    }
  };
};
