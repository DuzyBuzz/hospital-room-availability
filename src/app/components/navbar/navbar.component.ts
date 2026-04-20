import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AuthModalComponent } from '../auth/auth-modal.component';

@Component({
  selector: 'app-navbar',
  imports: [AuthModalComponent, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navbar.component.html',
  host: {
    class: 'block',
  },
})
export class NavbarComponent {
  protected readonly authService = inject(AuthService);

  readonly dashboardTitle = input('Smart Hospital Room Availability in ILOILO');
  readonly facilityCount = input(0);
  readonly openRooms = input(0);
}