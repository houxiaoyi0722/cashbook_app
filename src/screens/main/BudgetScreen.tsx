import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, Button } from '@rneui/themed';

const BudgetScreen = () => {
  return (
    <View style={styles.container}>
      <Card>
        <Card.Title>预算管理</Card.Title>
        <Text>预算设置和跟踪功能</Text>
        <Button title="设置预算" />
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
});

export default BudgetScreen;
