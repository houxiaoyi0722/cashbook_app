import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Icon, ListItem, Dialog, Input, Overlay } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { MainStackParamList } from '../../navigation/types';
import { version } from '../../../package.json';
import updateService from '../../services/updateService';
import api from '../../services/api.ts';
import { eventBus } from '../../navigation';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout } = useAuth();

  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 添加全局加载状态
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // 添加密码可见性状态
  const [oldPasswordVisible, setOldPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const [serverVersion, setServerVersion] = useState<string>('');

  // 获取服务器配置
  const fetchServerConfig = async () => {
    try {
      const data = await api.config();
      if (data.c === 200 && data.d?.version) {
        setServerVersion(data.d.version);
      }
    } catch (error) {
      console.error('获取服务器配置失败', error);
    }
  };

  // 监听全局加载事件
  useEffect(() => {
    fetchServerConfig();
    const showLoadingListener = eventBus.addListener('showLoading', (message: string = '加载中...') => {
      setLoadingMessage(message);
      setIsGlobalLoading(true);
    });

    const hideLoadingListener = eventBus.addListener('hideLoading', () => {
      setIsGlobalLoading(false);
    });

    return () => {
      showLoadingListener.remove();
      hideLoadingListener.remove();
    };
  }, []);

  // 处理退出登录
  const handleLogout = async () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '确定',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'ServerList' }],
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 处理切换服务器
  const handleSwitchServer = () => {
    navigation.navigate('ServerList');
  };

  // 处理修改密码
  const handleChangePassword = async () => {
    if (!validatePasswordForm()) {return;}

    try {
      setIsLoading(true);
      // 调用修改密码API
      const response = await api.changePassword(oldPassword, newPassword);

      if (response.c === 200) {
        Alert.alert('成功', '密码修改成功');
        setIsChangePasswordVisible(false);
        resetPasswordForm();
      } else {
        Alert.alert('错误', response.m || '密码修改失败');
      }
    } catch (error) {
      console.error('修改密码失败', error);
      Alert.alert('错误', '修改密码失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 验证密码表单
  const validatePasswordForm = () => {
    if (!oldPassword) {
      Alert.alert('错误', '请输入原密码');
      return false;
    }

    if (!newPassword) {
      Alert.alert('错误', '请输入新密码');
      return false;
    }

    if (newPassword.length < 6) {
      Alert.alert('错误', '新密码长度不能少于6位');
      return false;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('错误', '两次输入的新密码不一致');
      return false;
    }

    return true;
  };

  // 重置密码表单
  const resetPasswordForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  // 渲染用户信息
  const renderUserInfo = () => (
    <Card containerStyle={styles.card}>
      <View style={styles.userInfoContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{userInfo?.name || '未登录'}</Text>
          <Text style={styles.userEmail}>{userInfo?.email || ''}</Text>
        </View>
      </View>
    </Card>
  );

  // 渲染账户设置
  const renderAccountSettings = () => (
    <Card containerStyle={styles.card}>
      <Card.Title>账户设置</Card.Title>

      <ListItem onPress={() => setIsChangePasswordVisible(true)} bottomDivider key="change-password">
        <Icon name="lock" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>修改密码</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      <ListItem onPress={handleSwitchServer} bottomDivider key="switch-server">
        <Icon name="swap-horiz" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>切换服务器</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      <ListItem onPress={handleLogout} key="logout">
        <Icon name="logout" type="material" color="#f44336" />
        <ListItem.Content>
          <ListItem.Title style={{ color: '#f44336' }}>退出登录</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>
    </Card>
  );

  // 渲染关于信息
  const renderAboutInfo = () => (
    <Card containerStyle={styles.card}>
      <Card.Title>关于</Card.Title>

      <ListItem bottomDivider key="version">
        <Icon name="info" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>版本</ListItem.Title>
          <ListItem.Subtitle>{version || '1.0.0'}</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>

      <ListItem key="developer">
        <Icon name="code" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>开发者</ListItem.Title>
          <ListItem.Subtitle>sang</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>

      <ListItem key="server-version">
        <Icon name="dns" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>服务器版本</ListItem.Title>
          <ListItem.Subtitle>{serverVersion || '未知'}</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>
      <ListItem key="check-update" onPress={() => updateService.checkForUpdates()}>
        <Icon name="system-update" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>检查更新</ListItem.Title>
        </ListItem.Content>
      </ListItem>
    </Card>
  );

  // 渲染修改密码对话框
  const renderChangePasswordDialog = () => (
    <Dialog
      isVisible={isChangePasswordVisible}
      onBackdropPress={() => !isLoading && setIsChangePasswordVisible(false)}
      overlayStyle={styles.dialog}
    >
      <Dialog.Title title="修改密码" />

      <Input
        placeholder="原密码"
        secureTextEntry={!oldPasswordVisible}
        leftIcon={{ type: 'material', name: 'lock' }}
        rightIcon={{
          type: 'material',
          name: oldPasswordVisible ? 'visibility' : 'visibility-off',
          onPress: () => setOldPasswordVisible(!oldPasswordVisible),
          color: '#86939e',
        }}
        value={oldPassword}
        onChangeText={setOldPassword}
        disabled={isLoading}
      />

      <Input
        placeholder="新密码"
        secureTextEntry={!newPasswordVisible}
        leftIcon={{ type: 'material', name: 'lock-outline' }}
        rightIcon={{
          type: 'material',
          name: newPasswordVisible ? 'visibility' : 'visibility-off',
          onPress: () => setNewPasswordVisible(!newPasswordVisible),
          color: '#86939e',
        }}
        value={newPassword}
        onChangeText={setNewPassword}
        disabled={isLoading}
      />

      <Input
        placeholder="确认新密码"
        secureTextEntry={!confirmPasswordVisible}
        leftIcon={{ type: 'material', name: 'lock-outline' }}
        rightIcon={{
          type: 'material',
          name: confirmPasswordVisible ? 'visibility' : 'visibility-off',
          onPress: () => setConfirmPasswordVisible(!confirmPasswordVisible),
          color: '#86939e',
        }}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        disabled={isLoading}
      />

      <Dialog.Actions>
        <Dialog.Button
          title="取消"
          onPress={() => setIsChangePasswordVisible(false)}
          disabled={isLoading}
        />
        <Dialog.Button
          title={isLoading ? '提交中...' : '提交'}
          onPress={handleChangePassword}
          disabled={isLoading}
        />
      </Dialog.Actions>
    </Dialog>
  );

  // 渲染全局加载遮罩
  const renderLoadingOverlay = () => (
    <Overlay
      isVisible={isGlobalLoading}
      overlayStyle={styles.loadingOverlay}
    >
      <ActivityIndicator size="large" color="#1976d2" />
      <Text style={styles.loadingText}>{loadingMessage}</Text>
    </Overlay>
  );

  return (
    <View style={styles.container}>
      <ScrollView>
        {renderUserInfo()}
        {renderAccountSettings()}
        {renderAboutInfo()}
      </ScrollView>

      {renderChangePasswordDialog()}
      {renderLoadingOverlay()}
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
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userDetails: {
    marginLeft: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 14,
    color: '#757575',
  },
  dialog: {
    borderRadius: 10,
    padding: 20,
  },
  loadingOverlay: {
    width: 200,
    height: 100,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#1976d2',
  },
});

export default SettingsScreen;
