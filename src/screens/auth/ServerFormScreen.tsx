import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator, Switch, Text as RNText } from 'react-native';
import { Input, Button } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { ServerConfig } from '../../types';
import serverConfigManager from '../../services/serverConfig';
import api from '../../services/api.ts';
import { useTheme, getColors } from '../../context/ThemeContext';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type ServerFormRouteProp = RouteProp<MainStackParamList, 'ServerForm'>;

const ServerFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ServerFormRouteProp>();
  const { serverId } = route.params || {};
  const { login, isLoading, saveServerConfig } = useAuth();
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loggingEnabled, setLoggingEnabled] = useState(false);

  // 加载服务器配置
  useEffect(() => {
    const loadServerConfig = async () => {
      if (serverId) {
        setFormLoading(true);
        try {
          const configs = await serverConfigManager.getAllConfigs();
          const config = configs.find(c => c.id === serverId);
          if (config) {
            setName(config.name);
            setBaseUrl(config.url);
            setUsername(config.username || '');
            setPassword(config.password || '');
            setLoggingEnabled(config.loggingEnabled || false);
          }
        } catch (error) {
          console.error('加载服务器配置失败', error);
          Alert.alert('错误', '加载服务器配置失败');
        } finally {
          setFormLoading(false);
        }
      }
    };

    loadServerConfig();
  }, [serverId]);

  // 保存服务器配置
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('错误', '请输入服务器名称');
      return;
    }

    if (!baseUrl.trim()) {
      Alert.alert('错误', '请输入服务器地址');
      return;
    }

    // 简单的URL格式验证
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      Alert.alert('错误', '服务器地址必须以http://或https://开头');
      return false;
    }

    if (!username.trim()) {
      Alert.alert('错误', '请输入用户名');
      return;
    }

    if (!password.trim()) {
      Alert.alert('错误', '请输入密码');
      return;
    }

    try {
      const config: ServerConfig = {
        id: serverId || serverConfigManager.generateId(),
        name: name.trim(),
        url: baseUrl.trim(),
        username: username.trim(),
        password: password.trim(),
        loggingEnabled: loggingEnabled,
      };

      try {
        // 初始化API
        api.init(config);
        await login(config.username, config.password);
        await saveServerConfig(config);
        // 登录成功后会自动跳转到主页面
        // 使用 requestAnimationFrame 确保状态更新完成
        requestAnimationFrame(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
        });
      } catch (error: any) {
        Alert.alert(
            '登录失败',
            `登录失败${error}`,
            [{ text: '确定' }]
        );
      }
    } catch (error) {
      console.error('保存服务器配置失败', error);
      Alert.alert('错误', '保存服务器配置失败');
    }
  }, [name, baseUrl, username, password, serverId, loggingEnabled, saveServerConfig, navigation]);

  if (formLoading || isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
          <Input
            label="服务器名称"
            placeholder="请输入服务器名称"
            value={name}
            onChangeText={setName}
            disabled={isLoading}
            labelStyle={{ color: colors.text }}
            inputStyle={[{ color: colors.text }, { paddingVertical: 0 }]}
            placeholderTextColor={colors.secondaryText}
            leftIcon={{ type: 'material', name: 'label', color: colors.primary }}
            errorMessage={name.trim() ? '' : '服务器名称不能为空'}
            errorStyle={{ color: colors.error }}
          />

          <Input
            label="服务器地址"
            placeholder="http(s)://domain(:port)"
            value={baseUrl}
            onChangeText={setBaseUrl}
            disabled={isLoading}
            labelStyle={{ color: colors.text }}
            inputStyle={[{ color: colors.text }, { paddingVertical: 0 }]}
            placeholderTextColor={colors.secondaryText}
            leftIcon={{ type: 'material', name: 'link', color: colors.primary }}
            errorMessage={baseUrl.trim() ? '' : '服务器地址不能为空'}
            errorStyle={{ color: colors.error }}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Input
            label="用户名"
            placeholder="请输入用户名"
            value={username}
            onChangeText={setUsername}
            disabled={isLoading}
            labelStyle={{ color: colors.text }}
            inputStyle={[{ color: colors.text }, { paddingVertical: 0 }]}
            placeholderTextColor={colors.secondaryText}
            leftIcon={{ type: 'material', name: 'person', color: colors.primary }}
            errorMessage={username.trim() ? '' : '用户名不能为空'}
            errorStyle={{ color: colors.error }}
            autoCapitalize="none"
          />

          <Input
            label="密码"
            placeholder="请输入密码"
            value={password}
            onChangeText={setPassword}
            disabled={isLoading}
            labelStyle={{ color: colors.text }}
            inputStyle={[{ color: colors.text }, { paddingVertical: 0 }]}
            placeholderTextColor={colors.secondaryText}
            leftIcon={{ type: 'material', name: 'lock', color: colors.primary }}
            rightIcon={{
              type: 'material',
              name: showPassword ? 'visibility-off' : 'visibility',
              color: colors.primary,
              onPress: () => setShowPassword(!showPassword),
            }}
            errorMessage={password.trim() ? '' : '密码不能为空'}
            errorStyle={{ color: colors.error }}
            secureTextEntry={!showPassword}
          />

          <View style={styles.switchContainer}>
            <View style={styles.switchTextContainer}>
              <RNText style={[styles.switchLabel, { color: colors.text }]}>启用日志记录</RNText>
              <RNText style={[styles.switchDescription, { color: colors.secondaryText }]}>
                启用后将记录应用运行日志，可能会占用额外存储空间
              </RNText>
            </View>
            <Switch
              value={loggingEnabled}
              onValueChange={setLoggingEnabled}
              trackColor={{ false: '#d1d1d1', true: colors.primary + '80' }}
              thumbColor={loggingEnabled ? colors.primary : '#f4f3f4'}
              disabled={isLoading}
            />
          </View>

      <Button
        title={serverId ? '保存修改' : '添加服务器'}
        onPress={handleSave}
        buttonStyle={[styles.saveButton, { backgroundColor: colors.primary }]}
        loading={isLoading}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 8,
  },
  saveButton: {
    marginTop: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 20,
    marginTop: 10,
  },
  switchTextContainer: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchDescription: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default ServerFormScreen;
