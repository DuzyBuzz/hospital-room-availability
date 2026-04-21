import { Injectable, computed, inject, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { FirestoreService } from './firestore.service';

export type AuthMode = 'signIn' | 'signUp';

interface FirestoreUserAccount {
  displayName: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
}

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

const SESSION_STORAGE_KEY = 'hospital-room-availability.session-user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly firestoreService = inject(FirestoreService);

  readonly user = signal<SessionUser | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly modalOpen = signal(false);
  readonly authMode = signal<AuthMode>('signIn');

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly displayName = computed(() => {
    const user = this.user();

    if (!user) {
      return 'Guest';
    }

    return user.displayName.trim() || user.email.split('@')[0] || 'Facility manager';
  });

  constructor() {
    this.restoreSession();
  }

  openModal(mode: AuthMode = 'signIn'): void {
    this.errorMessage.set(null);
    this.authMode.set(mode);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.busy()) {
      return;
    }

    this.errorMessage.set(null);
    this.modalOpen.set(false);
  }

  switchMode(mode: AuthMode): void {
    this.errorMessage.set(null);
    this.authMode.set(mode);
  }

  async signIn(email: string, password: string): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      const normalizedEmail = this.normalizeEmail(email);
      const userId = await this.createUserId(normalizedEmail);
      const userAccount = await this.firestoreService.getDocument<FirestoreUserAccount>('users', userId);

      if (!userAccount) {
        this.errorMessage.set('Email or password is incorrect.');
        return;
      }

      const passwordHash = await this.hashPassword(normalizedEmail, password);

      if (userAccount.passwordHash !== passwordHash) {
        this.errorMessage.set('Email or password is incorrect.');
        return;
      }

      const sessionUser = this.toSessionUser(userId, userAccount);

      this.persistSession(sessionUser);
      this.user.set(sessionUser);
      this.modalOpen.set(false);
    } catch (error) {
      this.errorMessage.set(this.humanizeFirestoreAuthError(error, 'We could not sign you in right now.'));
    } finally {
      this.busy.set(false);
    }
  }

  async signUp(name: string, email: string, password: string): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      const normalizedEmail = this.normalizeEmail(email);
      const userId = await this.createUserId(normalizedEmail);
      const existingUser = await this.firestoreService.getDocument<FirestoreUserAccount>('users', userId);

      if (existingUser) {
        this.errorMessage.set('This email address already has an account. Sign in instead.');
        return;
      }

      const displayName = name.trim();
      const passwordHash = await this.hashPassword(normalizedEmail, password);
      const emailAddress = email.trim();

      await this.firestoreService.setDocument('users', userId, {
        displayName,
        email: emailAddress,
        normalizedEmail,
        passwordHash,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const sessionUser = {
        id: userId,
        email: emailAddress,
        displayName,
      } satisfies SessionUser;

      this.persistSession(sessionUser);
      this.user.set(sessionUser);
      this.modalOpen.set(false);
    } catch (error) {
      this.errorMessage.set(this.humanizeFirestoreAuthError(error, 'We could not create your account right now.'));
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      this.clearPersistedSession();
      this.user.set(null);
    } catch (error) {
      this.errorMessage.set(this.humanizeFirestoreAuthError(error, 'We could not clear your session right now.'));
    } finally {
      this.busy.set(false);
    }
  }

  private restoreSession(): void {
    const storedSession = this.readStoredSession();

    if (storedSession) {
      this.user.set(storedSession);
    }

    this.loading.set(false);
  }

  private readStoredSession(): SessionUser | null {
    if (!this.canUseBrowserStorage()) {
      return null;
    }

    const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    try {
      const parsedValue = JSON.parse(rawValue) as Partial<SessionUser>;

      if (
        typeof parsedValue.id === 'string' &&
        typeof parsedValue.email === 'string' &&
        typeof parsedValue.displayName === 'string'
      ) {
        return {
          id: parsedValue.id,
          email: parsedValue.email,
          displayName: parsedValue.displayName,
        };
      }
    } catch {
      this.clearPersistedSession();
    }

    return null;
  }

  private persistSession(user: SessionUser): void {
    if (!this.canUseBrowserStorage()) {
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  }

  private clearPersistedSession(): void {
    if (!this.canUseBrowserStorage()) {
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  private canUseBrowserStorage(): boolean {
    return typeof window !== 'undefined' && !window.navigator.userAgent.toLowerCase().includes('jsdom');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async createUserId(normalizedEmail: string): Promise<string> {
    const emailHash = await this.hashValue(normalizedEmail);

    return `user_${emailHash.slice(0, 40)}`;
  }

  private async hashPassword(normalizedEmail: string, password: string): Promise<string> {
    return this.hashValue(`${normalizedEmail}::${password}`);
  }

  private async hashValue(value: string): Promise<string> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Password hashing is not available in this browser.');
    }

    const encodedValue = new TextEncoder().encode(value);
    const digestBuffer = await crypto.subtle.digest('SHA-256', encodedValue);

    return Array.from(new Uint8Array(digestBuffer), (entry) => entry.toString(16).padStart(2, '0')).join('');
  }

  private toSessionUser(id: string, userAccount: FirestoreUserAccount): SessionUser {
    return {
      id,
      email: userAccount.email,
      displayName: userAccount.displayName,
    };
  }

  private humanizeFirestoreAuthError(error: unknown, fallback: string): string {
    const errorCode = this.readFirebaseErrorCode(error);

    switch (errorCode) {
      case 'permission-denied':
        return 'Firestore rejected the account request. Check the users collection rules.';
      case 'unavailable':
        return 'Firestore is temporarily unavailable. Try again in a moment.';
      case 'deadline-exceeded':
        return 'The Firestore request timed out. Try again.';
      case 'resource-exhausted':
        return 'The Firebase project quota was reached. Try again later.';
      default:
        return this.sanitizeFirebaseMessage(error, fallback);
    }
  }

  private readFirebaseErrorCode(error: unknown): string | null {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error['code'] === 'string'
    ) {
      return error['code'];
    }

    return null;
  }

  private sanitizeFirebaseMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : fallback;

    return message
      .replace('Firebase: ', '')
      .replace('FirebaseError: ', '')
      .replace(/\((auth|firestore)\//g, '(')
      .replace(').', '.')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}