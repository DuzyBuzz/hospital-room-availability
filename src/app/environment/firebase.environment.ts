import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyDo340eO2Uq19ID7XGKxY_ReIBh-DcEyug',
  authDomain: 'shra-iloilo-8d3b0.firebaseapp.com',
  projectId: 'shra-iloilo-8d3b0',
  storageBucket: 'shra-iloilo-8d3b0.firebasestorage.app',
  messagingSenderId: '192991338192',
  appId: '1:192991338192:web:73493add2e53563a5a48d5',
  measurementId: 'G-CBRQ6QJHNF'
} as const;

export function initializeFirebaseApp() {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getFirestoreDb() {
  return getFirestore(initializeFirebaseApp());
}

export function getFirebaseAuth() {
  return getAuth(initializeFirebaseApp());
}
