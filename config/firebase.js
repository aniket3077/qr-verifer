import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
// TODO: Replace these with your actual Firebase project credentials
// To get these values:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project or select existing one
// 3. Go to Project Settings > General > Your apps
// 4. Add a web app and copy the config object
const firebaseConfig = {
  apiKey: "AIzaSyDVZPaO5GmuhgFAMF3pokUEk5lG3j3_23s",
  authDomain: "malang-aea9e.firebaseapp.com",
  projectId: "malang-aea9e",
  storageBucket: "malang-aea9e.firebasestorage.app",
  messagingSenderId: "610120768406",
  appId: "1:610120768406:web:4c7a606b006e0695651bb7",
  measurementId: "G-4CD7ZVX9L8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Firestore
const db = getFirestore(app);

export { auth, db };
export default app;