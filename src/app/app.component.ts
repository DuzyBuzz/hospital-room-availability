import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { initializeFirebaseAnalytics } from './environment/firebase.environment';

@Component({
  selector: 'app-root',
  imports: [ConfirmDialogModule, RouterOutlet, ToastModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-toast key="global" position="top-right" />
    <p-confirmdialog
      key="global-confirm"
      styleClass="gmaps-confirm-dialog"
      [style]="{ width: 'min(32rem, calc(100vw - 2rem))' }"
    />
    <router-outlet />
  `,
  host: {
    class: 'block min-h-screen',
  },
})
export class AppComponent {
  constructor() {
    void initializeFirebaseAnalytics();
  }
}