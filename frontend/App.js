import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';

import { supabase } from './src/lib/supabase';
import { colors } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import EvalScreen from './src/screens/EvalScreen';
import AddAssignmentScreen from './src/screens/AddAssignmentScreen';
import AddCurriculumScreen from './src/screens/AddCurriculumScreen';
import OutputScreen from './src/screens/OutputScreen';
import CurriculumDetailScreen from './src/screens/CurriculumDetailScreen';
import DashboardScreen from './src/screens/DashboardScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName={session ? 'Eval' : 'Login'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Eval" component={EvalScreen} />
        <Stack.Screen name="AddAssignment" component={AddAssignmentScreen} />
        <Stack.Screen name="AddCurriculum" component={AddCurriculumScreen} />
        <Stack.Screen name="Output" component={OutputScreen} />
        <Stack.Screen name="CurriculumDetail" component={CurriculumDetailScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
