import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth-modal',
  imports: [ButtonModule, DialogModule, InputTextModule, MessageModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-modal.component.html',
  host: {
    class: 'block',
  },
})
export class AuthModalComponent {
  protected readonly authService = inject(AuthService);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly form = this.formBuilder.group({
    name: ['', [Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: [''],
  });
  protected readonly submitted = signal(false);

  protected readonly title = computed(() =>
    this.authService.authMode() === 'signUp' ? 'Create your facility account' : 'Sign in to manage listings',
  );
  protected readonly primaryActionLabel = computed(() =>
    this.authService.authMode() === 'signUp' ? 'Create Account' : 'Sign In',
  );
  protected readonly validationMessage = computed(() => {
    if (!this.submitted()) {
      return '';
    }

    if (this.authService.authMode() === 'signUp' && this.form.controls.name.value.trim().length < 2) {
      return 'Add the name that should appear on your facility account.';
    }

    if (this.form.controls.email.invalid) {
      return 'Enter a valid email address.';
    }

    if (this.form.controls.password.invalid) {
      return 'Passwords must be at least 6 characters long.';
    }

    if (this.authService.authMode() === 'signUp' && this.form.controls.confirmPassword.value !== this.form.controls.password.value) {
      return 'Password confirmation does not match.';
    }

    return '';
  });
  protected readonly showValidationMessage = computed(() => this.validationMessage().length > 0);

  constructor() {
    effect(
      () => {
        const isOpen = this.authService.modalOpen();
        const mode = this.authService.authMode();

        if (!isOpen) {
          return;
        }

        this.submitted.set(false);
        this.form.reset({
          name: '',
          email: '',
          password: '',
          confirmPassword: '',
        });

        if (mode === 'signIn') {
          this.form.controls.confirmPassword.setValue('');
        }
      },
    );
  }

  protected handleDialogVisibilityChange(visible: boolean): void {
    if (!visible) {
      this.authService.closeModal();
    }
  }

  protected switchMode(mode: 'signIn' | 'signUp'): void {
    this.authService.switchMode(mode);
  }

  protected async submitForm(): Promise<void> {
    this.submitted.set(true);

    if (this.form.controls.email.invalid || this.form.controls.password.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.authService.authMode() === 'signUp') {
      if (
        this.form.controls.name.value.trim().length < 2 ||
        this.form.controls.confirmPassword.value !== this.form.controls.password.value
      ) {
        this.form.markAllAsTouched();
        return;
      }

      await this.authService.signUp(
        this.form.controls.name.value,
        this.form.controls.email.value,
        this.form.controls.password.value,
      );
      return;
    }

    await this.authService.signIn(
      this.form.controls.email.value,
      this.form.controls.password.value,
    );
  }
}