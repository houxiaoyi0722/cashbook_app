import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Button, Input } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { ServerConfig } from '../../types';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, 'ServerForm'>;

const ServerFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { serverId } = route.params || {};
  const { serverConfigs, saveServerConfig } = useAuth();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 如果是编辑模式，加载服务器配置
  useEffect(() => {
    if (serverId) {
      const server = serverConfigs.find(s => s.id === serverId);
      if (server) {
        setName(server.name);
        setUrl(server.url);
        setUsername(server.username);
        setPassword(server.password);
      }
    }
  }, [serverId, serverConfigs]);

  // 验证表单
  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('错误', '请输入服务器名称');
      return false;
    }

    if (!url.trim()) {
      Alert.alert('错误', '请输入服务器地址');
      return false;
    }

    // 简单的URL格式验证
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('错误', '服务器地址必须以http://或https://开头');
      return false;
    }

    if (!username.trim()) {
      Alert.alert('错误', '请输入用户名');
      return false;
    }

    if (!password.trim()) {
      Alert.alert('错误', '请输入密码');
      return false;
    }

    return true;
  };

  // 处理保存
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);

      const serverConfig: ServerConfig = {
        id: serverId || Date.now().toString(),
        name: name.trim(),
        url: url.trim(),
        username: username.trim(),
        password: password.trim(),
      };

      await saveServerConfig(serverConfig);

      Alert.alert(
        '成功',
        serverId ? '服务器配置已更新' : '服务器配置已添加',
        [
          {
            text: '确定',
            onPress: () => {
              if (!serverId) {
                // 如果是新添加的服务器，导航到登录页面
                navigation.navigate('Login');
              } else {
                // 如果是更新服务器，返回上一页
                navigation.goBack();
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('保存服务器配置失败', error);
      Alert.alert('错误', '保存服务器配置失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <Card containerStyle={styles.card}>
          <Card.Title>{serverId ? '编辑服务器' : '添加服务器'}</Card.Title>

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
            value={url}
            onChangeText={setUrl}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'link', color: '#1976d2' }}
            errorMessage={url.trim() ? '' : '服务器地址不能为空'}
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

          <View style={styles.buttonContainer}>
            <Button
              title="取消"
              type="outline"
              containerStyle={styles.button}
              onPress={() => navigation.goBack()}
              disabled={isLoading}
            />

            <Button
              title={isLoading ? '保存中...' : '保存'}
              containerStyle={styles.button}
              onPress={handleSave}
              disabled={isLoading}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    width: '48%',
  },
});

export default ServerFormScreen;
