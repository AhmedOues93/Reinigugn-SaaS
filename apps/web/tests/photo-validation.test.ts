import { describe, expect, it } from 'vitest';
import { MAX_JOB_PHOTO_SIZE, validateJobPhotoFile } from '../lib/photo-validation';

describe('job photo validation', () => {
  it('rejects non-image MIME types and oversized images', () => {
    expect(validateJobPhotoFile({ type: 'application/pdf', size: 200 })).toContain('JPG');
    expect(validateJobPhotoFile({ type: 'image/jpeg', size: MAX_JOB_PHOTO_SIZE + 1 })).toContain('10 MB');
  });

  it('accepts supported images within the size limit', () => {
    expect(validateJobPhotoFile({ type: 'image/webp', size: 1024 })).toBeNull();
  });
});
