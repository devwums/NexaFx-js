import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminCacheInvalidationService } from './admin-cache-invalidation.service';
import { KeyRotationService } from './key-rotation.service';
import { SystemAdminController } from '../modules/admin/controllers/system-admin.controller';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';
import { SecurityModule } from '../common/security.module';
import { EncryptionModule } from '../common/encryption/encryption.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Transaction,
      KycDocument,
      SupportTicket,
      WebhookEndpoint,
      AmlAlert,
      WalletBalanceEntity,
    ]),
    SecurityModule,
    EncryptionModule,
    HttpModule,
  ],
  controllers: [AdminController, SystemAdminController],
  providers: [AdminService, AdminCacheInvalidationService, KeyRotationService],
  exports: [AdminService],
})
export class AdminModule {}
