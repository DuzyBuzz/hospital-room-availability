import { Injectable, computed, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../../environment/firebase.environment';

export type AuthMode = 'signIn' | 'signUp';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth = this.shouldUseAuth() ? getFirebaseAuth() : null;

  readonly user = signal<User | null>(null);
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

    return user.displayName?.trim() || user.email?.split('@')[0] || 'Facility manager';
  });

  constructor() {
    if (!this.auth) {
      this.loading.set(false);
      return;
    }

    onAuthStateChanged(
      this.auth,
      (user) => {
        this.user.set(user);
        this.loading.set(false);
      },
      () => {
        this.loading.set(false);
        this.errorMessage.set('We could not verify your session right now.');
      },
    );
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
    if (!this.auth) {
      this.errorMessage.set('Sign in is not available in this environment.');
      return;
    }

    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      await signInWithEmailAndPassword(this.auth, email.trim(), password);
      this.modalOpen.set(false);
    } catch (error) {
      this.errorMessage.set(this.humanizeAuthError(error));
    } finally {
      this.busy.set(false);
    }
  }

  async signUp(name: string, email: string, password: string): Promise<void> {
    if (!this.auth) {
      this.errorMessage.set('Account creation is not available in this environment.');
      return;
    }

    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
      await updateProfile(credential.user, {
        displayName: name.trim(),
      });
      this.user.set(credential.user);
      this.modalOpen.set(false);
    } catch (error) {
      this.errorMessage.set(this.humanizeAuthError(error));
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    if (!this.auth) {
      return;
    }

    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      await signOut(this.auth);
    } catch (error) {
      this.errorMessage.set(this.humanizeAuthError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private shouldUseAuth(): boolean {
    return typeof window !== 'undefined' && !window.navigator.userAgent.toLowerCase().includes('jsdom');
  }

  private humanizeAuthError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Authentication failed.';

    return message
      .replace('Firebase: ', '')
      .replace('FirebaseError: ', '')
      .replace('(auth/', '')
      .replace(').', '.')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}