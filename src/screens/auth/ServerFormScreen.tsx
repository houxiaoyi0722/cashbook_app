import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Input, Button } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { ServerConfig } from '../../types';
import serverConfigManager from '../../services/serverConfig';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type ServerFormRouteProp = RouteProp<MainStackParamList, 'ServerForm'>;

const ServerFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ServerFormRouteProp>();
  const { serverId } = route.params || {};
  const { login, isLoading, saveServerConfig } = useAuth();

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);

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
      };

      try {
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
  }, [name, baseUrl, username, password, serverId, saveServerConfig, navigation]);

  if (formLoading || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text h4 style={styles.title}>{serverId ? '编辑服务器' : '添加服务器'}</Text>

          <Input
            label="服务器名称"
            placeholder="请输入服务器名称"
            value={name}
            onChangeText={setName}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'label', color: '#1976d2' }}
            errorMessage={name.trim() ? '' : '服务器名称不能为空'}
          />

          <Input
            label="服务器地址"
            placeholder="http(s)://domain(:port)"
            value={baseUrl}
            onChangeText={setBaseUrl}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'link', color: '#1976d2' }}
            errorMessage={baseUrl.trim() ? '' : '服务器地址不能为空'}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Input
            label="用户名"
            placeholder="请输入用户名"
            value={username}
            onChangeText={setUsername}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'person', color: '#1976d2' }}
            errorMessage={username.trim() ? '' : '用户名不能为空'}
            autoCapitalize="none"
          />

          <Input
            label="密码"
            placeholder="请输入密码"
            value={password}
            onChangeText={setPassword}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'lock', color: '#1976d2' }}
            errorMessage={password.trim() ? '' : '密码不能为空'}
            secureTextEntry
          />

      <Button
        title={serverId ? '保存修改' : '添加服务器'}
        onPress={handleSave}
        buttonStyle={styles.saveButton}
        loading={isLoading}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#1976d2',
    marginTop: 16,
  },
});

export default ServerFormScreen;
