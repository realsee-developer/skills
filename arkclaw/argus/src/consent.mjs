export function assertUploadConsent({ yes, files, region, service = 'Realsee Argus/VGGT' } = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Upload requires a non-empty files array.');
  }
  if (!region) {
    throw new Error('Upload requires an explicit region.');
  }
  if (yes !== true) {
    throw new Error('Upload consent is required. Re-run with --yes to confirm files may be uploaded.');
  }

  return {
    consented_at: new Date().toISOString(),
    skill: 'argus',
    target: `${service}:${region}`,
    file_count: files.length
  };
}
