// Legacy route — alignment now lives inside each EduSperience (Output screen).
// Redirect old links that pass assignmentId.

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../theme';

export default function TagScreen({ navigation, route }) {
  const assignmentId = route?.params?.assignmentId;

  useEffect(() => {
    if (assignmentId) {
      navigation.replace('Output', {
        assignment: { id: assignmentId },
      });
    } else {
      navigation.replace('Eval');
    }
  }, [assignmentId, navigation]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
