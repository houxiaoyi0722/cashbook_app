import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, Card, Button, Input, Icon } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { serverConfig, login, isLoading, saveServerConfig } = useAuth();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  // 处理自动登录和用户名填充
  useEffect(() => {
    // 只在 serverConfig 变化且未尝试过自动登录时执行
    if (!serverConfig || autoLoginAttempted) return;
    
    const attemptAutoLogin = async () => {
      setUsername(serverConfig.username);
      
      if (serverConfig.password) {
        setAutoLoginAttempted(true);
        try {
          console.log('尝试自动登录...', { username: serverConfig.username });
          await login(serverConfig.username, serverConfig.password);
          // 登录成功后会自动跳转到主页面
          // 使用 requestAnimationFrame 确保状态更新完成
          requestAnimationFrame(() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          });
        } catch (error: any) {
          console.error('自动登录失败', error);
          Alert.alert(
            '自动登录失败',
            '使用保存的密码登录失败，请重新输入密码。',
            [{ text: '确定' }]
          );
        }
      }
    };
    
    attemptAutoLogin();
  }, [serverConfig, login, autoLoginAttempted]);

  // 验证表单
  const validateForm = useCallback(() => {
    if (!username.trim()) {
      Alert.alert('错误', '请输入用户名');
      return false;
    }
    
    if (!password.trim()) {
      Alert.alert('错误', '请输入密码');
      return false;
    }
    
    return true;
  }, [username, password]);

  // 处理登录
  const handleLogin = useCallback(async () => {
    if (!validateForm() || !serverConfig) return;
    
    try {
      console.log('开始登录...', { username });
      await login(username, password);
      
      // 登录成功后更新服务器配置
      const updatedConfig = {
        ...serverConfig,
        username,
        password
      };
      await saveServerConfig(updatedConfig);
      
      console.log('登录成功');
      
      // 使用 requestAnimationFrame 确保状态更新完成
      requestAnimationFrame(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        });
      });
    } catch (error: any) {
      console.error('登录失败', error);
      Alert.alert('登录失败', error.message || '请检查您的用户名和密码');
    }
  }, [validateForm, serverConfig, login, username, password, saveServerConfig, navigation]);

  // 切换服务器
  const handleSwitchServer = useCallback(() => {
    navigation.navigate('ServerList');
  }, [navigation]);

  if (!serverConfig) {
    return (
      <View style={styles.container}>
        <Card containerStyle={styles.card}>
          <Card.Title>未选择服务器</Card.Title>
          <Text style={styles.message}>请先选择或添加一个服务器</Text>
          <Button
            title="选择服务器"
            onPress={handleSwitchServer}
            containerStyle={styles.fullWidthButton}
          />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Card containerStyle={styles.card}>
          <Card.Title>登录到 {serverConfig.name}</Card.Title>
          
          <View style={styles.serverInfo}>
            <Text style={styles.serverUrl}>{serverConfig.url}</Text>
            <Button
              type="clear"
              icon={<Icon name="swap-horiz" color="#1976d2" />}
              title="切换服务器"
              titleStyle={styles.switchServerText}
              onPress={handleSwitchServer}
            />
          </View>
          
          <Input
            label="用户名"
            placeholder="请输入用户名"
            value={username}
            onChangeText={setUsername}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'person', color: '#1976d2' }}
            autoCapitalize="none"
            autoComplete="username"
          />
          
          <Input
            label="密码"
            placeholder="请输入密码"
            value={password}
            onChangeText={setPassword}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'lock', color: '#1976d2' }}
            rightIcon={
              <Icon
                name={showPassword ? 'visibility-off' : 'visibility'}
                onPress={() => setShowPassword(!showPassword)}
                color="#1976d2"
              />
            }
            secureTextEntry={!showPassword}
            autoComplete="password"
          />
          
          <Button
            title={isLoading ? '登录中...' : '登录'}
            onPress={handleLogin}
            disabled={isLoading}
            containerStyle={styles.loginButton}
          />
          
          {isLoading && <ActivityIndicator style={styles.loader} size="large" color="#1976d2" />}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    margin: 16,
    borderRadius: 10,
    padding: 16,
  },
  serverInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  serverUrl: {
    fontSize: 14,
    color: '#666',
  },
  switchServerText: {
    fontSize: 14,
    color: '#1976d2',
  },
  loginButton: {
    marginTop: 10,
  },
  loader: {
    marginTop: 20,
  },
  message: {
    textAlign: 'center',
    marginVertical: 20,
    color: '#666',
  },
  fullWidthButton: {
    width: '100%',
  },
});

export default LoginScreen; 