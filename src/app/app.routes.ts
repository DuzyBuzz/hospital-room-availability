import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () => import('./pages/home/home.component').then((module) => module.HomeComponent),
		title: 'Smart Hospital Room Availability in ILOILO',
	},
	{
		path: 'facility',
		loadComponent: () =>
			import('./pages/facility/facility-dashboard.component').then(
				(module) => module.FacilityDashboardComponent,
			),
		title: 'Facility Dashboard | Smart Hospital Room Availability in ILOILO',
	},
	{
		path: '**',
		redirectTo: '',
	},
];
