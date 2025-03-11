import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Card, Button, Input } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBook } from '../../context/BookContext';
import { MainStackParamList } from '../../navigation/types';
import api from '../../services/api';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, 'BookForm'>;

const BookFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { bookId } = route.params || {};
  const { createBook, updateBook } = useBook();

  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // 获取账本详情
  useEffect(() => {
    const fetchBookDetail = async () => {
      if (!bookId) return;

      try {
        setIsFetching(true);
        const response = await api.book.get(bookId);

        if (response.c === 200 && response.d) {
          const book = response.d;
          setName(book.bookName);
        } else {
          Alert.alert('错误', response.m || '获取账本详情失败');
          navigation.goBack();
        }
      } catch (error) {
        console.error('获取账本详情失败', error);
        Alert.alert('错误', '获取账本详情失败');
        navigation.goBack();
      } finally {
        setIsFetching(false);
      }
    };

    fetchBookDetail();
  }, [bookId, navigation]);

  // 验证表单
  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('错误', '请输入账本名称');
      return false;
    }

    return true;
  };

  // 处理保存
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);

      if (bookId) {
        // 更新账本
        await updateBook(bookId, {
          bookName: name
        });

        Alert.alert('成功', '账本已更新');
      } else {
        // 创建账本
        await createBook(name);

        Alert.alert('成功', '账本已创建');
      }

      navigation.goBack();
    } catch (error) {
      console.error('保存账本失败', error);
      Alert.alert('错误', '保存账本失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        <Card containerStyle={styles.card}>
          <Card.Title>{bookId ? '编辑账本' : '创建账本'}</Card.Title>

          <Input
            label="账本名称"
            placeholder="请输入账本名称"
            value={name}
            onChangeText={setName}
            disabled={isLoading}
            leftIcon={{ type: 'material', name: 'book', color: '#1976d2' }}
            errorMessage={name.trim() ? '' : '账本名称不能为空'}
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
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default BookFormScreen;
