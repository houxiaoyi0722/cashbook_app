import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Icon} from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {StatusBar, View, ActivityIndicator, Image, Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme, getColors} from '../context/ThemeContext';

// 认证相关屏幕
import ServerListScreen from '../screens/auth/ServerListScreen';
import ServerFormScreen from '../screens/auth/ServerFormScreen';

// 主应用屏幕
import CalendarScreen from '../screens/main/CalendarScreen';
import StatisticsScreen from '../screens/main/StatisticsScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import BookListScreen from '../screens/main/BookListScreen';
import BookFormScreen from '../screens/main/BookFormScreen';
import FlowFormScreen from '../screens/main/FlowFormScreen';
import LogsScreen from '../screens/main/LogsScreen';
import SyncManagementScreen from '../screens/SyncManagementScreen';
import AIChatScreen from '../screens/ai/AIChatScreen';
import AIConfigScreen from '../screens/ai/AIConfigScreen';
import AIConfigEditScreen from '../screens/ai/AIConfigEditScreen';

// 自定义图标组件
import AINavigationIcon from '../components/icons/AINavigationIcon';

// 导航类型
import {MainStackParamList, MainTabParamList} from './types';
import api from '../services/api';
import {NativeEventEmitter} from 'react-native';
import BudgetScreen from '../screens/main/BudgetScreen.tsx';
// 导入 AI 助手配置服务
import AIAssistantConfigService from '../services/AIAssistantConfigService';
import serverConfigManager from '../services/serverConfig.ts';
import {aiConfigService} from '../services/AIConfigService.ts';
import {shareIntentService, ShareIntentData} from '../services/ShareIntentService';

export const eventBus = new NativeEventEmitter();
// 创建导航器
const Stack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// 主标签导航
const MainTabs = () => {
  const navigation = useNavigation<any>();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState<boolean>(false);
  const [aiName, setAiName] = useState<string>('AI助手');
  const [loading, setLoading] = useState<boolean>(true);

  // 加载 AI 助手启用状态并监听变化
  useEffect(() => {
    const loadAIAssistantEnabled = async () => {
      try {
        const enabled = await AIAssistantConfigService.isEnabled();
        setAiAssistantEnabled(enabled);

        // 加载助手名称
        const globalSettings = await aiConfigService.getGlobalSettings();
        setAiName(globalSettings.aiName || 'AI助手');
      } catch (error) {
        console.error('加载 AI 助手状态失败', error);
        setAiAssistantEnabled(false);
        setAiName('AI助手');
      } finally {
        setLoading(false);
      }
    };

    loadAIAssistantEnabled();

    // 监听 AI 助手启用状态变化事件
    const handleAIAssistantEnabledChanged = (enabled: boolean) => {
      setAiAssistantEnabled(enabled);
    };

    // 添加事件监听器
    eventBus.addListener(
      'ai_assistant_enabled_changed',
      handleAIAssistantEnabledChanged
    );

    // 清理函数
    return () => {
      eventBus.removeAllListeners(
        'ai_assistant_enabled_changed'
      );
    };
  }, []);

  // 处理分享intent
  useEffect(() => {
    const unsubscribe = shareIntentService.addListener(async (data: ShareIntentData) => {
      console.log('收到分享intent:', data);

      // 延迟清理分享数据
      setTimeout(async () => {
        try {
          const { ShareIntentModule } = require('react-native').NativeModules;
          if (ShareIntentModule?.clearShareIntent) {
            await ShareIntentModule.clearShareIntent();
          }
        } catch (e) {}
      }, 1000);

      if (data.type === 'ocr') {
        // OCR记账 - 跳转到日历页面
        const imageUri = data.imageUri;
        console.log('OCR图片:', imageUri);

        // 跳转到MainTabs然后切换到Calendar，并传递图片URI
        navigation.navigate('MainTabs', {
          screen: 'Calendar',
          params: { sharedImageUri: imageUri },
        });
      } else if (data.type === 'ai') {
        // 发送给AI - 跳转到AI聊天页面
        if (aiAssistantEnabled) {
          // 跳转到MainTabs然后切换到AIChat，并传递分享内容
          navigation.navigate('MainTabs', {
            screen: 'AIChat',
            params: {
              sharedImageUri: data.imageUri,
              sharedImageUris: data.imageUris,
            },
          });
        } else {
          Alert.alert(
            'AI助手未启用',
            '请先在设置中启用AI助手功能'
          );
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [navigation, aiAssistantEnabled]);

  // 如果正在加载，显示加载指示器
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

	return (
    <>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.statusBar}
        translucent={false}
      />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.secondaryText,
          tabBarLabelStyle: {
            fontSize: 12,
          },
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="Calendar"
          component={CalendarScreen}
          options={{
            tabBarLabel: '流水日历',
            tabBarIcon: ({ color, size }) => (
              <Icon iconProps={{ name: 'calendar-today', type: 'material', color, size }} />
            ),
          }}
        />
        <Tab.Screen
          name="Statistics"
          component={StatisticsScreen}
          options={{
            tabBarLabel: '统计',
            tabBarIcon: ({ color, size }) => (
              <Icon iconProps={{ name: 'bar-chart', type: 'material', color, size }} />
            ),
          }}
        />
        {/* 仅在 AI 助手启用时显示 AIChat 标签页 */}
        {aiAssistantEnabled && (
          <Tab.Screen
            name="AIChat"
            component={AIChatScreen}
            options={{
              tabBarLabel: aiName,
              tabBarIcon: ({ color, size }) => (
                <AINavigationIcon color={color} size={size} />
              ),
            }}
          />
        )}
        <Tab.Screen
          name="Budget"
          component={BudgetScreen}
          options={{
            tabBarLabel: '预算',
            tabBarIcon: ({ color, size }) => (
              <Icon iconProps={{ name: 'account-balance-wallet', type: 'material', color, size }} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: '设置',
            tabBarIcon: ({ color, size }) => (
              <Icon iconProps={{ name: 'settings', type: 'material', color, size }} />
            ),
          }}
        />
      </Tab.Navigator>
    </>
  );
};


// 主导航
const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState<keyof MainStackParamList>('ServerList');
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);


  // 验证token是否有效的函数
  const validateToken = async (): Promise<boolean> => {
    try {
			const currentServer = await serverConfigManager.getCurrentServer();
      if (!currentServer) {
        return false;
      }
      // 初始化API
      api.init(currentServer);


      // 尝试调用一个简单的API来验证token是否有效
      const response = await api.book.list();
      return response.c === 200;
    } catch (error: any) {
      console.error('Token验证失败', error);
      // 如果是401错误，说明token无效
      if (error.response && error.response.status === 401) {
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('current_user');
      }
      return false;
    }
  };


  // 检查初始路由
  useEffect(() => {
    const checkInitialRoute = async () => {
      try {
        // 首先检查是否处于离线模式
        const offlineMode = await AsyncStorage.getItem('offline_mode');
        if (offlineMode === 'true') {
          // 离线模式下，直接进入MainTabs（离线记账）
          setInitialRoute('MainTabs');
          setIsLoading(false);
          return;
        }


        // 检查是否有auth_token
        const authToken = await AsyncStorage.getItem('auth_token');


        if (!authToken) {
          // 没有token，跳转到服务器列表
          setInitialRoute('ServerList');
          setIsLoading(false);
          return;
        }


        // 验证token是否有效
        const isTokenValid = await validateToken();
        if (!isTokenValid) {
          // token无效，清除认证信息
          await AsyncStorage.removeItem('auth_token');
          await AsyncStorage.removeItem('current_user');
          setInitialRoute('ServerList');
          setIsLoading(false);
          return;
        }
        setInitialRoute('MainTabs');


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
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Image
          source={require('../../logo/web_hi_res_512_1.png')}
          style={{ width: 150, height: 150, resizeMode: 'contain' }}
        />
      </View>
    );
  }


	return (
		<NavigationContainer>
			<Stack.Navigator
				initialRouteName={initialRoute}
				screenOptions={{
					headerStyle: {
						backgroundColor: colors.primary,
					},
					headerTintColor: '#fff',
					headerTitleStyle: {
						fontWeight: 'bold',
					},
					// 确保标题栏不会延伸到状态栏
					headerTransparent: false,
					headerShadowVisible: false,
					// 设置内容样式
					contentStyle: {
						backgroundColor: colors.background,
					},
				}}
			>
				{/* 认证相关屏幕 */}
				<Stack.Screen
					name="ServerList"
					component={ServerListScreen}
					options={{title: '服务器列表'}}
				/>
				<Stack.Screen
					name="ServerForm"
					component={ServerFormScreen}
					options={({route}) => ({
						title: route.params?.serverId ? '编辑服务器' : '添加服务器',
					})}
				/>
				{/* 主应用屏幕 */}
				<Stack.Screen
					name="MainTabs"
					component={MainTabs}
					options={{headerShown: false}}
				/>
				<Stack.Screen
					name="BookList"
					component={BookListScreen}
					options={{title: '账本列表'}}
				/>
				<Stack.Screen
					name="BookForm"
					component={BookFormScreen}
					options={({route}) => ({
						title: route.params?.bookId ? '编辑账本' : '创建账本',
					})}
				/>
				<Stack.Screen
					name="FlowForm"
					component={FlowFormScreen}
					options={({route}) => ({
						title: route.params?.currentFlow ? '编辑流水' : '添加流水',
					})}
				/>
				<Stack.Screen
					name="Logs"
					component={LogsScreen}
					options={{title: '日志'}}
				/>
				<Stack.Screen
					name="SyncManagement"
					component={SyncManagementScreen}
					options={{title: '同步管理'}}
				/>
				{/* AI相关屏幕 */}
				<Stack.Screen
					name="AIConfig"
					component={AIConfigScreen}
					options={{title: 'AI助手配置'}}
				/>
        <Stack.Screen
          name="AIConfigEdit"
          component={AIConfigEditScreen}
          options={({route}) => ({
            title: route.params?.configId ? '编辑配置' : '新建配置',
          })}
        />

			</Stack.Navigator>
		</NavigationContainer>

	);
};

export default AppNavigator;
