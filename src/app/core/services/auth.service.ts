import { Injectable, computed, inject, signal } from '@angular/core';
import type { Auth, User as FirebaseUser } from 'firebase/auth';
import {
  ensureFirebaseAuthPersistence,
  getFirebaseAuth,
  loadFirebaseAuthModule,
} from '../../environment/firebase.environment';
import { FeedbackService } from './feedback.service';

export type AuthMode = 'signIn' | 'signUp';

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly feedbackService = inject(FeedbackService);
  private readonly firebaseAuthPromise = getFirebaseAuth();

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
    void this.initializeAuthSession();
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
      await ensureFirebaseAuthPersistence();
      const { firebaseAuth, firebaseAuthModule } = await this.getAuthDependencies();
      const credential = await firebaseAuthModule.signInWithEmailAndPassword(firebaseAuth, email.trim(), password);

      this.user.set(this.toSessionUser(credential.user));
      this.modalOpen.set(false);
      this.feedbackService.success('Signed in', 'You can now add or update facility listings.');
    } catch (error) {
      this.setErrorMessage(
        this.humanizeFirebaseAuthError(error, 'We could not sign you in right now.'),
        'Sign in failed',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async signUp(name: string, email: string, password: string): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      await ensureFirebaseAuthPersistence();
      const { firebaseAuth, firebaseAuthModule } = await this.getAuthDependencies();
      const credential = await firebaseAuthModule.createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const displayName = name.trim();

      if (displayName.length > 0) {
        await firebaseAuthModule.updateProfile(credential.user, { displayName });
        await credential.user.reload();
      }

      this.user.set(this.toSessionUser(firebaseAuth.currentUser ?? credential.user));
      this.modalOpen.set(false);
      this.feedbackService.success('Account created', 'Your facility account is ready for new listings.');
    } catch (error) {
      this.setErrorMessage(
        this.humanizeFirebaseAuthError(error, 'We could not create your account right now.'),
        'Account setup failed',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);

    try {
      const { firebaseAuth, firebaseAuthModule } = await this.getAuthDependencies();

      await firebaseAuthModule.signOut(firebaseAuth);
      this.user.set(null);
      this.feedbackService.info('Signed out', 'Your facility management session has ended.');
    } catch (error) {
      this.setErrorMessage(
        this.humanizeFirebaseAuthError(error, 'We could not clear your session right now.'),
        'Sign out failed',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private setErrorMessage(message: string, summary: string): void {
    this.errorMessage.set(message);
    this.feedbackService.error(summary, message);
  }

  private async initializeAuthSession(): Promise<void> {
    if (!this.canUseBrowserStorage()) {
      this.loading.set(false);
      return;
    }

    try {
      await ensureFirebaseAuthPersistence();
      const { firebaseAuth, firebaseAuthModule } = await this.getAuthDependencies();

      firebaseAuthModule.onAuthStateChanged(
        firebaseAuth,
        (user) => {
          this.user.set(user ? this.toSessionUser(user) : null);
          this.loading.set(false);
        },
        (error) => {
          this.user.set(null);
          this.loading.set(false);
          this.setErrorMessage(
            this.humanizeFirebaseAuthError(error, 'We could not restore your session right now.'),
            'Session restore failed',
          );
        },
      );
    } catch (error) {
      this.user.set(null);
      this.loading.set(false);
      this.setErrorMessage(
        this.humanizeFirebaseAuthError(error, 'We could not initialize authentication right now.'),
        'Authentication unavailable',
      );
    }
  }

  private canUseBrowserStorage(): boolean {
    return typeof window !== 'undefined' && !window.navigator.userAgent.toLowerCase().includes('jsdom');
  }

  private async getAuthDependencies(): Promise<{
    firebaseAuth: Auth;
    firebaseAuthModule: Awaited<ReturnType<typeof loadFirebaseAuthModule>>;
  }> {
    const [firebaseAuth, firebaseAuthModule] = await Promise.all([
      this.firebaseAuthPromise,
      loadFirebaseAuthModule(),
    ]);

    return {
      firebaseAuth,
      firebaseAuthModule,
    };
  }

  private toSessionUser(user: FirebaseUser): SessionUser {
    return {
      id: user.uid,
      email: user.email ?? '',
      displayName: user.displayName?.trim() || user.email?.split('@')[0] || 'Facility manager',
    };
  }

  private humanizeFirebaseAuthError(error: unknown, fallback: string): string {
    const errorCode = this.readFirebaseErrorCode(error);

    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'This email address already has an account. Sign in instead.';
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'Email or password is incorrect.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/weak-password':
        return 'Passwords must be at least 6 characters long.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/network-request-failed':
        return 'The network request failed. Check the connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts were blocked. Wait a moment before trying again.';
      case 'auth/operation-not-allowed':
      case 'auth/configuration-not-found':
        return 'Email and password sign-in is not enabled for this Firebase project yet.';
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