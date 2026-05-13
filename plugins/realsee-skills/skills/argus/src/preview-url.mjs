const PREVIEW_BASE_URLS = {
  global: 'https://h5.realsee.ai',
  cn: 'https://h5.realsee.com'
};

export function buildPreviewUrl({ region, previewType, algTaskId }) {
  if (!algTaskId) {
    throw new Error('algTaskId is required');
  }

  if (!previewType) {
    throw new Error('previewType is required');
  }

  if (!Object.hasOwn(PREVIEW_BASE_URLS, region)) {
    throw new Error('Invalid region. Expected "global" or "cn".');
  }

  const encodedPreviewType = encodeURIComponent(previewType);
  const encodedAlgTaskId = encodeURIComponent(algTaskId);

  return `${PREVIEW_BASE_URLS[region]}/argus/${encodedPreviewType}/task/${encodedAlgTaskId}`;
}
