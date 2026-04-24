import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import type { Analytics } from 'firebase/analytics';
import type { Auth } from 'firebase/auth';

type FirebaseAnalyticsModule = typeof import('firebase/analytics');
type FirebaseAuthModule = typeof import('firebase/auth');

export const firebaseConfig = {
  apiKey: 'AIzaSyCxZM9UOr1qXilBABXMmocPMgZu4RoFQT8',
  authDomain: 'shra-iloilo.firebaseapp.com',
  projectId: 'shra-iloilo',
  storageBucket: 'shra-iloilo.firebasestorage.app',
  messagingSenderId: '152960820364',
  appId: '1:152960820364:web:31988c5009cd4f88c6c7a9',
  measurementId: 'G-21R8Y0SHC8',
} as const;

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let firebaseAuthPromise: Promise<Auth> | null = null;
let analyticsPromise: Promise<Analytics | null> | null = null;
let authPersistencePromise: Promise<void> | null = null;
let firebaseAuthModulePromise: Promise<FirebaseAuthModule> | null = null;
let firebaseAnalyticsModulePromise: Promise<FirebaseAnalyticsModule> | null = null;

export function initializeFirebaseApp(): FirebaseApp {
  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  return firebaseApp;
}

export function getFirestoreDb(): Firestore {
  firestoreDb ??= getFirestore(initializeFirebaseApp());

  return firestoreDb;
}

export function loadFirebaseAuthModule(): Promise<FirebaseAuthModule> {
  firebaseAuthModulePromise ??= import('firebase/auth');

  return firebaseAuthModulePromise;
}

export function getFirebaseAuth(): Promise<Auth> {
  firebaseAuthPromise ??= loadFirebaseAuthModule().then(({ getAuth }) => getAuth(initializeFirebaseApp()));

  return firebaseAuthPromise;
}

export async function ensureFirebaseAuthPersistence(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  authPersistencePromise ??= Promise.all([getFirebaseAuth(), loadFirebaseAuthModule()])
    .then(([firebaseAuth, firebaseAuthModule]) =>
      firebaseAuthModule.setPersistence(firebaseAuth, firebaseAuthModule.browserLocalPersistence),
    )
    .catch(() => undefined);

  await authPersistencePromise;
}

export async function initializeFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined' || firebaseConfig.measurementId.length === 0) {
    return null;
  }

  firebaseAnalyticsModulePromise ??= import('firebase/analytics');

  analyticsPromise ??= firebaseAnalyticsModulePromise
    .then(async (firebaseAnalyticsModule) =>
      (await firebaseAnalyticsModule.isSupported())
        ? firebaseAnalyticsModule.getAnalytics(initializeFirebaseApp())
        : null,
    )
    .catch(() => null);

  return analyticsPromise;
}
