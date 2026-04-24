import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { AuthService } from '../../core/services/auth.service';
import { AuthModalComponent } from '../auth/auth-modal.component';

@Component({
  selector: 'app-navbar',
  imports: [AuthModalComponent, AvatarModule, ButtonModule, RouterLink, TagModule, ToolbarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navbar.component.html',
  host: {
    class: 'block',
  },
})
export class NavbarComponent {
  protected readonly authService = inject(AuthService);

  readonly eyebrow = input('Public room monitor');
  readonly dashboardTitle = input('Smart Hospital Room Availability in ILOILO');
  readonly subtitle = input('Live room availability across hospitals and facilities in Iloilo.');
  readonly facilityCount = input(0);
  readonly openRooms = input(0);
  readonly primaryRouteLabel = input('Explore Map');
  readonly primaryRouteLink = input('/');
  readonly secondaryRouteLabel = input('Manage Facilities');
  readonly secondaryRouteLink = input('/facility');
  readonly showLocateButton = input(false);
  readonly showMobilePanelButton = input(false);
  readonly mobilePanelButtonLabel = input('Results');
  readonly mobilePanelButtonCount = input(0);
  readonly mobilePanelExpanded = input(false);

  readonly locateRequested = output<void>();
  readonly mobilePanelRequested = output<void>();
}