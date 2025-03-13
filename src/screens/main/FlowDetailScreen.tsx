import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Button, Divider } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import moment from 'moment';
import { MainStackParamList } from '../../navigation/types';
import { Flow } from '../../types';
import api from '../../services/api';
import {useBook} from '../../context/BookContext.tsx';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, 'FlowDetail'>;

const FlowDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { currentFlow } = route.params;
  const { currentBook } = useBook();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 获取流水详情
  useEffect(() => {
    const fetchFlowDetail = async () => {
      try {
        setIsLoading(true);
        setFlow(currentFlow);
      } catch (error) {
        console.error('获取流水详情失败', error);
        Alert.alert('错误', '获取流水详情失败');
        navigation.goBack();
      } finally {
        setIsLoading(false);
      }
    };
    fetchFlowDetail();
  }, [currentFlow, navigation]);

  // 处理编辑流水
  const handleEdit = () => {
    navigation.navigate('FlowForm', { currentFlow });
  };

  // 处理删除流水
  const handleDelete = () => {
    Alert.alert(
      '确认删除',
      '确定要删除这条流水记录吗？此操作不可恢复。',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              const response = await api.flow.delete(currentFlow.id,currentBook?.bookId!);

              if (response.c === 200) {
                Alert.alert('成功', '流水已删除');
                navigation.goBack();
              } else {
                Alert.alert('错误', response.m || '删除流水失败');
              }
            } catch (error) {
              console.error('删除流水失败', error);
              Alert.alert('错误', '删除流水失败');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 获取流水类型颜色
  const getFlowTypeColor = (type: string) => {
    switch (type) {
      case '收入':
        return '#4caf50';
      case '支出':
        return '#f44336';
      default:
        return '#757575';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
      </View>
    );
  }

  if (!flow) {
    return (
      <View style={styles.container}>
        <Card containerStyle={styles.card}>
          <Card.Title>未找到流水记录</Card.Title>
          <Text style={styles.emptyText}>
            无法获取流水记录详情
          </Text>
          <Button
            title="返回"
            onPress={() => navigation.goBack()}
          />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        <Card containerStyle={styles.card}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{flow.name}</Text>
              <Text style={[styles.flowType, { color: getFlowTypeColor(flow.flowType) }]}>
                {flow.flowType}
              </Text>
            </View>

            <Text
              style={[
                styles.money,
                { color: getFlowTypeColor(flow.flowType) },
              ]}
            >
              {flow.flowType === '支出' ? '-' : flow.flowType === '收入' ? '+' : ''}
              {flow.money.toFixed(2)}
            </Text>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>交易类型</Text>
            <Text style={styles.infoValue}>{flow.industryType}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>支付方式</Text>
            <Text style={styles.infoValue}>{flow.payType}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>交易日期</Text>
            <Text style={styles.infoValue}>
              {moment(flow.day).format('YYYY-MM-DD HH:mm')}
            </Text>
          </View>

          {flow.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.infoLabel}>备注</Text>
              <Text style={styles.description}>{flow.description}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>创建时间</Text>
            <Text style={styles.infoValue}>
              {moment(flow.createdAt).format('YYYY-MM-DD HH:mm')}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>更新时间</Text>
            <Text style={styles.infoValue}>
              {moment(flow.updatedAt).format('YYYY-MM-DD HH:mm')}
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <Button
              title="编辑"
              type="outline"
              icon={{
                name: 'edit',
                type: 'material',
                color: '#1976d2',
              }}
              containerStyle={styles.button}
              onPress={handleEdit}
            />

            <Button
              title="删除"
              type="outline"
              icon={{
                name: 'delete',
                type: 'material',
                color: '#f44336',
              }}
              containerStyle={styles.button}
              buttonStyle={{ borderColor: '#f44336' }}
              titleStyle={{ color: '#f44336' }}
              onPress={handleDelete}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  flowType: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  money: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  divider: {
    marginVertical: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 16,
    color: '#757575',
    fontWeight: 'bold',
  },
  infoValue: {
    fontSize: 16,
  },
  descriptionContainer: {
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    marginTop: 5,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
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
  emptyText: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#757575',
  },
});

export default FlowDetailScreen;
