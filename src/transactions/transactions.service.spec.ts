import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction, TransactionStatus } from './transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockManager = {
  create: jest.Mock;
  save: jest.Mock;
};

const makeMockManager = (): MockManager => ({
  create: jest.fn((_entity, value) => ({ ...value })),
  save: jest.fn((_entity, value) => Promise.resolve({ id: 'generated-id', ...value })),
});

describe('TransactionsService', () => {
  let service: TransactionsService;
  let txRepo: jest.Mocked<Pick<Repository<Transaction>, 'findOne' | 'createQueryBuilder'>>;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
  let walletsService: jest.Mocked<Pick<WalletsService, 'getBalance' | 'adjustBalance'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let mailService: jest.Mocked<Pick<MailService, 'sendTransactionReversalNotice'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;
  let events: jest.Mocked<Pick<EventEmitter2, 'emit'>>;

  beforeEach(() => {
    txRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() } as any;
    dataSource = { transaction: jest.fn() } as any;
    walletsService = { getBalance: jest.fn(), adjustBalance: jest.fn() } as any;
    auditService = { log: jest.fn() } as any;
    mailService = { sendTransactionReversalNotice: jest.fn() } as any;
    usersService = { findById: jest.fn() } as any;
    events = { emit: jest.fn() } as any;

    service = new TransactionsService(
      txRepo as any,
      dataSource as any,
      walletsService as any,
      auditService as any,
      mailService as any,
      usersService as any,
      events as any,
    );
  });

  describe('transfer()', () => {
    const validDto = {
      senderId: 'user-1',
      receiverId: 'user-2',
      amount: 50,
      currency: 'USD',
      reference: 'ref-001',
    };

    it('rejects non-positive amount', async () => {
      await expect(
        service.transfer({ ...validDto, amount: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when sender equals receiver', async () => {
      await expect(
        service.transfer({ ...validDto, senderId: 'same', receiverId: 'same' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when balance is insufficient', async () => {
      walletsService.getBalance.mockResolvedValue({ balance: 10 } as any);
      await expect(service.transfer(validDto)).rejects.toThrow(BadRequestException);
    });

    it('completes transfer and emits event when balance is sufficient', async () => {
      walletsService.getBalance.mockResolvedValue({ balance: 100 } as any);
      walletsService.adjustBalance.mockResolvedValue(undefined as any);

      const manager = makeMockManager();
      dataSource.transaction.mockImplementation((cb: any) => cb(manager));

      const result = await service.transfer(validDto);

      expect(walletsService.adjustBalance).toHaveBeenCalledWith('user-1', 'USD', -50);
      expect(walletsService.adjustBalance).toHaveBeenCalledWith('user-2', 'USD', 50);
      expect(events.emit).toHaveBeenCalledWith('transactions.completed', expect.any(Object));
      expect(result).toMatchObject({ status: TransactionStatus.COMPLETED });
    });
  });

  describe('reverseTransaction()', () => {
    const baseTransaction = {
      id: 'tx-1',
      senderId: 'user-1',
      receiverId: 'user-2',
      amount: 25,
      currency: 'USD',
      reference: 'ref-1',
      status: TransactionStatus.COMPLETED,
      reversedAt: null,
      createdAt: new Date(),
    };

    it('reverses a transaction and restores balances', async () => {
      txRepo.findOne.mockResolvedValue(baseTransaction as any);
      usersService.findById
        .mockResolvedValueOnce({ id: 'user-1', email: 'sender@example.com' } as any)
        .mockResolvedValueOnce({ id: 'user-2', email: 'receiver@example.com' } as any);

      const manager = makeMockManager();
      dataSource.transaction.mockImplementation((cb: any) => cb(manager));

      const result = await service.reverseTransaction('tx-1', {
        reversedBy: 'admin-1',
        reason: 'fraud review',
      });

      expect(result).toMatchObject({
        reversedBy: 'admin-1',
        reversalReason: 'fraud review',
        status: TransactionStatus.REVERSED,
      });
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      txRepo.findOne.mockResolvedValue(null);
      await expect(
        service.reverseTransaction('missing-id', { reversedBy: 'admin-1', reason: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when already reversed', async () => {
      txRepo.findOne.mockResolvedValue({ ...baseTransaction, reversedAt: new Date() } as any);
      await expect(
        service.reverseTransaction('tx-1', { reversedBy: 'admin-1', reason: 'test' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
