import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Alert,
  StyleSheet,
  StatusBar,
  ImageBackground,
} from 'react-native';
import { Video } from 'expo-av';
import {
  PaperProvider,
  Button,
  TextInput,
  Title,
  Paragraph,
  Card,
  ActivityIndicator,
} from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import appConfig from './app.json';
import DatabaseConfig, {
  resolveApiBaseUrl,
  findWorkingApiUrl,
  createApiConfig,
  API_CONFIG,
  ENV_CONFIG,
  logConfiguration
} from './config/database';
import QRScannerScreen from './components/QRScannerScreen';
import FirebaseAuthService from './services/FirebaseAuthService';

// Initialize configuration
logConfiguration();

// Use environment-based API configuration
const API_BASE_URL = resolveApiBaseUrl();
const api = axios.create(createApiConfig(API_BASE_URL));

console.log('🚀 App.js - Using API Base URL:', API_BASE_URL);
console.log('🚀 App.js - Environment:', ENV_CONFIG.APP_ENV);
console.log('🚀 App.js - Debug Mode:', ENV_CONFIG.DEBUG_MODE);

// Use environment-based API URL discovery
const probeReachableBaseUrl = findWorkingApiUrl;

function QRVerifierApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    checkAuthStatus();
    
    // Setup Firebase auth state listener
    const unsubscribe = FirebaseAuthService.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in with Firebase
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          role: 'verifier'
        };
        
        await SecureStore.setItemAsync('userData', JSON.stringify(userData));
        await SecureStore.setItemAsync('authToken', firebaseUser.uid);
        setUser(userData);
        setIsAuthenticated(true);
      } else {
        // User is signed out
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check for stored auth data as fallback
      const userData = await SecureStore.getItemAsync('userData');
      const authToken = await SecureStore.getItemAsync('authToken');
      
      if (userData && authToken) {
        try {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          setIsAuthenticated(true);
          console.log('User restored from storage:', parsedUser.email);
        } catch (parseError) {
          console.error('Failed to parse stored user data:', parseError);
          // Clear corrupted data
          await SecureStore.deleteItemAsync('userData');
          await SecureStore.deleteItemAsync('authToken');
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setLoginLoading(true);
    try {
      console.log('Attempting authentication...');
      
      // Try demo authentication first for reliability
      const demoResult = await FirebaseAuthService.demoAuth(email.trim(), password.trim());
      
      if (demoResult.success) {
        await SecureStore.setItemAsync('userData', JSON.stringify(demoResult.user));
        await SecureStore.setItemAsync('authToken', demoResult.user.uid || '');
        setUser(demoResult.user);
        setIsAuthenticated(true);
        Alert.alert('Success', 'Welcome ' + (demoResult.user.displayName || demoResult.user.email) + '! (Demo Mode)');
        console.log('Demo auth successful:', demoResult.user);
      } else {
        // If demo fails, try Firebase authentication
        console.log('Demo auth failed, trying Firebase auth...');
        const result = await FirebaseAuthService.signIn(email.trim(), password.trim());
        
        console.log('Firebase auth result:', result);

        if (result.success) {
          // Persist user data
          await SecureStore.setItemAsync('userData', JSON.stringify(result.user));
          await SecureStore.setItemAsync('authToken', result.user.uid || '');
          setUser(result.user);
          setIsAuthenticated(true);
          Alert.alert('Success', 'Welcome ' + (result.user.displayName || result.user.email) + '!');
        } else {
          Alert.alert('Login Failed', result.error || demoResult.error || 'Invalid credentials. Try: admin@dandiya.com / admin123');
        }
      }
    } catch (error) {
      console.error('Login error:', error?.message || error);
      Alert.alert('Login Failed', 'Authentication error. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setLoginLoading(true);
    try {
      console.log('Attempting Firebase sign-up...');
      
      const displayName = email.trim().split('@')[0] || 'Staff';
      const result = await FirebaseAuthService.signUp(email.trim(), password.trim(), displayName);

      console.log('Firebase sign-up result:', result);

      if (result.success) {
        await SecureStore.setItemAsync('userData', JSON.stringify(result.user));
        await SecureStore.setItemAsync('authToken', result.user.uid || '');
        setUser(result.user);
        setIsAuthenticated(true);
        Alert.alert('Success', 'Account created! Welcome ' + result.user.displayName + '!');
      } else {
        Alert.alert('Sign Up Failed', result.error || 'Failed to create account');
      }
    } catch (error) {
      console.error('Sign up error:', error);
      Alert.alert('Sign Up Failed', 'Failed to create account. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Sign out from Firebase
      await FirebaseAuthService.signOut();
      
      // Clear stored data
      await SecureStore.deleteItemAsync('userData');
      await SecureStore.deleteItemAsync('authToken');
      setUser(null);
      setIsAuthenticated(false);
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  // No Google sign-in in the classic view

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1976d2" />
        <ActivityIndicator size="large" color="#ff6b35" />
        <Paragraph style={styles.loadingText}>Loading...</Paragraph>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Video
          source={{ uri: 'https://qczbnczsidlzzwziubhu.supabase.co/storage/v1/object/public/malangdandiya/bg.mp4' }}
          style={styles.backgroundVideo}
          shouldPlay
          isLooping
          isMuted
          resizeMode="cover"
        />
        <SafeAreaView style={styles.container}>
          <View style={styles.overlay} />
          <StatusBar barStyle="light-content" backgroundColor="#1976d2" />
          
          <View style={styles.headerContainer}>
            <View style={{ height: 16 }} />
            <Title style={styles.appTitle}>🥢 Dandiya Verifier</Title>
          </View>

          <View style={styles.formContainer}>
            <View style={{ width: '100%', maxWidth: 380 }}>
              <Card style={styles.loginCard}>
              <Card.Content>
                <Title style={styles.loginTitle}>Staff Login</Title>
                <Paragraph style={styles.demoText}>
                  Demo: admin@dandiya.com / admin123 or staff@dandiya.com / staff123
                </Paragraph>
                <Paragraph style={styles.debugText}>
                  QR Test: {`{"ticketNumber":"test-123","bookingId":"1"}`}
                </Paragraph>
                
                <TextInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  mode="outlined"
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  autoCorrect={false}
                  activeOutlineColor="#ffffff"
                  outlineColor="rgba(187, 187, 187, 0.35)"
                  textColor="#fff"
                  placeholderTextColor="#ffffffb3"
                  selectionColor="#fff"
                  theme={{ colors: { onSurfaceVariant: '#ffffffcc', primary: '#ffffff', outline: 'rgba(255,255,255,0.35)' }, roundness: 12 }}
                  left={<TextInput.Icon icon="email" color="#fff" />}
                />

                <TextInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  mode="outlined"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  ref={passwordRef}
                  returnKeyType="done"
                  autoCorrect={false}
                  activeOutlineColor="#ffffff"
                  outlineColor="rgba(255,255,255,0.35)"
                  textColor="#fff"
                  placeholderTextColor="#ffffffb3"
                  selectionColor="#fff"
                  theme={{ colors: { onSurfaceVariant: '#ffffffcc', primary: '#ffffff', outline: 'rgba(255,255,255,0.35)' }, roundness: 12 }}
                  left={<TextInput.Icon icon="lock" color="#fff" />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      color="#fff"
                      onPress={() => setShowPassword((p) => !p)}
                    />
                  }
                />
                <Button
                  mode="contained"
                  onPress={handleLogin}
                  loading={loginLoading}
                  disabled={loginLoading}
                  style={styles.loginButton}
                  buttonColor="#ff6b35"
                >
                  {loginLoading ? 'Signing In...' : 'Sign In'}
                </Button>


              </Card.Content>
              </Card>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return <QRScannerScreen user={user} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <PaperProvider>
      <QRVerifierApp />
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    zIndex: -1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  headerContainer: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 50,
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    opacity: 0.9,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loginCard: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    elevation: 10,
    width: '100%',
    maxWidth: 380,
  },
  loginTitle: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#fffefeff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
  },
  loginButton: {
    marginTop: 10,
    marginBottom: 15,
    borderRadius: 10,
  },
  secondaryButton: {
    marginBottom: 10,
    borderRadius: 10,
    borderColor: 'rgba(255,255,255,0.6)'
  },
  demoInfo: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  demoText: {
    fontSize: 12,
    color: '#ffffffcc',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 15,
  },
  debugText: {
    fontSize: 10,
    color: '#ffffff88',
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: 'monospace',
  },
  demoCredentials: {
    fontSize: 12,
    color: '#ff6b35',
    fontWeight: 'bold',
    marginTop: 2,
  },
});
