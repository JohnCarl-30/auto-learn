import { Module } from '@nestjs/common';
import { ProposeController } from './propose.controller';
import { ProposeService } from './propose.service';

@Module({
  controllers: [ProposeController],
  providers: [ProposeService],
  // The speaking partner reviews each spoken turn exactly as a paste is
  // reviewed — same prompt, same gate, same session — rather than with a copy.
  exports: [ProposeService],
})
export class ProposeModule {}
