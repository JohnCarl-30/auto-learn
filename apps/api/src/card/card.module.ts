import { Module } from '@nestjs/common';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { CardController } from './card.controller';
import { CardService } from './card.service';

@Module({
  imports: [DictionaryModule],
  controllers: [CardController],
  providers: [CardService],
})
export class CardModule {}
