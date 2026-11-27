// Keeping a file on Drive with a Files row (also used by uploads): its
// size is checked, it goes in a folder by month, and the records it is
// filed on are listed with it.

import { AppError } from '../../shared/contract/errors.js';
import { MAX_UPLOAD_BYTES } from '../../shared/intake/kinds.js';
import { base64ToBytes, folderFor, saveFile, sha256Hex } from '../platform.js';
import { dhakaDate } from '../../shared/hr/attendance.js';

// data: the file as base64. Returns the Files row.
export function storeFile(ctx, { name, mime, data }, folder, recordIds = []) {
  const { db } = ctx;
  const bytes = base64ToBytes(data);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError('VALIDATION', {}, { data: { code: 'val.file_too_big', params: { mb: MAX_UPLOAD_BYTES / 1048576 } } });
  const driveId = saveFile(folderFor(`${folder}/${dhakaDate(db.now.getTime()).slice(0, 7)}`), name, mime, bytes);
  return db.insert('Files', {
    drive_id: driveId, name, mime, size: bytes.length, checksum: sha256Hex(bytes), sensitive: false, uploaded_by: ctx.user.id, status: 'active', record_ids: recordIds,
  });
}
