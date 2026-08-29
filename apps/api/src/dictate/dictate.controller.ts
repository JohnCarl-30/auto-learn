import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  MAX_RECORDING_BYTES,
  isAudioMediaType,
  type ApiError,
  type DictateResponse,
} from '@auto-learn/shared';
import { RATE_LIMITS } from '../common/rate-limit';
import { UploadErrorFilter } from './upload-error.filter';
import { DictateService } from './dictate.service';

@Controller('dictate')
@UseFilters(UploadErrorFilter)
export class DictateController {
  constructor(private readonly service: DictateService) {}

  /**
   * Multipart rather than the JSON every other route here takes.
   *
   * Uniformity loses exactly once, and this is it. Base64 in JSON would mean
   * raising the body limit globally — a twenty-fold buffer increase on
   * /propose, the one route whose entire design is about bounding what a single
   * request can cost. Multipart bounds the size here and nowhere else, and
   * leaves the JSON parser's 100kb default in place for everything.
   */
  @Throttle({ default: RATE_LIMITS.dictate })
  @Post()
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: MAX_RECORDING_BYTES, files: 1 },
      fileFilter: (_request, file, callback) =>
        callback(null, isAudioMediaType(file.mimetype)),
    }),
  )
  dictate(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DictateResponse> {
    // Absent either because nothing was sent, or because fileFilter rejected
    // what was — both are the caller sending something we cannot read.
    if (!file?.buffer?.length) {
      throw new HttpException(
        {
          code: 'invalid_request',
          message: "That doesn't look like a recording I can read.",
        } satisfies ApiError,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.service.dictate(new Uint8Array(file.buffer));
  }
}
