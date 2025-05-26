/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@rneui/themed';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { logger } from './src/services/LogService';
import { setupErrorHandlers } from './src/utils/errorHandler';
import AppNavigator from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';
import { BookProvider } from './src/context/BookContext';
import { BookkeepingProvider } from './src/context/BookkeepingContext';

const App = () => {
  // 初始化日志服务和错误处理
  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('开始初始化应用...');

        // 初始化日志服务
        try {
          // 初始化日志服务 (这将设置控制台捕获)
          await logger.initialize();
          console.log('日志服务初始化成功，控制台日志将被捕获');

          // 记录一条应用启动日志
          await logger.info('App', '应用启动成功');
        } catch (logError) {
          console.error('日志服务初始化失败:', logError);
        }

        // 设置全局错误处理
        try {
          setupErrorHandlers();
          console.log('全局错误处理已设置');
          await logger.info('App', '全局错误处理已设置');
        } catch (errorHandlerError) {
          console.error('设置全局错误处理失败:', errorHandlerError);
        }
      } catch (error) {
        console.error('应用初始化失败:', error);
        Alert.alert('初始化失败', '应用初始化过程中发生错误，某些功能可能受限。');
      }
    };

    initApp();

    return () => {
      // 记录应用退出日志
      try {
        logger.info('App', '应用退出');
      } catch (error) {
        console.warn('记录应用退出日志失败:', error);
      }
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#f5f5f5"
          translucent={false}
        />
        <ThemeProvider>
          <AuthProvider>
            <BookProvider>
              <BookkeepingProvider>
                <AppNavigator />
              </BookkeepingProvider>
            </BookProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
