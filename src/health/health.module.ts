import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [TerminusModule, BlockchainModule],
  controllers: [HealthController],
})
export class HealthModule {}
