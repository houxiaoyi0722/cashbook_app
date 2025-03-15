import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Icon } from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 认证相关屏幕
import ServerListScreen from '../screens/auth/ServerListScreen';
import ServerFormScreen from '../screens/auth/ServerFormScreen';
import LoginScreen from '../screens/auth/LoginScreen';

// 主应用屏幕
import CalendarScreen from '../screens/main/CalendarScreen';
import StatisticsScreen from '../screens/main/StatisticsScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import BookListScreen from '../screens/main/BookListScreen';
import BookFormScreen from '../screens/main/BookFormScreen';
import FlowFormScreen from '../screens/main/FlowFormScreen';
import FlowDetailScreen from '../screens/main/FlowDetailScreen';

// 上下文提供者
import { AuthProvider } from '../context/AuthContext';
import { BookProvider } from '../context/BookContext';

// 导航类型
import { MainStackParamList, MainTabParamList } from './types';
import { NativeEventEmitter } from 'react-native';

export const eventBus = new NativeEventEmitter();
// 创建导航器
const Stack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// 主标签导航
const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#1976d2',
        tabBarInactiveTintColor: '#757575',
        tabBarLabelStyle: {
          fontSize: 12,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          tabBarLabel: '日历',
          tabBarIcon: ({ color, size }) => (
            <Icon name="calendar-today" type="material" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{
          tabBarLabel: '统计',
          tabBarIcon: ({ color, size }) => (
            <Icon name="bar-chart" type="material" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: '设置',
          tabBarIcon: ({ color, size }) => (
            <Icon name="settings" type="material" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// 主导航
const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState<keyof MainStackParamList>('ServerList');

  // 检查初始路由
  useEffect(() => {
    const checkInitialRoute = async () => {
      try {
        // 检查是否有服务器配置
        const serverConfig = await AsyncStorage.getItem('server_config');
        // 检查是否已登录
        const userInfo = await AsyncStorage.getItem('user_info');
        // 检查是否有当前账本
        const currentBook = await AsyncStorage.getItem('current_book');

        if (serverConfig && userInfo) {
          if (currentBook) {
            setInitialRoute('MainTabs');
          } else {
            setInitialRoute('BookList');
          }
        } else if (serverConfig) {
          setInitialRoute('Login');
        } else {
          setInitialRoute('ServerList');
        }
      } catch (error) {
        console.error('检查初始路由失败', error);
        setInitialRoute('ServerList');
      } finally {
        setIsLoading(false);
      }
    };

    checkInitialRoute();
  }, []);

  if (isLoading) {
    return null; // 或者显示加载指示器
  }

  return (
    <NavigationContainer>
      <AuthProvider>
        <BookProvider>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerStyle: {
                backgroundColor: '#1976d2',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          >
            {/* 认证相关屏幕 */}
            <Stack.Screen
              name="ServerList"
              component={ServerListScreen}
              options={{ title: '服务器列表' }}
            />
            <Stack.Screen
              name="ServerForm"
              component={ServerFormScreen}
              options={({ route }) => ({
                title: route.params?.serverId ? '编辑服务器' : '添加服务器',
              })}
            />
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ title: '登录' }}
            />

            {/* 主应用屏幕 */}
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="BookList"
              component={BookListScreen}
              options={{ title: '账本列表' }}
            />
            <Stack.Screen
              name="BookForm"
              component={BookFormScreen}
              options={({ route }) => ({
                title: route.params?.bookId ? '编辑账本' : '创建账本',
              })}
            />
            <Stack.Screen
              name="FlowForm"
              component={FlowFormScreen}
              options={({ route }) => ({
                title: route.params?.currentFlow ? '编辑流水' : '添加流水',
              })}
            />
            <Stack.Screen
              name="FlowDetail"
              component={FlowDetailScreen}
              options={{ title: '流水详情' }}
            />
          </Stack.Navigator>
        </BookProvider>
      </AuthProvider>
    </NavigationContainer>
  );
};

export default AppNavigator;
