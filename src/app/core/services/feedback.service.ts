import { inject, Injectable } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';

type FeedbackSeverity = 'success' | 'info' | 'warn' | 'error';

interface FeedbackMessageOptions {
  life?: number;
  sticky?: boolean;
}

interface ConfirmActionOptions {
  header: string;
  message: string;
  icon?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  acceptButtonStyleClass?: string;
}

@Injectable({
  providedIn: 'root',
})
export class FeedbackService {
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  success(summary: string, detail: string, options?: FeedbackMessageOptions): void {
    this.push('success', summary, detail, options);
  }

  info(summary: string, detail: string, options?: FeedbackMessageOptions): void {
    this.push('info', summary, detail, options);
  }

  warn(summary: string, detail: string, options?: FeedbackMessageOptions): void {
    this.push('warn', summary, detail, options);
  }

  error(summary: string, detail: string, options?: FeedbackMessageOptions): void {
    this.push('error', summary, detail, options);
  }

  clear(): void {
    this.messageService.clear('global');
  }

  confirmAction(options: ConfirmActionOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.confirmationService.confirm({
        key: 'global-confirm',
        header: options.header,
        message: options.message,
        icon: options.icon ?? 'pi pi-exclamation-triangle',
        acceptLabel: options.acceptLabel ?? 'Confirm',
        rejectLabel: options.rejectLabel ?? 'Cancel',
        acceptButtonStyleClass:
          options.acceptButtonStyleClass ?? 'p-button-danger p-button-sm',
        rejectButtonStyleClass: 'p-button-text p-button-sm',
        closable: false,
        closeOnEscape: false,
        dismissableMask: false,
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }

  private push(
    severity: FeedbackSeverity,
    summary: string,
    detail: string,
    options?: FeedbackMessageOptions,
  ): void {
    this.messageService.add({
      key: 'global',
      severity,
      summary,
      detail,
      life: options?.sticky ? undefined : (options?.life ?? 4200),
      sticky: options?.sticky ?? false,
    });
  }
}